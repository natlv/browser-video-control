(() => {
  'use strict';
  if (globalThis.__tempoController?.alive) return;
  const videos = new Map();
  const roots = new Map();
  const pending = new Set();
  let context = null;
  let disposed = false;
  let scanTimer = null;
  let reportTimer = null;
  let lastReport = '';
  let overlay = null;
  let overlayTimer = null;
  const closeEnough = (a, b) => Math.abs(a - b) < 0.000001;
  function invalidated(error) {
    if (!chrome.runtime?.id || /context invalidated/i.test(error?.message || '')) dispose();
  }

  function report() {
    prune();
    const records = [...videos.entries()];
    const playing = records.filter(([video]) => !video.paused && !video.ended);
    return {
      total: records.length,
      playing: playing.length,
      matched: context ? records.filter(([video]) => closeEnough(video.playbackRate, context.speed)).length : 0,
      blocked: records.filter(([, record]) => record.blocked).length,
      activeRates: [...new Set(playing.map(([video]) => video.playbackRate))],
      ready: Boolean(context),
      requested: context?.speed ?? null
    };
  }
  function changed() {
    if (reportTimer || disposed) return;
    reportTimer = setTimeout(() => {
      reportTimer = null;
      const signature = JSON.stringify(report());
      if (signature === lastReport) return;
      lastReport = signature;
      try { chrome.runtime.sendMessage({ type: 'TEMPO_REPORT' }).catch(invalidated); }
      catch { dispose(); }
    }, 150);
  }
  function clearRetry(record) {
    clearTimeout(record.timer);
    record.timer = null;
  }
  function apply(video, record) {
    if (!context || record.blocked || disposed || !video.isConnected) return;
    try {
      if (!closeEnough(video.defaultPlaybackRate, context.speed)) video.defaultPlaybackRate = context.speed;
      if (!closeEnough(video.playbackRate, context.speed)) video.playbackRate = context.speed;
      if (!closeEnough(video.playbackRate, context.speed)) record.blocked = true;
    } catch { record.blocked = true; }
    changed();
  }
  function handleRateChange(video, record) {
    changed();
    if (!context || record.blocked || closeEnough(video.playbackRate, context.speed) || record.timer) return;
    // A player can fight our ratechange events. Stop after four corrections in
    // two seconds, until an explicit speed change or new media source occurs.
    const now = performance.now();
    record.retries = record.retries.filter(time => now - time < 2000);
    if (record.retries.length >= 4) {
      record.blocked = true;
      changed();
      return;
    }
    record.retries.push(now);
    record.timer = setTimeout(() => {
      record.timer = null;
      apply(video, record);
    }, 80);
  }
  function track(video) {
    if (videos.has(video)) return;
    const record = { blocked: false, retries: [], timer: null, listeners: [] };
    videos.set(video, record);
    function listen(name, callback) {
      video.addEventListener(name, callback);
      record.listeners.push([name, callback]);
    }
    listen('ratechange', () => handleRateChange(video, record));
    for (const event of ['loadedmetadata', 'emptied']) {
      listen(event, () => {
        clearRetry(record);
        record.blocked = false;
        record.retries = [];
        apply(video, record);
      });
    }
    for (const event of ['play', 'playing']) listen(event, () => { apply(video, record); changed(); });
    for (const event of ['pause', 'ended']) listen(event, changed);
    apply(video, record);
    changed();
  }
  function untrack(video, record) {
    clearRetry(record);
    for (const [event, callback] of record.listeners) video.removeEventListener(event, callback);
    videos.delete(video);
  }
  function prune() {
    for (const [video, record] of videos) if (!video.isConnected) untrack(video, record);
    for (const [root, observer] of roots) {
      if (root.host && !root.host.isConnected) { observer.disconnect(); roots.delete(root); }
    }
  }
  function watch(root) {
    if (roots.has(root)) return;
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) pending.add(node);
      }
      scheduleScan(); // Also releases detached media/shadow-root listeners.
    });
    observer.observe(root, { childList: true, subtree: true });
    roots.set(root, observer);
  }
  function visit(element) {
    if (element.localName === 'video') track(element);
    if (element.shadowRoot) scan(element.shadowRoot);
  }
  function scan(root) {
    if (disposed) return;
    if (root.nodeType === Node.DOCUMENT_NODE || root.host) watch(root);
    if (root.nodeType === Node.ELEMENT_NODE) visit(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let element;
    while ((element = walker.nextNode())) visit(element);
  }
  function scheduleScan() {
    if (scanTimer || disposed) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      const nodes = [...pending];
      const pendingNodes = new Set(nodes);
      pending.clear();
      for (const node of nodes) {
        let ancestor = node.parentNode;
        let covered = false;
        while (ancestor) {
          if (nodes.length > 1 && pendingNodes.has(ancestor)) { covered = true; break; }
          ancestor = ancestor.parentNode;
        }
        if (node.isConnected && !covered) scan(node);
      }
      prune();
      changed();
    }, 50);
  }
  function showIndicator() {
    if (!context?.indicator || document.visibilityState === 'hidden') return;
    const candidates = [...videos.keys()].filter(video => !video.paused && !video.ended).map(video => ({ video, rect: video.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 80 && rect.height > 45 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
    if (!candidates.length) return;
    overlay?.remove();
    clearTimeout(overlayTimer);
    const { rect } = candidates[0];
    overlay = document.createElement('div');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = `position:fixed;top:${Math.max(12, rect.top + 14)}px;left:${Math.max(12, rect.left + 14)}px;z-index:2147483647;pointer-events:none;`;
    const shadow = overlay.attachShadow({ mode: 'closed' });
    const badge = document.createElement('span');
    badge.textContent = `${Number(context.speed.toFixed(6))}×`;
    badge.style.cssText = 'display:block;padding:9px 13px;border-radius:10px;background:rgba(18,24,39,.9);color:#fff;font:600 16px system-ui,sans-serif;box-shadow:0 3px 18px #0004;';
    shadow.append(badge);
    const fullscreen = document.fullscreenElement;
    (fullscreen && fullscreen.localName !== 'video' ? fullscreen : document.documentElement)?.append(overlay);
    overlayTimer = setTimeout(() => { overlay?.remove(); overlay = null; }, 1100);
  }
  function accept(next, indicator = false, force = false) {
    if (!next || typeof next.speed !== 'number' || !Number.isFinite(next.speed) || next.speed < 0.5 || next.speed > 5) return;
    if (context && next.revision < context.revision) return;
    const newRequest = !context || next.speed !== context.speed || next.site !== context.site || force;
    context = next;
    if (newRequest) {
      for (const [video, record] of videos) {
        clearRetry(record);
        record.blocked = false;
        record.retries = [];
        apply(video, record);
      }
    }
    if (indicator) showIndicator();
    changed();
  }
  function receive(message, sender, respond) {
    if (sender.id !== chrome.runtime.id || message?.type !== 'TEMPO_CONTEXT') return false;
    accept(message.context, message.indicator, message.force);
    respond({ ok: true });
    return false;
  }
  async function refresh() {
    if (disposed) return;
    try {
      const result = await chrome.runtime.sendMessage({ type: 'TEMPO_GET' });
      if (result?.ok) accept(result.context);
    } catch (error) { invalidated(error); }
  }
  function onPageShow() { scan(document); refresh(); }
  function onVisibility() {
    if (document.visibilityState === 'visible') { scan(document); refresh(); }
  }
  function onInteraction(event) {
    // Discover open roots attached to an existing host between DOM mutations.
    for (const node of event.composedPath()) if (node.shadowRoot && !roots.has(node.shadowRoot)) scan(node.shadowRoot);
  }
  function dispose() {
    disposed = true;
    for (const observer of roots.values()) observer.disconnect();
    roots.clear();
    for (const [video, record] of videos) untrack(video, record);
    clearTimeout(scanTimer); clearTimeout(reportTimer); clearTimeout(overlayTimer);
    overlay?.remove();
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('pointerdown', onInteraction, true);
    try { chrome.runtime.onMessage.removeListener(receive); } catch { /* invalidated context */ }
  }
  globalThis.__tempoController = Object.freeze({ report, rescan: () => scan(document), get alive() { return !disposed; } });
  chrome.runtime.onMessage.addListener(receive);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('pointerdown', onInteraction, true);
  scan(document);
  refresh();
})();
