import { componentize } from '@bytecodealliance/componentize-js';
import { writeFile } from 'node:fs/promises';

const wit = `package anilili:provider@1.0.0;
interface types { record query { anilist-id: u32, mal-id: option<u32>, titles: list<string>, episode: f64, dub: bool } }
world provider { export info: func() -> string; }
`;

const source = `export function info() { return "AnimeSalt"; }`;

const { component } = await componentize(source, wit);
await writeFile('test.wasm', component);
console.log('ok', component.length);