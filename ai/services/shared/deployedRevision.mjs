import fs   from 'fs-extra';
import path from 'path';

import {fileURLToPath} from 'url';

const revisionFilePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '../../../.neo-revision'
);

/**
 * @summary The packaged source revision, so a deployment can report which commit it is running.
 *
 * Reads the image's `.neo-revision` marker, written by the build from the real checkout — not the
 * `NEO_REVISION` build arg, which records what was REQUESTED, is empty by default, and no runtime
 * code reads.
 *
 * Never throws: absent, empty and unreadable all give `null`, since a healthcheck must not fail
 * because provenance was unavailable. `null` is reported as the field's value, never omitted — an
 * absent field reads as "current" to whoever is checking for skew.
 *
 * @param {Object} [options]
 * @param {String} [options.filePath] Override for tests. Production callers omit it.
 * @returns {String|null} A SHA, the `local-build` marker, or null when no build wrote one.
 */
export function readDeployedRevision({filePath = revisionFilePath} = {}) {
    try {
        return fs.readFileSync(filePath, 'utf8').trim() || null
    } catch {
        return null
    }
}
