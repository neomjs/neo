import fs   from 'fs-extra';
import path from 'path';

/**
 * @module ai/scripts/maintenance/backupStagingResidueCore
 *
 * @summary The one owner of the `.backup-partial-*` staging namespace: its prefix, its
 * enumeration, and its retention policy.
 *
 * Atomic backup publication assembles every bundle in a `mkdtemp` staging directory and
 * renames it into place only after the integrity gate passes. A leading dot keeps that directory
 * invisible to all five root-level enumerators, every one of which gates on `startsWith('backup-')`
 * — retention, legacy-bundle migration, the restorability walk, the corruption timeline, and the
 * Memory Core healthcheck. **That invisibility is the safety property, not an oversight**: it is
 * why a torn bundle can never be selected as restorable. Nothing here widens any of those five
 * predicates, and nothing here may.
 *
 * What invisibility cost is a lifecycle. A caught failure removes its own staging directory, but
 * abrupt death — SIGKILL, OOM, host loss, container stop mid-write — cannot, so the residue was
 * permanent and unowned. Each one holds real exported rows, and the trigger is precisely an
 * orchestrator crash-loop, so partials accumulate fastest exactly when a filling backup volume
 * hurts most: one per restart that reaches the backup lane.
 *
 * This module never imports Neo or AiConfig: it takes a resolved root and a resolved policy, so it
 * is safe to import from the maintenance entrypoint and from an orchestrator service alike. The
 * prefix lives here as ONE shared constant rather than as a sixth hardcoded literal, because the
 * sweep and the surface that reports on it must not be able to disagree about what they are
 * naming.
 */

/**
 * The staging-directory prefix. Its leading dot is what excludes it from `startsWith('backup-')`
 * discovery, so this constant is a safety boundary rather than a naming convention.
 * @type {String}
 */
export const STAGING_PREFIX = '.backup-partial-';

/**
 * Whether a directory entry name belongs to the staging namespace.
 *
 * @param {String} name Directory basename.
 * @returns {Boolean}
 */
export function isStagingResidueName(name) {
    return name.startsWith(STAGING_PREFIX);
}

/**
 * Creates the unique staging directory a backup assembles into.
 *
 * @summary The CREATOR lives here, beside the enumerator and the sweep, so the three cannot hold
 * different opinions about what the namespace is. An earlier revision exported {@link STAGING_PREFIX}
 * as "the one owner" while `backup.mjs` kept its own `.backup-partial-` literal — two symbols that
 * agreed only by coincidence, and whose divergence would have made the sweep and the snapshot blind
 * to newly-created residue while every test stayed green. Sharing the constant was not enough;
 * owning the operation is what makes the claim structural rather than aspirational.
 *
 * `mkdtemp` supplies the per-run unique suffix and defaults to 0700. Sibling placement under the
 * bundle's own parent guarantees a same-filesystem rename at publication.
 * @param {String} parentRoot Absolute directory the bundle publishes into.
 * @param {String} stagingHint Bounded, filesystem-safe hint of the intended final basename.
 * @returns {Promise<String>} Absolute path of the created staging directory.
 */
export async function createStagingRoot(parentRoot, stagingHint) {
    return fs.mkdtemp(path.join(parentRoot, `${STAGING_PREFIX}${stagingHint}-`))
}

/**
 * Recursively sums the byte size of a directory's regular files.
 *
 * @summary Stats only — it never reads file contents, so a multi-GB partial costs one stat per
 * entry rather than any IO proportional to its size. Unreadable entries contribute `0` instead of
 * throwing: a residue sweep that dies on one bad inode leaves the whole namespace unreclaimed, and
 * an approximate size is worth more here than an exact failure.
 * @param {String} targetPath Absolute directory path.
 * @returns {Promise<Number>} Total bytes.
 */
export async function measureDirectoryBytes(targetPath) {
    let total = 0;

    let entries;
    try {
        entries = await fs.readdir(targetPath, {withFileTypes: true})
    } catch (error) {
        return 0
    }

    for (const entry of entries) {
        const entryPath = path.join(targetPath, entry.name);

        if (entry.isDirectory()) {
            total += await measureDirectoryBytes(entryPath)
        } else if (entry.isFile()) {
            try {
                total += (await fs.stat(entryPath)).size
            } catch (error) {
                // Vanished or unreadable mid-walk; contributes nothing rather than aborting.
            }
        }
    }

    return total
}

/**
 * Enumerates the staging residue under a backup root, newest first.
 *
 * @summary Ordered by `mtimeMs` rather than by the `mkdtemp` random suffix, which carries no time
 * information at all. The returned `bytes` is omitted unless asked for, because the size walk is
 * the only part of this that touches more than one directory level.
 * @param {String} backupRoot Absolute backup root.
 * @param {Object} [options]
 * @param {Boolean} [options.withBytes=false] Also measure each directory's total size.
 * @returns {Promise<Object[]>} `[{name, path, mtimeMs, bytes}]`, newest first.
 */
export async function listStagingResidue(backupRoot, {withBytes = false} = {}) {
    let entries;
    try {
        entries = await fs.readdir(backupRoot, {withFileTypes: true})
    } catch (error) {
        // ENOENT is an ANSWER: no root, therefore no residue. Every other code — ENOTDIR, EACCES,
        // EIO — is a FAILED OBSERVATION, and returning `[]` for it would make "I could not look"
        // wear the same shape as "I looked and found nothing". That is the precise defect this
        // module's own JSDoc calls out in the Memory Core healthcheck's blind `count: 0`, and it
        // would silently no-op the sweep on an unreadable root while reporting a clean footprint.
        if (error.code === 'ENOENT') {
            return []
        }
        throw error
    }

    const residue = [];

    for (const entry of entries) {
        if (!entry.isDirectory() || !isStagingResidueName(entry.name)) continue;

        const residuePath = path.join(backupRoot, entry.name);

        try {
            const stats = await fs.stat(residuePath);

            residue.push({
                name   : entry.name,
                path   : residuePath,
                mtimeMs: stats.mtimeMs,
                bytes  : withBytes ? await measureDirectoryBytes(residuePath) : null
            })
        } catch (error) {
            // Removed between readdir and stat — a concurrent sweep won the race; nothing to report.
        }
    }

    residue.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return residue
}

/**
 * Reports the staging-residue footprint for an observability surface.
 *
 * @summary Belongs on a surface that holds the backup mount. The Memory Core healthcheck does not
 * and reports `count: 0` from a blind container — a true statement carrying no information, which
 * is indistinguishable from a passing check.
 *
 * **`status` exists so this surface cannot commit that same error itself.** A readable root with no
 * residue reports `{status: 'ok', count: 0}`; a root that could not be read reports
 * `{status: 'unreadable', count: null}`. The counts are `null` rather than `0` on failure precisely
 * because a consumer summing or thresholding them must not be handed a measured-looking zero when
 * no measurement occurred. Absent-root is not a failure: it resolves to `ok` with a count of `0`,
 * because "there is no backup root" is a real answer to "how much residue is there".
 * @param {String} backupRoot Absolute backup root.
 * @returns {Promise<{status: String, count: Number|null, bytes: Number|null, oldestMtimeMs: Number|null, errorCode: String|null}>}
 */
export async function summarizeStagingResidue(backupRoot) {
    let residue;

    try {
        residue = await listStagingResidue(backupRoot, {withBytes: true})
    } catch (error) {
        return {
            status       : 'unreadable',
            count        : null,
            bytes        : null,
            oldestMtimeMs: null,
            errorCode    : error.code || null
        }
    }

    return {
        status       : 'ok',
        count        : residue.length,
        bytes        : residue.reduce((sum, entry) => sum + entry.bytes, 0),
        oldestMtimeMs: residue.length > 0 ? residue[residue.length - 1].mtimeMs : null,
        errorCode    : null
    }
}

/**
 * Chooses which staging directories to reclaim. Pure — the whole policy, decided without IO.
 *
 * @summary Forensic-retention COUNT, deliberately not an age bound. The residue is the only
 * surviving evidence of an abrupt termination, and an age bound short enough to cap capacity is
 * exactly the one that deletes the artifact an operator is still diagnosing. A count keeps the
 * newest failures for inspection while making unbounded growth impossible, which is the property
 * that was actually missing.
 *
 * `excludePath` is honoured as an EXPLICIT exclusion rather than inferred from the heavy-maintenance
 * lease that serialises this lane, and rather than left to the accident that an in-flight staging
 * directory is also the newest. Both of those would be true today and silently false after any
 * change to either mechanism.
 *
 * @param {Object[]} residue Entries from {@link listStagingResidue}, newest first.
 * @param {Object} options
 * @param {Number} options.keepPartials How many newest partials to preserve for forensics.
 * @param {String} [options.excludePath=null] A staging directory that must never be reclaimed.
 * @returns {Object[]} The subset to remove.
 */
export function selectStagingResidueForRemoval(residue, {keepPartials, excludePath = null}) {
    const candidates = residue.filter(entry => entry.path !== excludePath);

    if (!(keepPartials >= 0)) {
        return []
    }

    return candidates.slice(keepPartials)
}

/**
 * Reclaims staging residue beyond the forensic-retention count.
 *
 * @summary Every removal is logged with the directory's name and age. Silent reclamation would
 * destroy the forensic trail for the exact incident class this namespace records, and a sweep that
 * leaves no trace is indistinguishable from one that never ran.
 * @param {String} backupRoot Absolute backup root.
 * @param {Object} logger Log sink exposing `log` and optionally `warn` / `error`.
 * @param {Object} options
 * @param {Number} options.keepPartials How many newest partials to preserve.
 * @param {String} [options.excludePath=null] A staging directory that must never be reclaimed.
 * @param {Number} [options.now=Date.now()] Clock seam for age reporting.
 * @returns {Promise<{inspected: Number, removed: String[], failed: String[], keptForForensics: Number}>}
 */
export async function cleanStagingResidue(backupRoot, logger, {keepPartials, excludePath = null, now = Date.now()}) {
    const residue = await listStagingResidue(backupRoot),
          doomed  = selectStagingResidueForRemoval(residue, {keepPartials, excludePath}),
          removed = [],
          failed  = [];

    for (const entry of doomed) {
        const ageHours = Math.round((now - entry.mtimeMs) / 3600000);

        try {
            logger.log(`[Retention] Reclaiming backup staging residue: ${entry.name} (age: ${ageHours}h)`);
            await fs.remove(entry.path);
            removed.push(entry.name)
        } catch (error) {
            failed.push(entry.name);
            const message = `[Retention] Failed to reclaim staging residue ${entry.name}: ${error.message}`;
            logger.error ? logger.error(message) : logger.log(message)
        }
    }

    if (removed.length > 0) {
        logger.log(`[Retention] Reclaimed ${removed.length} backup staging residue director(ies); kept the newest ${Math.min(keepPartials, residue.length - doomed.length)} for forensics.`)
    }

    return {
        inspected       : residue.length,
        removed,
        failed,
        keptForForensics: residue.length - removed.length
    }
}
