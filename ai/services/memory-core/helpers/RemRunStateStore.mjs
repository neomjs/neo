import fs   from 'fs/promises';
import path from 'path';

/**
 * @summary Builds the gitignored file name used for one REM run state artifact.
 *
 * @param {String} runId Stable cycle id.
 * @returns {String} JSONL file name.
 */
export function getRemRunStateFileName(runId) {
    if (typeof runId !== 'string' || runId.length === 0) {
        throw new TypeError('getRemRunStateFileName: runId is required');
    }

    return `${runId.replace(/[^a-zA-Z0-9_.-]/g, '_')}.jsonl`;
}

/**
 * @summary Calculates a wall-clock duration from epoch millisecond timestamps.
 *
 * @param {Number} startedAt Epoch milliseconds.
 * @param {Number} completedAt Epoch milliseconds.
 * @returns {Number} Non-negative wall-clock duration.
 */
export function getWallClockMs(startedAt, completedAt) {
    if (!Number.isFinite(startedAt)) {
        throw new TypeError('getWallClockMs: startedAt must be a finite number');
    }
    if (!Number.isFinite(completedAt)) {
        throw new TypeError('getWallClockMs: completedAt must be a finite number');
    }

    return Math.max(0, completedAt - startedAt);
}

/**
 * @summary Creates one phase-state entry with derived wall-clock timing.
 *
 * @param {Object} options
 * @param {String} options.phase Phase identifier.
 * @param {Number} options.startedAt Epoch milliseconds.
 * @param {Number} options.completedAt Epoch milliseconds.
 * @param {String} options.status completed | skipped | failed.
 * @param {Object} [options.details={}] Phase-specific diagnostics.
 * @returns {Object} Phase state entry.
 */
export function createRemPhaseState({
    phase,
    startedAt,
    completedAt,
    status,
    details = {}
}) {
    if (typeof phase !== 'string' || phase.length === 0) {
        throw new TypeError('createRemPhaseState: phase is required');
    }
    if (!['completed', 'skipped', 'failed'].includes(status)) {
        throw new TypeError(`createRemPhaseState: invalid status '${status}'`);
    }

    return {
        phase,
        startedAt,
        completedAt,
        wallClockMs: getWallClockMs(startedAt, completedAt),
        status,
        details
    };
}

/**
 * @summary Creates the durable cycle-level REM state entry.
 *
 * @param {Object} options
 * @returns {Object} JSONL-ready state entry.
 */
export function createRemRunStateEntry({
    runId,
    reason,
    startedAt,
    completedAt,
    configuredCadenceMs,
    overflowThreshold,
    outcome,
    reasonCode,
    failurePhase = null,
    failureReason = null,
    perPhaseStates = [],
    perSessionStates = []
}) {
    if (typeof runId !== 'string' || runId.length === 0) {
        throw new TypeError('createRemRunStateEntry: runId is required');
    }
    if (!Number.isFinite(configuredCadenceMs) || configuredCadenceMs <= 0) {
        throw new TypeError('createRemRunStateEntry: configuredCadenceMs must be a positive number');
    }
    if (!Number.isFinite(overflowThreshold) || overflowThreshold <= 0) {
        throw new TypeError('createRemRunStateEntry: overflowThreshold must be a positive number');
    }

    const wallClockMs             = getWallClockMs(startedAt, completedAt);
    const cycleOverflowRatio      = wallClockMs / configuredCadenceMs;
    const completedPhases         = perPhaseStates.filter(item => item.status === 'completed');
    const lastCompletedPhaseEntry = completedPhases.length > 0 ? completedPhases[completedPhases.length - 1] : null;

    return {
        runId,
        reason,
        startedAt,
        completedAt,
        wallClockMs,
        configuredCadenceMs,
        cycleOverflowSignal: wallClockMs > configuredCadenceMs * overflowThreshold,
        cycleOverflowRatio,
        outcome,
        reasonCode,
        failurePhase,
        failureReason,
        lastSuccessfulPhase: lastCompletedPhaseEntry ? lastCompletedPhaseEntry.phase : null,
        cycleScopePhases   : perPhaseStates.map(item => item.phase),
        perPhaseStates,
        perSessionStates
    };
}

/**
 * @summary Prunes the REM run-state directory down to the most-recent `retentionLimit` artifacts.
 *
 * This is the write-side retention cap: bounding the on-disk artifact count on each append also
 * bounds the read-path stat fan-out, because {@link readRecentRemRunStates} can never scan more
 * files than the retained set. Choosing a write-side cap over an orchestrator cleanup lane avoids
 * a cross-service boundary (the JSONL store stays self-contained, filesystem-durable). Retention
 * sorts by `mtime` so it is robust to any run-id shape, and removes the oldest beyond the bound.
 *
 * @param {Object} options
 * @param {String} options.dir Directory for per-run state files.
 * @param {Number} options.retentionLimit Maximum artifacts to retain; older ones are removed.
 *   Non-positive / non-finite values disable pruning (no-op).
 * @returns {Promise<Number>} Count of artifacts removed.
 */
export async function pruneRemRunStates({dir, retentionLimit} = {}) {
    if (!dir || !Number.isFinite(retentionLimit) || retentionLimit <= 0) {
        return 0;
    }

    let names;
    try {
        names = await fs.readdir(dir);
    } catch (e) {
        if (e?.code === 'ENOENT') return 0;
        throw e;
    }

    const jsonlNames = names.filter(name => name.endsWith('.jsonl'));
    if (jsonlNames.length <= retentionLimit) {
        return 0;
    }

    const files = await Promise.all(jsonlNames.map(async name => {
        const filePath = path.join(dir, name);
        const stat     = await fs.stat(filePath);
        return {filePath, mtimeMs: stat.mtimeMs};
    }));

    // Newest first; everything beyond the retention bound is the oldest and gets removed.
    const toRemove = files
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(retentionLimit);

    await Promise.all(toRemove.map(file => fs.rm(file.filePath, {force: true})));

    return toRemove.length;
}

/**
 * @summary Appends one REM run state entry into its per-run JSONL artifact, then applies a
 * write-side retention cap when `retentionLimit` is supplied.
 *
 * @param {Object} entry JSONL-ready REM run state entry.
 * @param {Object} options
 * @param {String} options.dir Directory for per-run state files.
 * @param {Number} [options.retentionLimit] Maximum artifacts to retain; older ones are pruned
 *   after the append. Omitted / non-positive disables retention (no prune).
 * @returns {Promise<String>} Written file path.
 */
export async function appendRemRunState(entry, {dir, retentionLimit} = {}) {
    if (!dir) {
        throw new TypeError('appendRemRunState: dir is required');
    }

    await fs.mkdir(dir, {recursive: true});

    const filePath = path.join(dir, getRemRunStateFileName(entry.runId));
    await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');

    // Write-side retention cap: bound the artifact count (and thus the read-path stat fan-out)
    // on each append, instead of relying on a separate orchestrator cleanup lane.
    if (Number.isFinite(retentionLimit) && retentionLimit > 0) {
        await pruneRemRunStates({dir, retentionLimit});
    }

    return filePath;
}

/**
 * @summary Reads the most recent REM run state entries from the JSONL store.
 *
 * @param {Object} options
 * @param {String} options.dir Directory for per-run state files.
 * @param {Number} options.limit Maximum entries to return.
 * @returns {Promise<Object[]>} Most recent state entries, newest first.
 */
export async function readRecentRemRunStates({dir, limit} = {}) {
    if (!dir || !Number.isFinite(limit) || limit <= 0) {
        return [];
    }

    let names;
    try {
        names = await fs.readdir(dir);
    } catch (e) {
        if (e?.code === 'ENOENT') return [];
        throw e;
    }

    const files = await Promise.all(names
        .filter(name => name.endsWith('.jsonl'))
        .map(async name => {
            const filePath = path.join(dir, name);
            const stat     = await fs.stat(filePath);
            return {filePath, mtimeMs: stat.mtimeMs};
        }));

    const entries = [];

    for (const file of files.sort((a, b) => b.mtimeMs - a.mtimeMs)) {
        if (entries.length >= limit) break;

        const text  = await fs.readFile(file.filePath, 'utf8');
        const lines = text.trim().split('\n').filter(Boolean);
        const line  = lines.length > 0 ? lines[lines.length - 1] : null;
        if (!line) continue;

        try {
            entries.push(JSON.parse(line));
        } catch (e) {
            // A corrupt diagnostic artifact should not take down the healthcheck surface.
        }
    }

    return entries
        .sort((a, b) => {
            const aCompletedAt = Number.isFinite(a.completedAt) ? a.completedAt : 0;
            const bCompletedAt = Number.isFinite(b.completedAt) ? b.completedAt : 0;
            return bCompletedAt - aCompletedAt;
        })
        .slice(0, limit);
}
