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
 * **`ambiguous` means "a declaration is in play and no single ceiling can be read from it", which has
 * two causes rather than one.** The first is divergence between the channels, below. The second is a
 * declaration that names the flag while carrying no ceiling this reader will state — a value V8
 * ignores, a value Node refuses to start on, or a `NODE_OPTIONS` string Node cannot tokenize at all;
 * {@link readCeilingToken} and {@link tokenizeNodeOptions} carry the measurements. Both causes leave
 * `bytes` at `null` and both are emphatically **not** `undeclared`, which is affirmative evidence that
 * no declaration exists. Consumers already gate on `ceilingState === 'declared'`
 * (`ContainerHealthDiagnosisService`), so the widened meaning reaches them as the same refusal.
 *
 * Divergence between the two channels is reported as `ambiguous` rather than resolved. The last-wins rule is
 * consistent across all five measurements above (concatenate `NODE_OPTIONS` then the command line and
 * take the last), but it is V8's rule, not ours, and `heapSizeLimitBytes` is already observed
 * independently — so a consumer needing to know **which declaration V8 actually applied** can read that
 * back from the observed limit, and this field declines to restate a resolution it would have to keep in
 * sync with a runtime it does not control.
 *
 * **What `heapSizeLimitBytes` is not: the number the process dies at.** An earlier revision of this
 * paragraph called it *the effective ceiling*, which reads as exactly that. It is old space **plus** the
 * semi-space allowance described above, so it sits strictly above the declared `--max-old-space-size`,
 * and the process aborts on old-space exhaustion — at the declaration, not at this limit. A saturation
 * ratio taken against it understates pressure by the whole gap (768 MiB declared reports 816 MiB under a
 * 1 GiB cgroup) and reproduces this record's originating cross-scope defect one scope in, wearing a
 * V8-scoped name. `oldGenerationUsedBytes ÷ declaredCeilingBytes` is the ratio; this field is what V8
 * *reports*, kept because the gap between the two is the evidence that the declaration took effect.
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
 * Matches an argument token that names the old-generation ceiling flag, capturing its raw value.
 * `[\s\S]*` rather than `.*` so a value carrying a newline is captured instead of silently truncated:
 * only the space character separates tokens in `NODE_OPTIONS`, so a newline reaches the value intact.
 * @type {RegExp}
 */
const CEILING_FLAG = /^--max[-_]old[-_]space[-_]size(?:=([\s\S]*))?$/;

/**
 * Detects the flag name anywhere in a raw, untokenizable `NODE_OPTIONS` value. Deliberately unanchored
 * and used only when tokenization failed: at that point no token boundaries exist to anchor to, and the
 * question has narrowed to whether the unreadable value is one worth failing closed over.
 * @type {RegExp}
 */
const NAMES_CEILING_FLAG = /--max[-_]old[-_]space[-_]size/;

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
 * The two channels are also **parsed** differently, which is not an inconsistency but the measured
 * behaviour: `NODE_OPTIONS` is quote-aware syntax Node consumes itself, while an `execArgv` entry
 * reaches V8 verbatim. {@link tokenizeNodeOptions} covers the split and why applying it to both would
 * credit declarations that cannot exist.
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
                const read = readCeilingToken(String(arg));

                read && found.push({bytes: read.bytes, source})
            }

            return found
        },
        // `null` means the value is one Node itself rejects, so no token list exists to read. The two
        // channels get different treatment on purpose: quotes are NODE_OPTIONS syntax and are illegal
        // in `execArgv` — see {@link tokenizeNodeOptions}.
        envTokens = typeof nodeOptions === 'string' ? tokenizeNodeOptions(nodeOptions) : [],
        envValues = envTokens === null
            // Unreadable, yet it names the flag: a declaration is present and its ceiling cannot be
            // stated. That is the `ambiguous` case, never the `undeclared` one.
            ? (NAMES_CEILING_FLAG.test(nodeOptions) ? [{bytes: null, source: CEILING_SOURCE.nodeOptions}] : [])
            : readFrom(envTokens, CEILING_SOURCE.nodeOptions),
        values  = [...envValues, ...readFrom(execArgv, CEILING_SOURCE.execArgv)],
        sources = Object.freeze([...new Set(values.map(value => value.source))]);

    if (values.length === 0) {
        return {state: CEILING_STATE.undeclared, bytes: null, sources}
    }

    // A declaration exists, so `undeclared` is off the table from here — it is affirmative evidence
    // that none was found, and returning it for a flag that is present is the false negative this
    // whole record exists to prevent. A `null` bytes entry is a declaration whose ceiling could not
    // be read; it degrades the answer to `ambiguous` exactly as a disagreement between two readable
    // ones does, because both mean "a declaration is in play and I decline to name a number".
    if (values.some(value => value.bytes === null || value.bytes !== values[0].bytes)) {
        return {state: CEILING_STATE.ambiguous, bytes: null, sources}
    }

    return {state: CEILING_STATE.declared, bytes: values[0].bytes, sources}
}

/**
 * @summary Splits a raw `NODE_OPTIONS` value into argument tokens the way Node itself does.
 *
 * This is a transcription of Node's `ParseNodeOptionsEnvVar` (`src/node_options.cc`), not a shell
 * parser and not a richer one: **double quotes are removed wherever they appear**, a backslash escapes
 * the next character only *inside* a quoted run, and **only the space character separates** — a tab
 * does not. Measured on node `v25.9.0`, all five of these apply an identical 256 MiB ceiling
 * (`heap_size_limit = 469762048` against a 4288 MiB baseline):
 *
 * | `NODE_OPTIONS`                  | ceiling in force |
 * |---------------------------------|------------------|
 * | `--max-old-space-size=256`      | yes              |
 * | `"--max-old-space-size=256"`    | yes              |
 * | `--max-old-space-size="256"`    | yes              |
 * | `"--max-old-space-size"=256`    | yes              |
 * | `--max-old-space-size=25"6"`    | yes              |
 *
 * The superseded revision whitespace-split and applied an unquoted-token regex, and its comment
 * asserted Node accepts no quoting here. Four of those five rows therefore reported `undeclared` for a
 * process that was genuinely bounded — the exact false-negative direction {@link CEILING_STATE} was
 * written to eliminate on the `execArgv`-only bug, reintroduced one channel over. Note that matching
 * only the two *shapes* named above would still miss row five, so the transcription is the fix rather
 * than a pair of extra patterns: the mechanism strips quotes, it does not recognise forms.
 *
 * **The asymmetry with `execArgv` is real and measured.** Quoting is `NODE_OPTIONS` syntax that Node
 * consumes before V8 sees the flag; the same text arriving through the command line reaches V8 intact
 * and Node **refuses to start** (`--max-old-space-size="256"` → *Value for flag ... of type size_t is
 * out of bounds*). So a live process can never carry a quoted `execArgv` entry, and stripping quotes
 * there would credit a declaration that cannot exist. Only this channel is tokenized.
 *
 * @param {String} nodeOptions Raw `NODE_OPTIONS` value.
 * @returns {String[]|null} The tokens, or `null` for a value Node rejects outright — an unterminated
 * quoted run or a trailing escape, both of which abort startup rather than yielding a process to
 * observe.
 */
function tokenizeNodeOptions(nodeOptions) {
    const tokens = [];

    let inString    = false,
        startNewArg = true;

    for (let index = 0; index < nodeOptions.length; index++) {
        let char = nodeOptions[index];

        if (char === '\\' && inString) {
            if (index + 1 === nodeOptions.length) {
                return null
            }

            char = nodeOptions[++index]
        } else if (char === ' ' && !inString) {
            startNewArg = true;
            continue
        } else if (char === '"') {
            inString = !inString;
            continue
        }

        if (startNewArg) {
            tokens.push(char);
            startNewArg = false
        } else {
            tokens[tokens.length - 1] += char
        }
    }

    return inString ? null : tokens
}

/**
 * @summary Reads one already-tokenized argument as a ceiling declaration.
 *
 * Separating "does this name the flag" from "can I read its value" is what keeps a broken declaration
 * out of the `undeclared` bucket. The value rule is measured against what V8 does with it rather than
 * assumed, on node `v25.9.0` and against a 4288 MiB baseline:
 *
 * | value                    | node starts | ceiling in force | read as    |
 * |--------------------------|-------------|------------------|------------|
 * | `256`, `0256`            | yes         | 256 MiB          | `declared` |
 * | `+256`                   | yes         | 256 MiB          | `declared` |
 * | `0`                      | yes         | **no**           | ambiguous  |
 * | `-256`                   | yes         | **no**           | ambiguous  |
 * | `99999999999999999999`   | yes         | **no**           | ambiguous  |
 * | `256abc`, `256.0`        | **no**      | —                | ambiguous  |
 * | *(no `=value` at all)*   | **no**      | —                | ambiguous  |
 *
 * The superseded `=(\d+)` predicate got two of these wrong in both directions at once: it reported
 * `undeclared` for `+256`, which bounds the process at 256 MiB, and `declared` at **zero bytes** for
 * `=0`, which bounds nothing at all — a ceiling of zero makes every saturation ratio taken against it
 * infinite. V8 silently ignores the three "no" rows, so each is a declaration whose ceiling is not
 * what it says; naming a number for any of them would be worse than declining to.
 *
 * The upper bound is `Number.isSafeInteger` on the byte product rather than a transcribed V8 `size_t`
 * limit: the point is to never state a byte count this runtime cannot represent exactly, which is a
 * property of the arithmetic here and needs no constant from a runtime we do not control.
 *
 * @param {String} token One argument token.
 * @returns {Object|null} `{bytes}` when the token names the flag — `bytes` is `null` when it names it
 * without a readable ceiling — or `null` when the token is some other flag entirely.
 */
function readCeilingToken(token) {
    const match = CEILING_FLAG.exec(token);

    if (!match) {
        return null
    }

    const digits = /^\+?(\d+)$/.exec(match[1] ?? ''),
          mib    = digits ? Number(digits[1]) : NaN;

    return {bytes: mib > 0 && Number.isSafeInteger(mib * MEGABYTE) ? mib * MEGABYTE : null}
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
