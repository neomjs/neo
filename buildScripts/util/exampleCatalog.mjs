import fs   from 'node:fs/promises';
import path from 'node:path';

/**
 * The examples catalog lives in one folder: `index.json` names the groups, and each `<group>.json` beside it holds that
 * group's records, so an examples PR for one group edits only that group's file. A record takes its place in the
 * catalog from `order`, because the catalog interleaves the groups: the overview's featured cards and the cards a page
 * borrows through `alsoIn` keep their positions. `Portal.store.Examples#load()` reads the same files in the browser.
 */

/**
 * Workspace-relative path of the catalog folder.
 * @type {String}
 */
export const EXAMPLES_DIR = 'apps/portal/resources/data/examples';

/**
 * @summary Puts records into catalog order: ascending `order`, a record without one after the records that have one,
 * ties in the order given. `Portal.store.Examples.order()` is the same rule in the browser.
 * @param {Object[]} records
 * @returns {Object[]} A new array
 */
export function orderCatalog(records) {
    const rank = record => record.order ?? Number.MAX_VALUE;

    return [...records].sort((a, b) => rank(a) - rank(b))
}

/**
 * @summary Reads the catalog: the records of the groups `index.json` names, in catalog order.
 * @param {String} dir The catalog folder
 * @returns {Promise<{bytes: Buffer, records: Object[]}>} The records, and the bytes of every file read, for an input
 * hash
 */
export async function readExampleCatalog(dir) {
    const index  = await fs.readFile(path.join(dir, 'index.json')),
          groups = await Promise.all(JSON.parse(index).map(group => fs.readFile(path.join(dir, `${group}.json`))));

    return {
        bytes  : Buffer.concat([index, ...groups]),
        records: orderCatalog(groups.flatMap(bytes => JSON.parse(bytes)))
    }
}
