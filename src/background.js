import { sanitizePreferences, resolveContext, normalizeSpeed, stepSpeed, siteKey } from './settings.js';

// Every mutation and read runs through one queue. Chrome may suspend the worker;
// only the work queue lives in memory, never authoritative settings.
let queue = Promise.resolve();
function serial(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}
async function readState() {
  const [local, session] = await Promise.all([
    chrome.storage.local.get('preferences'), chrome.storage.session.get(['temporary', 'revision'])
  ]);
  return { preferences: sanitizePreferences(local.preferences), temporary: session.temporary || {}, revision: session.revision || 0 };
}
function contextFor(state, tab) {
  return resolveContext(state.preferences, state.temporary[tab.id], tab, state.revision);
}
async function saveState(state) {
  state.revision += 1;
  await chrome.storage.local.set({ preferences: state.preferences });
  await chrome.storage.session.set({ temporary: state.temporary, revision: state.revision });
}
async function sendContext(tab, state, indicator = false, force = false) {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TEMPO_CONTEXT', context: contextFor(state, tab), indicator, force });
  } catch { /* No accessible frames or tab closed. Preferences still saved. */ }
}
function notify(tabId, type = 'refresh') {
  // One-off messages survive worker restarts without reconnecting a stale port.
  chrome.runtime.sendMessage({ type: 'TEMPO_CHANGED', tabId, kind: type }).catch(() => {});
}
async function broadcast(state, originTab, indicator = false, force = false) {
  const tabs = await chrome.tabs.query({});
  // Global changes and website preferences affect other open/inactive tabs, too.
  await Promise.allSettled(tabs.filter(tab => siteKey(tab.url) !== null).map(async tab => {
    await sendContext(tab, state, indicator && tab.id === originTab?.id, force && tab.id === originTab?.id);
    notify(tab.id);
  }));
}
async function getTab(id, sender) {
  if (sender.tab && !isExtensionPage(sender)) return chrome.tabs.get(sender.tab.id);
  if (!Number.isInteger(id)) throw new Error('No active tab is available.');
  return chrome.tabs.get(id);
}
function isExtensionPage(sender) {
  return sender.url?.startsWith(chrome.runtime.getURL('')) === true;
}

async function update(message, tab) {
  const state = await readState();
  const context = contextFor(state, tab);
  const { preferences, temporary } = state;
  const site = context.site;
  switch (message.action) {
    case 'speed': {
      const speed = normalizeSpeed(message.speed);
      if (preferences.mode === 'global') preferences.globalSpeed = speed;
      else if (!site) throw new Error('This page cannot have a website preference.');
      else if (context.remembered) {
        preferences.sites[site] = speed;
        for (const [id, value] of Object.entries(temporary)) if (value.site === site) delete temporary[id];
      } else temporary[tab.id] = { site, speed };
      break;
    }
    case 'mode':
      if (!['global', 'site'].includes(message.mode)) throw new Error('Unknown preference mode.');
      preferences.mode = message.mode;
      break;
    case 'remember':
      if (!site) throw new Error('This page cannot have a website preference.');
      if (message.remember === true) {
        preferences.sites[site] = context.speed;
        for (const [id, value] of Object.entries(temporary)) if (value.site === site) delete temporary[id];
      } else {
        delete preferences.sites[site];
        temporary[tab.id] = { site, speed: context.speed };
      }
      break;
    case 'default': preferences.globalSpeed = normalizeSpeed(message.speed); break;
    case 'indicator': preferences.indicator = message.enabled === true; break;
    case 'forget-sites':
      preferences.sites = Object.create(null);
      for (const id of Object.keys(temporary)) delete temporary[id];
      break;
    default: throw new Error('Unknown setting.');
  }
  await saveState(state);
  await broadcast(state, tab, message.indicator === true, message.action === 'speed');
  return { ok: true, context: contextFor(state, tab) };
}

async function probe(tab) {
  if (!siteKey(tab.url)) return { frames: [], inaccessible: true };
  try {
    // Also enables already-open pages after installation; idempotent per frame.
    await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['src/content.js'] });
  } catch { /* Probe accessible controllers even if one frame refused injection. */ }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => {
        globalThis.__tempoController?.rescan();
        return globalThis.__tempoController?.report() ?? null;
      }
    });
    return { frames: results.filter(result => result.result).map(result => ({ frameId: result.frameId, ...result.result })), inaccessible: false };
  } catch {
    // A restricted child frame must not hide a controllable top-level player.
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        func: () => globalThis.__tempoController?.report() ?? null
      });
      if (result?.result) return { frames: [{ frameId: 0, ...result.result }], inaccessible: false, partial: true };
    } catch { /* Chrome-protected page or host access denied. */ }
    return { frames: [], inaccessible: true };
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== 'string') return false;
  if (message.type === 'TEMPO_REPORT' && sender.tab) {
    notify(sender.tab.id, 'status'); // Aggregate on demand; never store viewing data.
    return false;
  }
  if (!['TEMPO_GET', 'TEMPO_UPDATE', 'TEMPO_STATUS'].includes(message.type)) return false;
  if (message.type !== 'TEMPO_GET' && !isExtensionPage(sender)) return false;
  serial(async () => {
    const tab = await getTab(message.tabId, sender);
    if (message.type === 'TEMPO_UPDATE') return update(message, tab);
    if (message.type === 'TEMPO_STATUS') return { ok: true, ...await probe(tab) };
    return { ok: true, context: contextFor(await readState(), tab) };
  }).then(respond, error => respond({ ok: false, error: error.message || 'Unable to update Tempo.' }));
  return true;
});

chrome.commands.onCommand.addListener((command, commandTab) => {
  if (!['increase-speed', 'decrease-speed', 'reset-speed'].includes(command)) return;
  serial(async () => {
    const tab = commandTab?.id ? await chrome.tabs.get(commandTab.id)
      : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (!tab || !siteKey(tab.url)) return;
    const state = await readState();
    const current = contextFor(state, tab).speed;
    const speed = command === 'reset-speed' ? 1 : stepSpeed(current, command === 'increase-speed' ? 1 : -1);
    // Recover pre-installation pages, without opening the popup.
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['src/content.js'] }); } catch { /* restricted */ }
    await update({ action: 'speed', speed, indicator: true }, tab);
  }).catch(error => console.warn('Tempo shortcut:', error.message));
});

chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (!change.url && change.status !== 'complete') return;
  serial(async () => {
    const state = await readState();
    const saved = state.temporary[id];
    if (saved && saved.site !== siteKey(tab.url)) {
      delete state.temporary[id];
      await chrome.storage.session.set({ temporary: state.temporary });
    }
    await sendContext(tab, state);
    notify(id);
  }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(id => {
  serial(async () => {
    const state = await readState();
    if (Object.hasOwn(state.temporary, id)) {
      delete state.temporary[id];
      await chrome.storage.session.set({ temporary: state.temporary });
    }
  }).catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  serial(async () => {
    // Preferences are deliberately local to this profile and not cloud-synced.
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    const state = await readState();
    await chrome.storage.local.set({ preferences: state.preferences });
    const tabs = await chrome.tabs.query({});
    const alive = new Set(tabs.map(tab => String(tab.id)));
    for (const id of Object.keys(state.temporary)) if (!alive.has(id)) delete state.temporary[id];
    await chrome.storage.session.set({ temporary: state.temporary });
  }).catch(error => console.warn('Tempo initialization:', error.message));
});
