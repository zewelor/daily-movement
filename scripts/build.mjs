#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../src/catalog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'src');
const output = join(root, 'dist');

async function main() {
  const [groups, metadata, template] = await Promise.all([
    readFile(join(root, 'videos.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'video-metadata.json'), 'utf8').then(JSON.parse),
    readFile(join(source, 'index.html'), 'utf8'),
  ]);
  const catalog = buildCatalog(groups, metadata);
  const views = {
    morning: { greeting: 'Good morning.', title: 'Morning movement' },
    day: { greeting: 'Time to move.', title: 'Daytime movement' },
  };
  await rm(output, { recursive: true, force: true });
  await mkdir(output);
  for (const file of ['app.js', 'catalog.js', 'styles.css', 'sun.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']) {
    await cp(join(source, file), join(output, file));
  }
  await writeFile(join(output, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  await writeFile(join(output, '.nojekyll'), '');
  for (const path of ['', 'morning', 'day']) {
    const mode = path || 'morning';
    const page = template.replaceAll('__ASSET_PREFIX__', path ? '../' : './')
      .replaceAll('__MODE__', mode)
      .replaceAll('__GREETING__', views[mode].greeting)
      .replaceAll('__PAGE_TITLE__', views[mode].title);
    await mkdir(join(output, path), { recursive: true });
    await writeFile(join(output, path, 'index.html'), page);
  }
  console.log(`Built ${catalog.videos.length} videos across ${catalog.channels.length} channels into dist/ (morning/ and day/).`);
}

main().catch(error => {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
});
