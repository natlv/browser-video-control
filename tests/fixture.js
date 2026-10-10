let media;
async function generateMedia() {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(12);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const parts = [];
  recorder.ondataavailable = event => parts.push(event.data);
  const complete = new Promise(resolve => recorder.onstop = resolve);
  recorder.start();
  for (let frame = 0; frame < 12; frame++) {
    ctx.fillStyle = '#30295b'; ctx.fillRect(0,0,320,180);
    ctx.fillStyle = '#b3a5ff'; ctx.font = '24px system-ui'; ctx.fillText(`Tempo · ${frame+1}`,75,100);
    await new Promise(resolve => setTimeout(resolve,85));
  }
  recorder.stop(); await complete; stream.getTracks().forEach(track => track.stop());
  return URL.createObjectURL(new Blob(parts, { type: 'video/webm' }));
}
function newVideo() {
  const video = document.createElement('video'); video.controls = true; video.muted = true;
  if (media) video.src = media;
  return video;
}
document.getElementById('add').onclick = () => document.getElementById('players').append(newVideo());
document.getElementById('replace').onclick = () => document.getElementById('primary').replaceWith(Object.assign(newVideo(),{id:'primary'}));
document.getElementById('shadow').onclick = () => {
  const host = document.createElement('div'); const root = host.attachShadow({mode:'open'});
  root.append(newVideo()); document.getElementById('players').append(host);
};
document.getElementById('late-shadow').onclick = () => {
  const host = document.createElement('div'); host.id = 'late-host'; host.textContent = 'Delayed shadow player';
  document.getElementById('players').append(host);
  setTimeout(() => { host.textContent = ''; host.attachShadow({mode:'open'}).append(newVideo()); },250);
};
document.getElementById('frame').onclick = () => {
  const frame = document.createElement('iframe');
  const url = new URL(location.href); url.hostname = location.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
  frame.src = url.href; document.getElementById('players').append(frame);
};
document.getElementById('navigate').onclick = () => {
  history.pushState({},'',`?lesson=${Date.now()}`);
  document.getElementById('primary').replaceWith(Object.assign(newVideo(),{id:'primary'}));
};
let rejecting = false;
function resetRate() { if (rejecting && primary.playbackRate !== 1) primary.playbackRate = 1; }
document.getElementById('reject').onclick = () => {
  rejecting = !rejecting;
  primary.addEventListener('ratechange',resetRate);
  if (rejecting) primary.playbackRate = 1;
  document.getElementById('message').textContent = rejecting ? 'Player is forcing 1×. Tempo should give up after bounded retries and explain the conflict.' : 'Rate reset disabled. Select your speed again in Tempo.';
};
generateMedia().then(url => {
  media = url;
  document.querySelectorAll('video').forEach(video => {video.src = media;});
  window.fixtureReady = true;
});
