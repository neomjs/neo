import v8 from 'node:v8';

/**
 * @module ai/services/shared/processHeapObservation
 * @summary One synchronous capture of a Node process's own memory, recording what it observed and
 * deriving no ratio from it.
 *
 * **Why a process must report this about itself.** `docker stats` returns container RSS — one number
 * fusing V8 old space, new space, native allocations, `Buffer`s and the binary. `--max-old-space-size`
 * bounds the old generation alone. Comparing the first against the second is a cross-scope ratio that
 * can go authoritative on memory V8 never touched and miss a real old-space exhaustion, and it was
 * rejected in review for exactly that. No Docker read operation can fix it, because no read operation
 * can see inside a process. Only the process can answer, so only the process can produce this record.
 *
 * **The pair is captured at one instant, and that is a structural property rather than a convention.**
 * Every source is read inside a single synchronous block with a single timestamp. Container memory on
 * this deployment was measured oscillating ~93 MiB inside 45 seconds under ordinary maintenance load,
 * so a heap reading stitched to a non-heap reading from a different moment is an arithmetic artefact,
 * not a split. The sources are injectable precisely so a spec can prove no `await` separates them —
 * see the microtask falsifier in the accompanying spec, which convicts an await-split that a
 * call-count assertion would pass.
 *
 * **`heapSizeLimitBytes` is observed, never derived.** The gap between a declared ceiling and the
 * reported limit is exactly `3 × max-semi-space-size`, and V8 sizes the semi-space from the memory
 * limit it detects at startup: `+3 MiB` under a 512 MiB cgroup, `+48` at 1 GiB, `+96` at 2 GiB, `+192`
 * at 4 GiB and above. A `+192` constant measured on two developer hosts was briefly published as an
 * acceptance criterion and describes no container this code runs in. Recording the declaration and
 * the limit as two observed fields makes the gap self-evident and lets no constant enter the
 * substrate.
 *
 * **Nothing here computes a ratio.** The record carries raw spaces alongside the sums derived from
 * them, so a consumer can falsify the arithmetic rather than inherit it, and the saturation question
 * stays with the diagnosis that owns it. A module that both measures and judges makes the judgement
 * unfalsifiable by the next reader.
 *
 * @see https://github.com/neomjs/neo/issues/16763
 */

/**
 * Did the capture produce a usable observation?
 *
 * `unavailable` carries a reason and never a zero. A process whose heap cannot be read has not
 * reported an empty heap — coercing an unreadable instrument to `0` manufactures affirmative evidence
 * of headroom out of a broken one, the same conflation
 * {@link module:ai/services/shared/captureReceipt} breaks for row counts.
 * @type {Object}
 */
export const HEAP_OBSERVATION_STATE = Object.freeze({observed: 'observed', unavailable: 'unavailable'});

/**
 * What the process can say about its own declared old-generation ceiling.
 *
 * `ambiguous` exists because `execArgv` can carry the flag more than once — directly and through
 * `NODE_OPTIONS`, which Node merges into the same array. Divergent values are reported as ambiguous
 * rather than resolved by position: the last-wins rule is V8's, and encoding a guess about it here
 * would put a number nobody measured into a record that reads as an observation.
 * @type {Object}
 */
export const CEILING_STATE = Object.freeze({
    declared  : 'declared',
    undeclared: 'undeclared',
    ambiguous : 'ambiguous'
});

/**
 * Reasons a capture could not be made. Each names the instrument that failed, never the subject.
 * @type {Object}
 */
export const UNAVAILABLE_REASON = Object.freeze({
    heapSpacesUnreadable : 'heap-spaces-unreadable',
    heapStatsUnreadable  : 'heap-stats-unreadable',
    memoryUsageUnreadable: 'memory-usage-unreadable'
});

const MEGABYTE = 1024 * 1024;

/**
 * @summary Reads the declared old-generation ceiling out of a process argument vector.
 *
 * Fail-closed on ambiguity, matching how `DeploymentStateBridgeService` treats the same flag when it
 * parses `Config.Cmd`: observable only when every declaration agrees. The two parsers see different
 * evidence about the same process — the bridge sees how the container was configured, this sees what
 * the running process actually received — so keeping one rule across both is what lets a disagreement
 * between them mean something.
 *
 * @param {String[]} [execArgv] Node execution arguments.
 * @returns {Object} `{state, bytes}` where `bytes` is `null` for every non-`declared` state.
 */
export function readDeclaredCeiling(execArgv = []) {
    const values = [];

    for (const arg of Array.isArray(execArgv) ? execArgv : []) {
        const match = /^--max[-_]old[-_]space[-_]size=(\d+)$/.exec(String(arg));

        match && values.push(Number(match[1]))
    }

    if (values.length === 0) {
        return {state: CEILING_STATE.undeclared, bytes: null}
    }

    if (values.some(value => value !== values[0])) {
        return {state: CEILING_STATE.ambiguous, bytes: null}
    }

    return {state: CEILING_STATE.declared, bytes: values[0] * MEGABYTE}
}

/**
 * @summary Sums the used and committed bytes of the spaces matching a generation.
 *
 * Old-generation membership is "every space that is not a new space" rather than an allowlist of
 * names. V8 has added spaces across releases — `trusted_space` and its shared and large-object
 * variants are present on node `v24` and were not on older lines — so an allowlist silently
 * under-reports on the next runtime it meets, in the direction that reads as headroom.
 *
 * @param {Object[]} spaces  Entries from `v8.getHeapSpaceStatistics()`.
 * @param {Boolean}  isNew   Sum the new generation when `true`, the old generation when `false`.
 * @returns {Object} `{usedBytes, sizeBytes}`.
 */
function sumGeneration(spaces, isNew) {
    let sizeBytes = 0,
        usedBytes = 0;

    for (const space of spaces) {
        if (String(space.space_name).startsWith('new_') === isNew) {
            sizeBytes += Number(space.space_size)      || 0;
            usedBytes += Number(space.space_used_size) || 0
        }
    }

    return {sizeBytes, usedBytes}
}

/**
 * @summary Captures the heap and non-heap sides of this process's memory at one instant.
 *
 * **Every source is invoked, never type-checked.** A capability probe that asks `typeof fn === 'function'`
 * is satisfied by a stub that returns nothing usable, so the guard would pass on exactly the runtime it
 * exists to exclude. The result shape is what decides availability here.
 *
 * @param {Object}    [options]
 * @param {String[]}  [options.execArgv]        Argument vector to read the declared ceiling from.
 * @param {Function}  [options.readHeapStats]   Returns `v8.getHeapStatistics()`.
 * @param {Function}  [options.readHeapSpaces]  Returns `v8.getHeapSpaceStatistics()`.
 * @param {Function}  [options.readMemoryUsage] Returns `process.memoryUsage()`.
 * @param {Function}  [options.readNow]         Returns epoch milliseconds.
 * @returns {Object} The observation record. Always carries `state` and `observedAt`; every measured
 * field is `null` when `state` is `unavailable`.
 */
export function collectProcessHeapObservation({
    execArgv        = process.execArgv,
    readHeapStats   = () => v8.getHeapStatistics(),
    readHeapSpaces  = () => v8.getHeapSpaceStatistics(),
    readMemoryUsage = () => process.memoryUsage(),
    readNow         = () => Date.now()
} = {}) {
    // One synchronous block, one timestamp. Introducing an `await` between any two of these reads
    // silently converts the pair into two observations of different memory states.
    const observedAt = readNow(),
          rawSpaces  = tryRead(readHeapSpaces),
          rawStats   = tryRead(readHeapStats),
          rawMemory  = tryRead(readMemoryUsage),
          ceiling    = readDeclaredCeiling(execArgv);

    const unavailable = reason => ({
        observedAt,
        state                 : HEAP_OBSERVATION_STATE.unavailable,
        unavailableReason     : reason,
        ceilingState          : ceiling.state,
        declaredCeilingBytes  : ceiling.bytes,
        heapSizeLimitBytes    : null,
        usedHeapBytes         : null,
        totalHeapBytes        : null,
        totalAvailableBytes   : null,
        oldGenerationUsedBytes: null,
        oldGenerationSizeBytes: null,
        newGenerationUsedBytes: null,
        rssBytes              : null,
        externalBytes         : null,
        arrayBuffersBytes     : null,
        spaces                : null
    });

    if (!Array.isArray(rawSpaces) || rawSpaces.length === 0 || !rawSpaces[0]?.space_name) {
        return unavailable(UNAVAILABLE_REASON.heapSpacesUnreadable)
    }

    if (!rawStats || !Number.isFinite(rawStats.heap_size_limit)) {
        return unavailable(UNAVAILABLE_REASON.heapStatsUnreadable)
    }

    if (!rawMemory || !Number.isFinite(rawMemory.rss)) {
        return unavailable(UNAVAILABLE_REASON.memoryUsageUnreadable)
    }

    const oldGeneration = sumGeneration(rawSpaces, false),
          newGeneration = sumGeneration(rawSpaces, true);

    return {
        observedAt,
        state               : HEAP_OBSERVATION_STATE.observed,
        unavailableReason   : null,
        ceilingState        : ceiling.state,
        declaredCeilingBytes: ceiling.bytes,
        // Observed, never computed from `declaredCeilingBytes` — the gap between them is a stepped
        // function of the memory limit V8 detected at startup, not a constant.
        heapSizeLimitBytes    : rawStats.heap_size_limit,
        usedHeapBytes         : rawStats.used_heap_size,
        totalHeapBytes        : rawStats.total_heap_size,
        totalAvailableBytes   : rawStats.total_available_size,
        oldGenerationUsedBytes: oldGeneration.usedBytes,
        oldGenerationSizeBytes: oldGeneration.sizeBytes,
        newGenerationUsedBytes: newGeneration.usedBytes,
        rssBytes              : rawMemory.rss,
        externalBytes         : rawMemory.external,
        arrayBuffersBytes     : rawMemory.arrayBuffers,
        // Raw evidence beside the sums derived from it, so a consumer can falsify the arithmetic
        // instead of inheriting it.
        spaces                : rawSpaces.map(space => ({
            name          : space.space_name,
            sizeBytes     : space.space_size,
            usedBytes     : space.space_used_size,
            availableBytes: space.space_available_size
        }))
    }
}

/**
 * @summary Invokes a source and converts a throw into an absent reading.
 * @param {Function} read The source to invoke.
 * @returns {*} The source's result, or `null` when it threw or is not callable.
 */
function tryRead(read) {
    try {
        return read()
    } catch (error) {
        return null
    }
}
