/**
 * @plane in-plane
 */
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
 * The ONE rule every observation site in this module applies to a filesystem error.
 *
 * @summary `ENOENT` is the only skippable code, because it is the only one that carries
 * information: the entry is genuinely not there, which for this namespace is a real answer (an
 * absent root) or a benign race (a concurrent sweep removed a partial between `readdir` and
 * `stat`). Every other code — `ENOTDIR`, `EACCES`, `EPERM`, `EIO` — means *the observation failed*,
 * and a failed observation must never be reported as a measurement.
 *
 * This lives as a named helper rather than as three copies of an `if` because the first repair of
 * this defect fixed exactly one of the four catch sites and left the other three intact: the root
 * `readdir` was corrected while the per-entry `stat` and both recursive size reads kept swallowing
 * everything, so an unreadable child still produced `{status:'ok', count:0}`. Fixing one site of a
 * shared class is how the next site gets shadowed. One rule, one place, applied at every site.
 *
 * @param {Error} error A filesystem error.
 * @returns {Boolean} True when the error is a genuine absence and may be skipped.
 */
export function isSkippableAbsence(error) {
    return error?.code === 'ENOENT';
}

/**
 * Recursively sums the byte size of a directory's regular files.
 *
 * @summary Stats only — it never reads file contents, so a multi-GB partial costs one stat per
 * entry rather than any IO proportional to its size.
 *
 * An entry that vanished mid-walk contributes `0` and the walk continues: that is a real race
 * against the sweep, not a failure. Anything else PROPAGATES — an unreadable payload reporting
 * `bytes: 0` alongside `status: 'ok'` is a measured-looking zero for a measurement that never
 * happened, which is the exact defect this module exists to avoid committing.
 * @param {String} targetPath Absolute directory path.
 * @param {Object} [options]
 * @param {Object} [options.fsImpl=fs] Filesystem seam. Injected by specs to produce a deterministic
 *     `EACCES`: real permission fixtures behave differently under root, which CI runs as, so a
 *     permission-based witness would pass locally and prove nothing where it matters.
 * @returns {Promise<Number>} Total bytes.
 * @throws {Error} Any non-`ENOENT` filesystem error.
 */
export async function measureDirectoryBytes(targetPath, {fsImpl = fs} = {}) {
    let total = 0,
        entries;

    try {
        entries = await fsImpl.readdir(targetPath, {withFileTypes: true})
    } catch (error) {
        if (isSkippableAbsence(error)) {
            return 0
        }
        throw error
    }

    for (const entry of entries) {
        const entryPath = path.join(targetPath, entry.name);

        if (entry.isDirectory()) {
            total += await measureDirectoryBytes(entryPath, {fsImpl})
        } else if (entry.isFile()) {
            try {
                total += (await fsImpl.stat(entryPath)).size
            } catch (error) {
                if (!isSkippableAbsence(error)) {
                    throw error
                }
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
 * @param {Object} [options.fsImpl=fs] Filesystem seam; see {@link measureDirectoryBytes}.
 * @returns {Promise<Object[]>} `[{name, path, mtimeMs, bytes}]`, newest first.
 * @throws {Error} Any non-`ENOENT` filesystem error, at the root or at any entry beneath it.
 */
export async function listStagingResidue(backupRoot, {withBytes = false, fsImpl = fs} = {}) {
    let entries;
    try {
        entries = await fsImpl.readdir(backupRoot, {withFileTypes: true})
    } catch (error) {
        // No root, therefore no residue — the one code that is an answer. See isSkippableAbsence.
        if (isSkippableAbsence(error)) {
            return []
        }
        throw error
    }

    const residue = [];

    for (const entry of entries) {
        if (!entry.isDirectory() || !isStagingResidueName(entry.name)) continue;

        const residuePath = path.join(backupRoot, entry.name);

        try {
            const stats = await fsImpl.stat(residuePath);

            residue.push({
                name   : entry.name,
                path   : residuePath,
                mtimeMs: stats.mtimeMs,
                bytes  : withBytes ? await measureDirectoryBytes(residuePath, {fsImpl}) : null
            })
        } catch (error) {
            // Removed between readdir and stat — a concurrent sweep won the race; nothing to report.
            // An entry we can SEE but cannot STAT is a different thing entirely: dropping it silently
            // would delete it from the count AND from the sweep's work list, so the residue would be
            // both unreported and unreclaimed. That propagates.
            if (!isSkippableAbsence(error)) {
                throw error
            }
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
 *
 * A failure ANYWHERE in the walk lands here — the root, an entry it could see but not stat, or a
 * payload it could not size. All of them are the same class and all of them report `unreadable`.
 * @param {String} backupRoot Absolute backup root.
 * @param {Object} [options]
 * @param {Object} [options.fsImpl] Filesystem seam; see {@link measureDirectoryBytes}.
 * @returns {Promise<{status: String, count: Number|null, bytes: Number|null, oldestMtimeMs: Number|null, errorCode: String|null}>}
 */
export async function summarizeStagingResidue(backupRoot, {fsImpl} = {}) {
    let residue;

    try {
        residue = await listStagingResidue(backupRoot, {withBytes: true, ...(fsImpl && {fsImpl})})
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
 * @param {Object} [options.fsImpl=fs] Filesystem seam; see {@link measureDirectoryBytes}.
 * @returns {Promise<{inspected: Number, removed: String[], failed: String[], keptForForensics: Number}>}
 * @throws {Error} Any non-`ENOENT` enumeration failure, so an unreadable namespace reaches
 *     `runBackup`'s warning path instead of silently reclaiming nothing.
 */
export async function cleanStagingResidue(backupRoot, logger, {keepPartials, excludePath = null, now = Date.now(), fsImpl = fs}) {
    const residue = await listStagingResidue(backupRoot, {fsImpl}),
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
