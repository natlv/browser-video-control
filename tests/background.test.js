import test from 'node:test';
import assert from 'node:assert/strict';

let sequence = 0;
async function harness(local = {}, session = {}) {
  const events = {};
  const messages = [];
  const tabs = [{id:1,url:'https://canvas.example.edu/lesson/1'},{id:2,url:'https://video.example.org/player'},{id:3,url:'https://canvas.example.edu/lesson/2'}];
  const event = name => ({ addListener: callback => {events[name] = callback;} });
  const area = data => ({
    get: async () => structuredClone(data),
    set: async values => {await new Promise(resolve => setTimeout(resolve,2)); Object.assign(data,structuredClone(values));},
    setAccessLevel: async () => {}
  });
  globalThis.chrome = {
    storage:{local:area(local),session:area(session)},
    runtime:{id:'tempo-test',getURL:path=>`chrome-extension://tempo-test/${path}`,onMessage:event('message'),onInstalled:event('installed'),sendMessage:async()=>{}},
    tabs:{get:async id => {const tab=tabs.find(tab=>tab.id===id);if(!tab)throw Error('Tab closed');return tab;},query:async query=>query.active?[tabs[0]]:tabs,
      sendMessage:async(id,message)=>{messages.push({id,message});},onUpdated:event('updated'),onRemoved:event('removed')},
    commands:{onCommand:event('command')},
    scripting:{executeScript:async()=>[]}
  };
  await import(`../src/background.js?test=${sequence++}`);
  const trusted = {id:'tempo-test',url:'chrome-extension://tempo-test/src/popup.html'};
  function message(payload,sender=trusted) {
    return new Promise((resolve,reject) => {
      const accepted = events.message({tabId:1,...payload},sender,resolve);
      if (!accepted) reject(new Error('Message rejected'));
    });
  }
  return {local,session,tabs,messages,events,message};
}

test('simultaneous writes are serialized without losing website preferences', async () => {
  const h=await harness({preferences:{mode:'site',globalSpeed:1,sites:{}}});
  await Promise.all([
    h.message({type:'TEMPO_UPDATE',action:'remember',remember:true}),
    h.message({type:'TEMPO_UPDATE',action:'speed',speed:3.5}),
    h.message({type:'TEMPO_UPDATE',action:'remember',remember:true,tabId:2}),
    h.message({type:'TEMPO_UPDATE',action:'speed',speed:2.75,tabId:2})
  ]);
  assert.equal(h.local.preferences.sites['canvas.example.edu'],3.5);
  assert.equal(h.local.preferences.sites['video.example.org'],2.75);
  const related=h.messages.filter(entry=>entry.id===3).at(-1);
  assert.equal(related.message.context.speed,3.5);
  assert.equal(related.message.force,false,'unrelated website updates do not restart correction budgets');
});
test('content frame cannot write preferences or impersonate another tab', async () => {
  const h=await harness({preferences:{mode:'site',globalSpeed:1,sites:{'canvas.example.edu':3.5,'video.example.org':2}}});
  const sender={id:'tempo-test',url:'https://third-party.example/player',tab:h.tabs[0],frameId:7};
  await assert.rejects(h.message({type:'TEMPO_UPDATE',action:'speed',speed:5},sender),/rejected/);
  const result=await h.message({type:'TEMPO_GET',tabId:2},sender);
  assert.equal(result.context.site,'canvas.example.edu');
  assert.equal(result.context.speed,3.5);
});
test('temporary preference survives a fresh worker and clears on cross-site navigation', async () => {
  const local={preferences:{mode:'site',globalSpeed:1.5,sites:{}}};const session={};
  let h=await harness(local,session);
  await h.message({type:'TEMPO_UPDATE',action:'speed',speed:2.7});
  h=await harness(local,session);
  assert.equal((await h.message({type:'TEMPO_GET'})).context.speed,2.7);
  h.tabs[0].url='https://different.example/page';
  h.events.updated(1,{url:h.tabs[0].url},h.tabs[0]);
  assert.equal((await h.message({type:'TEMPO_GET'})).context.speed,1.5);
  assert.equal(session.temporary['1'],undefined);
});
test('shortcuts increment, decrement and reset through saved preferences', async () => {
  const h=await harness({preferences:{mode:'global',globalSpeed:2.7,sites:{}}});
  h.events.command('increase-speed',h.tabs[0]);
  assert.equal((await h.message({type:'TEMPO_GET'})).context.speed,2.8);
  h.events.command('decrease-speed',h.tabs[0]);
  assert.equal((await h.message({type:'TEMPO_GET'})).context.speed,2.7);
  h.events.command('reset-speed',h.tabs[0]);
  assert.equal((await h.message({type:'TEMPO_GET'})).context.speed,1);
  assert.ok(h.messages.some(entry=>entry.message.indicator));
});
test('invalid writes never change saved settings; clearing removes overrides', async () => {
  const h=await harness({preferences:{mode:'site',globalSpeed:1,sites:{'canvas.example.edu':2}}});
  const invalid=await h.message({type:'TEMPO_UPDATE',action:'speed',speed:100});
  assert.equal(invalid.ok,false);
  assert.equal(h.local.preferences.sites['canvas.example.edu'],2);
  await h.message({type:'TEMPO_UPDATE',action:'forget-sites'});
  assert.deepEqual(h.local.preferences.sites,{});
  assert.equal((await h.message({type:'TEMPO_GET'})).context.speed,1);
});
test('closing a tab removes its ephemeral override without saving visited URLs', async () => {
  const h=await harness({preferences:{mode:'site',globalSpeed:1,sites:{}}});
  await h.message({type:'TEMPO_UPDATE',action:'speed',speed:3});
  h.events.removed(1);
  await h.message({type:'TEMPO_GET',tabId:2});
  assert.equal(h.session.temporary['1'],undefined);
  assert.ok(!JSON.stringify(h.local).includes('/lesson'));
});
