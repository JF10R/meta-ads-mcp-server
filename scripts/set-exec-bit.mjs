import { chmodSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve('build', 'index.js');

if (process.platform !== 'win32' && existsSync(target)) {
  chmodSync(target, 0o755);
}
