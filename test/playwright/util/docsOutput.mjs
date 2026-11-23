import {execFileSync}  from 'node:child_process';
import {fileURLToPath} from 'node:url';

/**
 * @summary Generates `docs/output`, the untracked class index the Docs app reads, unless the engine tier's
 * `Generate the Docs class index` step already did. That step runs in any shard whose specs call this function, and
 * sets `NEO_DOCS_OUTPUT_READY`.
 */
export function ensureDocsOutput() {
    if (process.env.NEO_DOCS_OUTPUT_READY !== 'true') {
        execFileSync(process.execPath, ['buildScripts/docs/generateDocsJson.mjs'], {
            cwd    : fileURLToPath(new URL('../../../', import.meta.url)),
            timeout: 60000
        })
    }
}
