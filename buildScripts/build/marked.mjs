import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath}                          from 'node:url';

/**
 * @module buildScripts/build/marked
 * @summary Copies marked's self-contained ESM distribution for native worker and npm consumers.
 * The initial/release build copies the locked upstream artifact and license without recompiling it.
 * The engine-owned address avoids a dependency on the consumer's node_modules layout.
 */
const packageUrl = import.meta.resolve('marked/package.json'),
      license    = readFileSync(new URL('./LICENSE', packageUrl), 'utf8'),
      source     = readFileSync(fileURLToPath(import.meta.resolve('marked')), 'utf8'),
      output     = new URL('../../dist/marked.mjs', import.meta.url);

mkdirSync(new URL('.', output), {recursive: true});
writeFileSync(output, `/*!\n${license}\n*/\n${source}`);

console.log('Copied marked and its license to dist/marked.mjs');
