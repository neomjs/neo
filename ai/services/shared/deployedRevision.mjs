import fs   from 'fs-extra';
import path from 'path';

import {fileURLToPath} from 'url';

/**
 * @module ai/services/shared/deployedRevision
 * @summary The packaged source revision, read from the artifact rather than from the request that
 * asked for it — so a deployment can answer what it IS running, not what it was told to run.
 *
 * **Two different facts wear the same name.** `NEO_REVISION` is a build ARG: an operator's assertion
 * of what should be packaged, empty by default, and absent from the runtime entirely. `.neo-revision`
 * is written by the image's source stage from `git rev-parse HEAD` after the checkout, so it records
 * what actually landed. This module reads the second. Reading the first would report the request and
 * call it identity — and the case worth detecting is precisely the one where they disagree.
 *
 * **Why this cannot be a config leaf.** It is measured artifact truth, not policy: nothing may
 * override it, and a deployment that could set it could lie about its own identity. Config carries
 * what an operator chooses; this carries what the build produced.
 *
 * **Absence is a value, never a silence.** A missing file means a runtime that was not built by the
 * image pipeline — a source checkout, a test process, an unknown packaging path — and it reports
 * `unknown`. It must never be omitted from a payload: a consumer computing deployment skew has to be
 * able to tell "several hundred commits behind" from "the field is not there", and an omitted field
 * reads as current to every naive reader.
 *
 * **`local-build` is a real value.** The image's local-source stage writes that literal marker rather
 * than leaving the file absent, so a dev-iteration image is distinguishable from both a packaged one
 * and an unbuilt runtime. It is passed through unmodified; do not coerce it to `unknown`.
 */

/**
 * The image copies the checkout to `/app`, so the marker sits beside it. Derived from this module's
 * own location rather than hardcoded, for the same reason `BaseServer`'s canonical-root anchor is:
 * a path computed from the code that reads it cannot drift with the process environment, and the
 * same expression resolves correctly for an in-tree run.
 * @type {String}
 * @private
 */
const revisionFilePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '../../../.neo-revision'
);

/**
 * Read once per process. The file is written at build time and cannot change under a running
 * container, so re-reading it per healthcheck would add syscalls to the hottest endpoint we serve
 * without any chance of a different answer.
 * @type {Object|null}
 * @private
 */
let cached = null;

/**
 * @summary Reads the packaged source revision.
 *
 * Never throws and never returns a partial shape: every failure mode — absent file, unreadable file,
 * empty contents — resolves to `{revision: null, source: 'unknown'}`. A healthcheck that could fail
 * because provenance was unavailable would trade a reporting gap for an outage.
 *
 * @param {Object} [options]
 * @param {String} [options.filePath] Override for tests. Production callers omit it.
 * @param {Boolean} [options.useCache=true] Set false in tests to defeat the per-process memo.
 * @returns {{revision: String|null, source: String}} `source` is `packaged` when the artifact named a
 *     revision, `unknown` when no build wrote one. `revision` is the raw recorded value — a full SHA
 *     for a git-sourced image, the `local-build` marker for a local-source image.
 */
export function readDeployedRevision({filePath = revisionFilePath, useCache = true} = {}) {
    if (useCache && cached) {
        return cached;
    }

    let result;

    try {
        const raw = fs.readFileSync(filePath, 'utf8').trim();

        result = raw
            ? {revision: raw, source: 'packaged'}
            : {revision: null, source: 'unknown'};
    } catch (error) {
        result = {revision: null, source: 'unknown'};
    }

    result = Object.freeze(result);

    if (useCache) {
        cached = result;
    }

    return result
}

/**
 * @summary Clears the per-process memo. Test seam only — a running deployment's revision cannot
 * change, so a production caller reaching for this is describing a situation that cannot occur.
 * @returns {void}
 */
export function resetDeployedRevisionCache() {
    cached = null;
}
