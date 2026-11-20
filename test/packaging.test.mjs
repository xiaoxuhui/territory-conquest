import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '../dist');

// The hall serves packaged resources with a fixed MIME table: only .js maps to a
// JavaScript MIME. Module scripts are rejected under strict MIME checking, so a
// .mjs entry would install cleanly and then fail to start on the device.
test('packaged entry uses a hall-served script extension', () => {
  const files = fs.readdirSync(dist);
  assert.deepEqual(files.filter((name) => name.endsWith('.mjs')), []);
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  assert.match(html, /<script type="module" src="app\.js"><\/script>/);
});

test('every relative reference in the entry page exists in dist', () => {
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(?:data:|#|[a-z]+:)/i.test(reference)) continue;
    if (reference === './') continue;
    assert.ok(fs.existsSync(path.join(dist, reference)), `missing ${reference}`);
  }
});

test('module imports resolve inside dist', () => {
  for (const name of fs.readdirSync(dist).filter((file) => file.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(dist, name), 'utf8');
    for (const [, specifier] of source.matchAll(/from\s+'(\.[^']+)'/g)) {
      assert.ok(fs.existsSync(path.resolve(dist, specifier)), `${name} imports missing ${specifier}`);
    }
  }
});
