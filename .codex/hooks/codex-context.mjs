import {readFileSync} from 'node:fs';

const contextUrl = new URL('../CODEX.md', import.meta.url);
const context    = readFileSync(contextUrl, 'utf8').trim();

if (context) {
    process.stdout.write(`${context}\n`);
}
