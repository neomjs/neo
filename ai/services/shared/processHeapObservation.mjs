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
 * `ambiguous` exists because the flag reaches a process through **two independent channels** that
 * Node does not merge: the command line lands in `process.execArgv`, while `NODE_OPTIONS` takes
 * effect without appearing there at all. Measured on node `v25.9.0`:
 *
 * | declaration                          | `execArgv` contains it | `heap_size_limit` |
 * |--------------------------------------|------------------------|-------------------|
 * | `NODE_OPTIONS=--max-old-space-size=256` | no                  | 448 MiB (256 + gap) |
 * | CLI `--max-old-space-size=256`          | yes                 | 448 MiB             |
 * | `NODE_OPTIONS=256` + CLI `512`          | CLI only            | 704 MiB (512 wins)  |
 * | `NODE_OPTIONS=512` + CLI `256`          | CLI only            | 448 MiB (256 wins)  |
 *
 * An earlier revision of this file asserted that Node merges `NODE_OPTIONS` into `execArgv`. It does
 * not, and the error was not cosmetic: reading only `execArgv` reports `undeclared` for a process
 * running under a ceiling that is genuinely in force — a false negative in the direction that reads
 * as "nobody bounded this", which is precisely the claim this record exists to make falsifiable. Both
 * channels are now read.
 *
 * Divergence between the two is reported as `ambiguous` rather than resolved. The last-wins rule is
 * consistent across all five measurements above (concatenate `NODE_OPTIONS` then the command line and
 * take the last), but it is V8's rule, not ours, and `heapSizeLimitBytes` is already observed
 * independently — so a consumer that needs the effective ceiling has it, and this field declines to
 * restate a resolution it would have to keep in sync with a runtime it does not control.
 * @type {Object}
 */
export const CEILING_STATE = Object.freeze({
    declared  : 'declared',
    undeclared: 'undeclared',
    ambiguous : 'ambiguous'
});

/**
 * Where a declared ceiling was read from. Published because the deployment forbids one of them:
 * `ai/deploy/docker-compose.yml` sets every heap ceiling `command:`-scoped and never through
 * `NODE_OPTIONS`, because `ProcessSupervisorService` spawns children with `{...process.env}` and a
 * service-level `NODE_OPTIONS` would silently multiply the container budget by the number of
 * concurrent Node processes. A record naming `node-options` is therefore a deployment-drift signal
 * rather than a detail, and it can only be one if the source is on the record.
 * @type {Object}
 */
export const CEILING_SOURCE = Object.freeze({execArgv: 'exec-argv', nodeOptions: 'node-options'});

/**
 * Reasons a capture could not be made. Each names the instrument that failed, never the subject.
 * @type {Object}
 */
export const UNAVAILABLE_REASON = Object.freeze({
    clockUnreadable      : 'clock-unreadable',
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
 * Both declaration channels are read, because Node does not merge them — see {@link CEILING_STATE}
 * for the measurements. `sources` names which channels carried a declaration, so a ceiling arriving
 * through `NODE_OPTIONS` on a deployment that forbids it is visible rather than merely counted.
 *
 * @param {String[]} [execArgv]    Node execution arguments.
 * @param {String}   [nodeOptions] Raw `NODE_OPTIONS` value.
 * @returns {Object} `{state, bytes, sources}` where `bytes` is `null` for every non-`declared` state.
 */
export function readDeclaredCeiling(execArgv = [], nodeOptions = '') {
    const
        readFrom = (args, source) => {
            const found = [];

            for (const arg of Array.isArray(args) ? args : []) {
                const match = /^--max[-_]old[-_]space[-_]size=(\d+)$/.exec(String(arg));

                match && found.push({bytes: Number(match[1]) * MEGABYTE, source})
            }

            return found
        },
        // Whitespace-split rather than shell-parsed: Node accepts no quoting inside NODE_OPTIONS for
        // this flag, and a parser richer than the input it reads invents cases it cannot verify.
        envArgs = typeof nodeOptions === 'string' ? nodeOptions.split(/\s+/).filter(Boolean) : [],
        values  = [...readFrom(envArgs, CEILING_SOURCE.nodeOptions), ...readFrom(execArgv, CEILING_SOURCE.execArgv)],
        sources = Object.freeze([...new Set(values.map(value => value.source))]);

    if (values.length === 0) {
        return {state: CEILING_STATE.undeclared, bytes: null, sources}
    }

    if (values.some(value => value.bytes !== values[0].bytes)) {
        return {state: CEILING_STATE.ambiguous, bytes: null, sources}
    }

    return {state: CEILING_STATE.declared, bytes: values[0].bytes, sources}
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
 * **Every source is guarded, including the clock.** An earlier revision called `readNow()` outside the
 * guard while promising a total envelope, so a failing timestamp source threw out of a function
 * documented never to throw — and this runs on a reporting cadence inside a live service. A clock that
 * cannot be read yields `observedAt: null` under `clock-unreadable` rather than a substituted
 * `Date.now()`: the injected source is the one the caller chose, and silently swapping in another
 * would make the record's stamp describe a clock nobody asked for. The bridge reader already refuses a
 * non-finite stamp as `malformed`, so the channel degrades to absence instead of to a wrong age.
 *
 * @param {Object}    [options]
 * @param {String[]}  [options.execArgv]        Argument vector to read the declared ceiling from.
 * @param {String}    [options.nodeOptions]     Raw `NODE_OPTIONS`, the second declaration channel.
 * @param {Function}  [options.readHeapStats]   Returns `v8.getHeapStatistics()`.
 * @param {Function}  [options.readHeapSpaces]  Returns `v8.getHeapSpaceStatistics()`.
 * @param {Function}  [options.readMemoryUsage] Returns `process.memoryUsage()`.
 * @param {Function}  [options.readNow]         Returns epoch milliseconds.
 * @returns {Object} The observation record. Always carries `state`; every measured field is `null`
 * when `state` is `unavailable`, and `observedAt` is `null` only when the clock source itself failed.
 */
export function collectProcessHeapObservation({
    execArgv        = process.execArgv,
    nodeOptions     = process.env.NODE_OPTIONS,
    readHeapStats   = () => v8.getHeapStatistics(),
    readHeapSpaces  = () => v8.getHeapSpaceStatistics(),
    readMemoryUsage = () => process.memoryUsage(),
    readNow         = () => Date.now()
} = {}) {
    // One synchronous block, one timestamp. Introducing an `await` between any two of these reads
    // silently converts the pair into two observations of different memory states.
    const observedAt = tryRead(readNow),
          rawSpaces  = tryRead(readHeapSpaces),
          rawStats   = tryRead(readHeapStats),
          rawMemory  = tryRead(readMemoryUsage),
          ceiling    = tryRead(() => readDeclaredCeiling(execArgv, nodeOptions)) ||
                       {state: CEILING_STATE.undeclared, bytes: null, sources: []};

    const unavailable = reason => ({
        observedAt            : Number.isFinite(observedAt) ? observedAt : null,
        state                 : HEAP_OBSERVATION_STATE.unavailable,
        unavailableReason     : reason,
        ceilingState          : ceiling.state,
        declaredCeilingBytes  : ceiling.bytes,
        ceilingSources        : ceiling.sources,
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

    if (!Number.isFinite(observedAt)) {
        return unavailable(UNAVAILABLE_REASON.clockUnreadable)
    }

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
        ceilingSources      : ceiling.sources,
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
