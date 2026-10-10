import { formatSpeed, validSpeed, stepSpeed } from './settings.js';

const $ = id => document.getElementById(id);
let tabId = null;
let context = null;
let displayedSpeed = 1;
let pendingSpeed = null;
let speedTimer = null;
let statusTimer = null;
let busy = 0;
let closed = false;

async function request(message) {
  const result = await chrome.runtime.sendMessage({ ...message, tabId });
  if (!result?.ok) throw new Error(result?.error || 'Tempo could not connect. Reopen the popup to try again.');
  return result;
}
function error(text) {
  $('input-error').textContent = text;
  $('input-error').hidden = !text;
}
function paintSpeed(value, updateNumber = true) {
  displayedSpeed = value;
  $('speed-display').replaceChildren(document.createTextNode(formatSpeed(value).slice(0, -1)));
  const unit = document.createElement('span'); unit.textContent = '×'; $('speed-display').append(unit);
  // Exact custom values needn't land on a slider tick; the number remains exact.
  $('speed-slider').value = value;
  $('speed-slider').style.background = `linear-gradient(to right,var(--accent) ${(value - 0.5) / 4.5 * 100}%,var(--line) ${(value - 0.5) / 4.5 * 100}%)`;
  if (updateNumber) $('speed-number').value = value;
  $('decrease').disabled = value <= 0.5;
  $('increase').disabled = value >= 5;
  for (const button of document.querySelectorAll('[data-speed]')) button.setAttribute('aria-pressed', String(Math.abs(Number(button.dataset.speed) - value) < 1e-6));
  // Keep longer custom speeds within the popup width.
  $('speed-display').style.fontSize = String(value).length > 6 ? '42px' : '62px';
}
function render(next) {
  if (context && next.revision < context.revision) return;
  context = next;
  $('site').textContent = next.site === 'local-files' ? 'Local video files' : next.site || 'Browser page';
  if (!busy && pendingSpeed === null) paintSpeed(next.speed, document.activeElement !== $('speed-number'));
  const siteMode = next.mode === 'site';
  $('mode-global').setAttribute('aria-pressed', String(!siteMode));
  $('mode-site').setAttribute('aria-pressed', String(siteMode));
  $('remember').disabled = !siteMode || !next.site;
  $('remember').checked = next.remembered;
  $('default-row').hidden = !siteMode;
  if (document.activeElement !== $('default-speed')) $('default-speed').value = next.globalSpeed;
  $('indicator').checked = next.indicator;
  $('scope-description').textContent = !siteMode ? 'One saved speed, everywhere.' : next.remembered
    ? 'Saved for this website, including embedded players.'
    : 'Temporary for this tab. Other websites use the default.';
  if (!busy) $('saved').textContent = next.source === 'session' ? 'Tab only' : 'Saved';
}
function queueUpdate(action, values = {}) {
  busy += 1;
  $('saved').textContent = 'Saving…';
  // Send immediately; the worker already serializes writes. Queuing promises
  // here could lose a final selection when Chrome destroys a closing popup.
  const task = request({ type: 'TEMPO_UPDATE', action, ...values }).then(result => {
    render(result.context);
  });
  return task.catch(err => { error(err.message); $('saved').textContent = 'Not saved'; }).finally(() => {
    busy -= 1;
    if (!busy) {
      if (context && pendingSpeed === null) paintSpeed(context.speed, document.activeElement !== $('speed-number'));
      if ($('input-error').hidden) $('saved').textContent = context?.source === 'session' ? 'Tab only' : 'Saved';
      scheduleStatus();
    }
  });
}
function flushSpeed() {
  clearTimeout(speedTimer);
  speedTimer = null;
  if (pendingSpeed === null) return;
  const speed = pendingSpeed; pendingSpeed = null;
  queueUpdate('speed', { speed });
}
function setSpeed(value, updateNumber = true, immediate = true) {
  if (!validSpeed(value)) { error('Enter a speed between 0.5 and 5.'); return; }
  error('');
  paintSpeed(value, updateNumber);
  pendingSpeed = value;
  clearTimeout(speedTimer);
  if (immediate) flushSpeed(); else speedTimer = setTimeout(flushSpeed, 75);
}
function scheduleStatus() {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(refreshStatus, 180);
}
function setStatus(text, state = '') {
  $('status').textContent = text;
  $('status').parentElement.dataset.state = state;
}
async function refreshStatus() {
  if (closed || tabId === null) return;
  try {
    const data = await request({ type: 'TEMPO_STATUS' });
    if (data.inaccessible) {
      setStatus(context?.site ? 'Chrome blocked access. Allow Tempo on this site in the extension’s site access settings. Local files need “Allow access to file URLs”.' : 'Chrome protects this page. Open a website with an HTML5 video.', 'warning');
      return;
    }
    const sum = field => data.frames.reduce((total, frame) => total + frame[field], 0);
    const total = sum('total'); const blocked = sum('blocked'); const matched = sum('matched');
    const playing = sum('playing');
    if (!total) setStatus('No HTML5 video found yet. Embedded or proprietary players may be inaccessible.');
    else if (blocked) setStatus(`${blocked} of ${total} video${total === 1 ? '' : 's'} rejected or repeatedly reset this speed. Try a lower speed; the player may enforce a limit.`, 'warning');
    else if (matched < total || data.frames.some(frame => !frame.ready || frame.requested !== context?.speed)) setStatus(`Applying to ${total} video${total === 1 ? '' : 's'}…`);
    else setStatus(`${total} video${total === 1 ? '' : 's'} set to ${formatSpeed(context?.speed || displayedSpeed)}${playing ? ` · ${playing} playing` : ' · ready to play'}${data.partial ? '. Some embedded frames are inaccessible.' : ''}`, data.partial ? 'warning' : 'success');
  } catch (err) { setStatus(err.message, 'warning'); }
}
async function refreshContext() {
  try { render((await request({ type: 'TEMPO_GET' })).context); scheduleStatus(); }
  catch (err) { error(err.message); }
}

$('speed-slider').addEventListener('input', event => setSpeed(Number(event.target.value), true, false));
$('speed-slider').addEventListener('change', flushSpeed);
$('speed-number').addEventListener('input', event => {
  if (!event.target.value || event.target.validity.badInput) return;
  setSpeed(Number(event.target.value), false, false);
});
$('speed-number').addEventListener('change', () => {
  const value = $('speed-number').valueAsNumber;
  if (validSpeed(value)) { setSpeed(value); } else { error('Enter a speed between 0.5 and 5.'); }
});
$('speed-number').addEventListener('keydown', event => {
  if (event.key === 'Enter') { $('speed-number').blur(); flushSpeed(); }
});
$('decrease').addEventListener('click', () => setSpeed(stepSpeed(displayedSpeed, -1)));
$('increase').addEventListener('click', () => setSpeed(stepSpeed(displayedSpeed, 1)));
$('reset').addEventListener('click', () => setSpeed(1));
for (const button of document.querySelectorAll('[data-speed]')) button.addEventListener('click', () => setSpeed(Number(button.dataset.speed)));
for (const mode of ['global', 'site']) $( `mode-${mode}`).addEventListener('click', () => { error(''); flushSpeed(); queueUpdate('mode', { mode }); });
$('remember').addEventListener('change', event => { error(''); flushSpeed(); queueUpdate('remember', { remember: event.target.checked }); });
$('default-speed').addEventListener('change', event => {
  const speed = event.target.valueAsNumber;
  if (!validSpeed(speed)) { error('The default must be between 0.5 and 5.'); return; }
  error(''); flushSpeed(); queueUpdate('default', { speed });
});
$('indicator').addEventListener('change', event => { error(''); queueUpdate('indicator', { enabled: event.target.checked }); });
$('forget-sites').addEventListener('click', () => { error(''); flushSpeed(); queueUpdate('forget-sites'); });
$('configure-shortcuts').addEventListener('click', () => { chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }).catch(err => error(err.message)); });
function onNotification(message, sender) {
  if (sender.id !== chrome.runtime.id || message?.type !== 'TEMPO_CHANGED' || message.tabId !== tabId) return;
  if (message.kind === 'refresh') refreshContext(); else scheduleStatus();
}
chrome.runtime.onMessage.addListener(onNotification);
window.addEventListener('pagehide', () => { flushSpeed(); closed = true; clearTimeout(statusTimer); chrome.runtime.onMessage.removeListener(onNotification); });

async function initialize() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) throw new Error('No active tab is available.');
    tabId = tabs[0].id;
    await refreshContext();
    const labels = { 'increase-speed': 'Increase 0.1×', 'decrease-speed': 'Decrease 0.1×', 'reset-speed': 'Reset to 1×' };
    for (const command of await chrome.commands.getAll()) {
      if (!labels[command.name]) continue;
      const row = document.createElement('div'); row.className = 'shortcut-row';
      const label = document.createElement('span'); label.textContent = labels[command.name];
      const key = document.createElement('kbd'); key.textContent = command.shortcut || 'Unassigned';
      row.append(label, key); $('shortcuts').append(row);
    }
  } catch (err) {
    error(err.message);
    for (const input of document.querySelectorAll('input, button')) input.disabled = true;
  }
}
initialize();
