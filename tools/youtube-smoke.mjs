// Optional anonymous public-site smoke check, separate from the local suite.
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(new URL('../', import.meta.url).pathname);
const profile = await mkdtemp(resolve(tmpdir(), 'tempo-youtube-'));
let browser;
try {
  browser = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
  const id = new URL(worker.url()).hostname;
  const page = await browser.newPage();
  await page.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('video', { state: 'attached', timeout: 20000 });
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({})).find(tab => tab.url?.startsWith('https://www.youtube.com/watch')).id);
  const controls = await browser.newPage();
  await controls.goto(`chrome-extension://${id}/src/popup.html`);
  const result = await controls.evaluate(async tabId => await chrome.runtime.sendMessage({ type: 'TEMPO_UPDATE', tabId, action: 'speed', speed: 2.7 }), tabId);
  if (!result.ok) throw new Error(result.error);
  await page.waitForFunction(() => document.querySelector('video')?.playbackRate === 2.7, null, { timeout: 15000 });
  await page.evaluate(async () => { const video=document.querySelector('video');video.muted=true;await video.play(); });
  const before = await page.evaluate(() => document.querySelector('video').currentTime);
  await page.waitForTimeout(900);
  const details = await page.evaluate(() => {
    const video = document.querySelector('video');
    return { playbackRate: video.playbackRate, defaultPlaybackRate: video.defaultPlaybackRate,
      readyState: video.readyState, mediaLoaded: Boolean(video.currentSrc), paused: video.paused, currentTime: video.currentTime };
  });
  console.log(JSON.stringify({ site: 'YouTube public watch page', ...details, progressed: details.currentTime > before }));
  if (details.paused || details.currentTime <= before) throw new Error('Video rate accepted, but active playback was not verified.');
  await controls.evaluate(async tabId => await chrome.runtime.sendMessage({type:'TEMPO_UPDATE',tabId,action:'speed',speed:1}),tabId);
  await page.waitForFunction(() => document.querySelector('video').playbackRate === 1);
  console.log('PASS: active playback at 2.7× and reset to 1× on a public YouTube watch page.');
} catch (error) {
  console.log(`Live YouTube verification unavailable: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await rm(profile, { recursive: true, force: true });
}
