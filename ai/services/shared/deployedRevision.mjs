import fs   from 'fs-extra';
import path from 'path';

import {fileURLToPath} from 'url';

/**
 * @module ai/services/shared/deployedRevision
 * @summary The packaged source revision, read from the artifact rather than from the build arg that
 * asked for it.
 *
 * `NEO_REVISION` is a build ARG — what an operator requested, empty by default, absent at runtime.
 * `.neo-revision` is written by the image's source stage from the real checkout. This reads the
 * second, because the case worth detecting is the one where they disagree.
 *
 * `null` means no build wrote a revision (a source checkout, a test process). It is a value, not a
 * silence: the field must always be present on the payload, or a consumer computing deployment skew
 * reads an absent field as current. `local-build` is a real recorded value and passes through.
 */

const revisionFilePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '../../../.neo-revision'
);

// `undefined` is "not read yet", `null` is "read, and no build wrote one" — a single sentinel would
// re-read the file on every healthcheck for an unbuilt runtime.
let cached;

/**
 * @summary Reads the packaged source revision, once per process.
 *
 * Never throws: absent, unreadable and empty all resolve to `null`, since a healthcheck that could
 * fail because provenance was unavailable would trade a reporting gap for an outage.
 *
 * @param {Object} [options]
 * @param {String} [options.filePath] Override for tests. Production callers omit it.
 * @param {Boolean} [options.useCache=true] False in tests to defeat the memo.
 * @returns {String|null} The recorded revision — a SHA, the `local-build` marker, or null.
 */
export function readDeployedRevision({filePath = revisionFilePath, useCache = true} = {}) {
    if (useCache && cached !== undefined) {
        return cached
    }

    let result;

    try {
        result = fs.readFileSync(filePath, 'utf8').trim() || null
    } catch {
        result = null
    }

    if (useCache) {
        cached = result
    }

    return result
}

/**
 * @summary Clears the per-process memo. Test seam only — a running deployment's revision cannot change.
 * @returns {void}
 */
export function resetDeployedRevisionCache() {
    cached = undefined;
}
