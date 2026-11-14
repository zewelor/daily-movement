import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture, record, run, video } from './helpers.mjs';

const execute = promisify(execFile);
const groups = {
  '@first': [video('aaaaaaaaaaa'), video('bbbbbbbbbbb', ['morning'])],
  '@second': Array.from({ length: 9 }, (_, i) => video(`cccccccccc${i}`, ['morning'])),
};
const metadata = { aaaaaaaaaaa: { ...record('Long stretch'), durationSeconds: 900 }, bbbbbbbbbbb: record('Morning warmup') };
for (let i = 0; i < 9; i++) metadata[`cccccccccc${i}`] = { ...record(`Routine ${i}`), author: 'Second', channel: '@second' };
const root = await fixture(groups, metadata);
const build = run(root, 'build');
assert.equal(build.status, 0, build.stderr);
const { stdout } = await execute('agent-browser', ['session', 'id', '--scope', 'worktree', '--prefix', 'daily-movement-e2e']);
const session = stdout.trim();
const steps = [];
const requests = [];
let catalogOverride;
let catalogStatus = 200;
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  try {
    assert.ok(path.startsWith('/project/'));
    let file = join(root, 'dist', path.slice('/project/'.length));
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = path.endsWith('/catalog.json') && catalogOverride !== undefined ? catalogOverride : await readFile(file);
    const status = path.endsWith('/catalog.json') ? catalogStatus : 200;
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
    response.writeHead(status, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
    requests.push({ path, status });
  } catch {
    requests.push({ path, status: 404 });
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const site = `http://127.0.0.1:${server.address().port}/project/`;

async function browser(...args) {
  const { stdout } = await execute('agent-browser', ['--session', session, '--json', ...args], { timeout: 35_000, maxBuffer: 4 * 1024 * 1024 });
  const result = JSON.parse(stdout);
  steps.push({ args, result });
  assert.equal(result.success, true, JSON.stringify(result));
  return result.data;
}
async function evaluate(code) {
  return (await browser('eval', '-b', Buffer.from(code).toString('base64'))).result;
}
async function ready(mode) {
  await browser('wait', '--fn', `document.body.dataset.mode === '${mode}' && document.querySelector('.video-card')`);
}
async function checkHeader(compact = false) {
  const header = await evaluate(`(()=>{const heading=document.getElementById('greeting').getBoundingClientRect(),nav=document.querySelector('.mode-nav').getBoundingClientRect(),section=document.getElementById('today').getBoundingClientRect();return {sameRow:Math.abs((heading.top+heading.bottom)/2-(nav.top+nav.bottom)/2)<2,rightAligned:Math.abs(nav.right-section.right)<2,targets:[...document.querySelectorAll('.mode-nav a')].map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height}})};})()`);
  assert.equal(header.sameRow, true, JSON.stringify(header));
  assert.equal(header.rightAligned, true, JSON.stringify(header));
  assert.ok(header.targets.every(r => r.height >= 44 && (compact ? r.width === 44 : r.width > 44)), JSON.stringify(header));
}

try {
  await browser('--relaunch', '--init-script', fileURLToPath(new URL('./player-mock.js', import.meta.url)), 'open', 'about:blank');
  for (const url of ['https://www.youtube.com/*', 'https://www.youtube-nocookie.com/*', 'https://i.ytimg.com/*']) {
    await browser('network', 'route', url, '--abort');
  }
  await browser('open', `${site}morning/`);
  await ready('morning');
  for (const path of ['morning/', 'day/', '']) {
    await browser('open', `${site}${path}`);
    const pwa = await evaluate(`(async()=>{const link=document.querySelector('link[rel="manifest"]');if(!link)return null;const response=await fetch(link.href);const manifest=await response.json();const icons=await Promise.all(manifest.icons.map(async icon=>{const image=new Image();image.src=new URL(icon.src,link.href);await image.decode();return [image.naturalWidth,image.naturalHeight]}));return {manifest:link.href,start:new URL(manifest.start_url,link.href).pathname,scope:new URL(manifest.scope,link.href).pathname,display:manifest.display,icons};})()`);
    assert.deepEqual(pwa, { manifest: `${site}manifest.webmanifest`, start: '/project/', scope: '/project/', display: 'standalone', icons: [[192, 192], [512, 512]] });
  }
  await browser('open', `${site}morning/`);
  await ready('morning');
  await checkHeader();
  await browser('snapshot', '-i');
  assert.deepEqual(await evaluate(`(()=>{const link=document.querySelector('a[aria-label="Open Second on YouTube (opens in a new tab)"]');return {href:link?.href,target:link?.target,filter:link?.previousElementSibling?.dataset.creator,links:document.querySelectorAll('#creator-filters a').length};})()`), {
    href: 'https://www.youtube.com/@second/videos', target: '_blank', filter: '@second', links: 2,
  });
  assert.deepEqual(await evaluate(`({mode:document.body.dataset.mode,cards:document.querySelectorAll('.video-card').length,more:document.getElementById('library-more').textContent,channels:[...document.querySelectorAll('#creator-filters button')].map(x=>x.dataset.creator),active:document.querySelector('.mode-nav [aria-current]').dataset.mode})`), {
    mode: 'morning', cards: 8, more: 'Show all 11 videos', channels: ['all', '@first', '@second'], active: 'morning',
  });
  await browser('find', 'role', 'button', 'click', '--name', 'Second', '--exact');
  assert.equal(await evaluate(`document.getElementById('library-more').textContent`), 'Show all 9 videos');
  await browser('press', 'Tab');
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Open Second on YouTube (opens in a new tab)');
  await evaluate(`document.activeElement.addEventListener('click', event => event.preventDefault(), {once:true})`);
  await browser('press', 'Enter');
  assert.equal(await evaluate(`document.getElementById('library-more').textContent`), 'Show all 9 videos');
  assert.equal(await evaluate(`document.querySelector('#creator-filters button[aria-pressed="true"]').dataset.creator`), '@second');
  await browser('find', 'role', 'button', 'click', '--name', 'All', '--exact');
  await browser('find', 'role', 'button', 'click', '--name', 'Show all 11 videos', '--exact');
  assert.equal(await evaluate(`document.querySelectorAll('.video-card').length`), 11);
  await browser('focus', 'button[data-video-id="aaaaaaaaaaa"]');
  await browser('press', 'Enter');
  assert.equal(await evaluate('document.activeElement.id'), 'watch');
  assert.equal(await evaluate(`(()=>{const p=testPlayers.at(-1);p.events.onStateChange({target:p,data:1});return p.pauses;})()`), 0);

  await evaluate('testPlayers.at(-1).defer = true');
  await browser('click', 'button[data-video-id="bbbbbbbbbbb"]');
  assert.deepEqual(await evaluate(`(()=>{const p=testPlayers.at(-1);p.events.onError({target:p,data:100});return {oldVisible:!!document.querySelector('[data-video-id="aaaaaaaaaaa"]'),newVisible:!!document.querySelector('[data-video-id="bbbbbbbbbbb"]'),requested:p.requestedId};})()`), {
    oldVisible: false, newVisible: true, requested: 'bbbbbbbbbbb',
  });
  await browser('find', 'role', 'link', 'click', '--name', 'Day', '--exact');
  await ready('day');
  assert.deepEqual(await evaluate(`({path:location.pathname,cards:document.querySelectorAll('.video-card').length,channels:document.querySelectorAll('#creator-filters a').length,disabled:document.getElementById('shuffle').disabled,id:document.querySelector('.selected').dataset.videoId})`), {
    path: '/project/day/', cards: 1, channels: 1, disabled: false, id: 'aaaaaaaaaaa',
  });
  await browser('find', 'role', 'button', 'click', '--name', 'Pick another', '--exact');
  assert.equal(await evaluate(`document.querySelector('.selected').dataset.videoId`), 'aaaaaaaaaaa');
  await browser('back');
  await ready('morning');
  await browser('forward');
  await ready('day');
  await browser('open', `${site}day/`);
  await ready('day');
  await browser('open', site);
  await ready('morning');
  await browser('set', 'viewport', '320', '740');
  await checkHeader(true);
  const layout = await evaluate(`({playerHeight:document.getElementById('youtube-player').getBoundingClientRect().height,frameHeight:document.getElementById('video-frame').getBoundingClientRect().height,width:innerWidth,scrollWidth:document.documentElement.scrollWidth})`);
  assert.ok(layout.playerHeight >= 200, JSON.stringify(layout));
  assert.equal(layout.scrollWidth, layout.width, JSON.stringify(layout));
  assert.equal(await evaluate(`[...document.querySelectorAll('#creator-filters button, #creator-filters a')].every(e=>{const r=e.getBoundingClientRect();return r.width>=44 && r.height>=44})`), true);
  const accessibility = await browser('a11y', '--tags', 'wcag2a,wcag2aa');
  assert.deepEqual(accessibility.violations, []);
  assert.deepEqual(requests.filter(item => item.status !== 200), []);
  for (const file of ['app.js', 'catalog.js', 'catalog.json', 'styles.css']) {
    assert.ok(requests.some(item => item.path === `/project/${file}`), `Shared asset missing: ${file}`);
  }

  catalogStatus = 503;
  await browser('reload');
  await browser('wait', '--text', 'The video list could not be loaded');
  assert.deepEqual(await evaluate(`({hidden:document.getElementById('watch').hidden,disabled:document.getElementById('shuffle').disabled,error:!document.getElementById('catalog-error').hidden})`), { hidden: true, disabled: true, error: true });
  catalogStatus = 200;
  const catalog = JSON.parse(await readFile(join(root, 'dist/catalog.json')));
  catalog.videos = catalog.videos.map(video => ({ ...video, modes: ['morning'] }));
  catalogOverride = JSON.stringify(catalog);
  await browser('open', `${site}day/`);
  await browser('wait', '--text', 'No videos are available');
  assert.equal(await evaluate(`document.getElementById('shuffle').disabled && document.getElementById('watch').hidden && document.getElementById('catalog-error').hidden`), true);
  console.log(`E2E passed: clean URLs under /project/, filters, repeats, Back/Forward, player errors, mobile layout, accessibility and failure states. Evidence: ${root}`);
} finally {
  try {
    await browser('close');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await writeFile(join(root, 'browser-results.json'), JSON.stringify({ steps, requests }, null, 2) + '\n');
    console.log(`Browser evidence: ${root}`);
  }
}
