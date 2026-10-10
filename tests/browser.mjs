// Real MV3 browser integration, optional Playwright development dependency.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(new URL('../',import.meta.url).pathname);
const profile = resolve(root,'tests/browser-profile');
const artifacts = resolve(root,'tests/artifacts');
const server = createServer(async (request,response) => {
  const path = new URL(request.url,'http://localhost').pathname;
  const name = ['fixture.html','fixture.js','fixture.css'].find(file => path === `/${file}`);
  if (!name) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', {'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(name)]);
  response.end(await readFile(resolve(root,'tests',name)));
});
await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
const { port } = server.address();
await mkdir(artifacts,{recursive:true});
await rm(profile,{recursive:true,force:true});
let browser;
let passed = 0;
const check = (name) => { console.log(`PASS ${++passed}: ${name}`); };
try {
  browser = await chromium.launchPersistentContext(profile,{
    headless:true,
    ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {}),
    args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]
  });
  const worker = browser.serviceWorkers()[0] || await browser.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).hostname;
  const page = await browser.newPage();
  const errors=[];
  page.on('pageerror',error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/fixture.html`);
  await page.waitForFunction(() => window.fixtureReady);
  await page.evaluate(async () => { primary.loop=true;primary.volume=0.4;await primary.play(); });
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({})).find(tab => tab.url?.includes('127.0.0.1')).id);
  const popup = await browser.newPage();
  await popup.setViewportSize({width:368,height:760});
  popup.on('pageerror',error => errors.push(error.message));
  await popup.addInitScript(id => {
    const original = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async query => query.active ? [await chrome.tabs.get(id)] : original(query);
  },tabId);
  await popup.goto(`chrome-extension://${extensionId}/src/popup.html`);
  await popup.waitForFunction(() => document.querySelector('#site').textContent === '127.0.0.1');
  async function speed(value) {
    await popup.locator('#speed-number').fill(String(value));
    await popup.locator('#speed-number').press('Tab');
    await page.waitForFunction(value => [...document.querySelectorAll('video')].every(video => video.playbackRate === value && video.defaultPlaybackRate === value),value);
  }
  async function rates(value) { await page.waitForFunction(value => [...document.querySelectorAll('video')].every(video => video.playbackRate === value),value); }
  await speed(2.7); check('2.7× applied immediately to both real HTML5 players');
  assert.equal(await page.locator('#primary').evaluate(video=>video.paused),false);
  assert.equal(await page.locator('#primary').evaluate(video=>video.volume),0.4);
  assert.equal(await page.locator('#secondary').evaluate(video=>video.paused),true);
  check('active playback, paused secondary video and volume are preserved');
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('set to 2.7'));
  await popup.locator('body').screenshot({path:resolve(artifacts,'popup.png')});
  await page.locator('#navigate').click(); await rates(2.7); check('SPA navigation and replaced media preserve speed');
  await page.evaluate(() => { primary.playbackRate=1; primary.src=media; primary.load(); });
  await page.waitForFunction(() => primary.readyState >= 1 && primary.playbackRate === 2.7);
  check('metadata/source change reapplies speed without replacing the element');
  await page.locator('#add').click(); await rates(2.7); check('dynamically inserted video receives the requested speed');
  await speed(1.35); check('exact custom speed 1.35×');
  await page.locator('#shadow').click();
  await page.waitForFunction(() => [...document.querySelector('#players').children].some(host => host.shadowRoot?.querySelector('video')?.playbackRate === 1.35));
  check('open shadow DOM video is controlled');
  await page.locator('#late-shadow').click();
  await page.waitForFunction(() => document.querySelector('#late-host').shadowRoot?.querySelector('video'));
  await page.evaluate(() => document.querySelector('#late-host').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true})));
  await page.waitForFunction(() => document.querySelector('#late-host').shadowRoot.querySelector('video').playbackRate === 1.35);
  check('interaction discovers a delayed open shadow root');
  await page.locator('#frame').click();
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow !== null);
  const frame = page.frames().find(frame => frame.url().includes('localhost')) || await new Promise(resolve => page.on('framenavigated',frame => {if(frame.url().includes('localhost'))resolve(frame);}));
  await frame.waitForFunction(() => window.fixtureReady && [...document.querySelectorAll('video')].every(video => video.playbackRate === 1.35));
  check('cross-origin iframe inherits the top website speed');
  await page.evaluate(() => {const frame=document.createElement('iframe');frame.id='blank-frame';frame.srcdoc='<video controls></video>';document.querySelector('#players').append(frame);});
  await page.waitForFunction(() => document.querySelector('#blank-frame').contentDocument?.querySelector('video')?.playbackRate === 1.35);
  check('related srcdoc iframe receives the parent website preference');
  const inactive=await browser.newPage();await inactive.goto(`http://localhost:${port}/fixture.html`);
  await inactive.waitForFunction(() => window.fixtureReady && document.querySelector('video').playbackRate === 1.35);
  await popup.bringToFront();await speed(2.7);
  await inactive.waitForFunction(() => document.querySelector('video').playbackRate === 2.7);
  check('global changes reach inactive tabs');
  await inactive.close();await speed(1.35);
  await popup.locator('#mode-site').click();
  await popup.locator('#remember').check();
  await speed(3.5);
  await frame.waitForFunction(() => document.querySelector('video').playbackRate === 3.5);
  check('remembered 3.5× site setting reaches cross-origin players');
  const other = await browser.newPage(); await other.goto(`http://localhost:${port}/fixture.html`);
  await other.waitForFunction(() => window.fixtureReady && document.querySelector('video').playbackRate === 1.35);
  check('a different website uses the separate global default');
  await page.reload(); await page.waitForFunction(() => window.fixtureReady); await rates(3.5);
  check('site preference survives full navigation');
  await popup.locator('#remember').uncheck(); await speed(2.75);
  await page.reload(); await page.waitForFunction(() => window.fixtureReady); await rates(2.75);
  check('unremembered temporary speed survives same-site navigation');
  // Only preferences and session override survive; no background global caches.
  const cdp = await browser.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await speed(4.5); check('suspended service worker resumes with correct preferences');
  await popup.locator('#reset').click(); await rates(1); check('reset restores 1×');
  await speed(5); await popup.locator('#increase').click({force:true}); await rates(5);
  await speed(0.5); await popup.locator('#decrease').click({force:true}); await rates(0.5);
  check('range endpoints clamp without overshoot');
  await speed(4); await page.locator('#reject').click();
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('rejected or repeatedly reset'),null,{timeout:10000});
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#primary').evaluate(video => video.playbackRate),1);
  check('hostile player stops corrections and displays an informative warning');
  await page.evaluate(() => {window.rateEvents=0;primary.addEventListener('ratechange',()=>window.rateEvents++);});
  await popup.locator('#default-speed').fill('1.5');await popup.locator('#default-speed').press('Tab');
  await popup.waitForFunction(() => document.querySelector('#saved').textContent !== 'Saving…');
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.rateEvents),0);
  check('unrelated default changes do not restart a blocked player');
  await page.locator('#reject').click(); await speed(2.7); check('explicit request recovers after the player releases control');
  await popup.locator('#speed-number').fill('9'); await popup.locator('#speed-number').press('Tab');
  await rates(2.7); assert.equal(await popup.locator('#input-error').isVisible(),true);
  check('invalid numeric input leaves the last valid speed intact');
  await speed(2); await popup.locator('#remember').check();
  await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('set to 2×'));
  await popup.locator('#settings').evaluate(details => {details.open=true;});
  await popup.locator('body').screenshot({path:resolve(artifacts,'popup-settings.png')});
  await popup.emulateMedia({colorScheme:'dark'});
  await popup.waitForTimeout(200); // Finish the intentional theme transition.
  await popup.locator('body').screenshot({path:resolve(artifacts,'popup-dark.png')});
  const stored = await popup.evaluate(async () => (await chrome.storage.local.get('preferences')).preferences);
  assert.equal(stored.sites['127.0.0.1'],2);
  assert.equal(stored.sites.localhost,undefined);
  assert.equal(errors.length,0,errors.join('\n'));
  check('only host-keyed preferences persist; no page runtime errors');
  // Dispatch input then close in the same event turn, before the debounce fires.
  await popup.evaluate(() => {
    const field=document.querySelector('#speed-number');field.value='2.75';field.dispatchEvent(new Event('input',{bubbles:true}));
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
  });
  await popup.close();await rates(2.75);
  check('closing the popup flushes a pending precise speed selection');
  await browser.close(); browser = null;
  browser = await chromium.launchPersistentContext(profile,{headless:true,
    ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {}),
    args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
  const reopened = await browser.newPage(); await reopened.goto(`http://127.0.0.1:${port}/fixture.html`);
  await reopened.waitForFunction(() => window.fixtureReady && document.querySelector('#primary').playbackRate === 2.75);
  check('remembered website preference survives closing and reopening Chromium');
  console.log(`All ${passed} browser scenarios passed. Screenshots: ${artifacts}`);
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  await rm(profile,{recursive:true,force:true});
}
