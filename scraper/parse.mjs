import { parseSync } from '../node_modules/@oxc-parser/index.js';
import fs from 'node:fs';
const code = fs.readFileSync('src/index.js','utf8');
const r = parseSync('src/index.js', code);
console.log(JSON.stringify(r.errors, null, 2));