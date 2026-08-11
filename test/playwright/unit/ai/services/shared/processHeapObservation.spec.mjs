import fs   from 'node:fs';
import path from 'node:path';

import {test, expect} from '@playwright/test';

import {
    CEILING_STATE,
    HEAP_OBSERVATION_STATE,
    UNAVAILABLE_REASON,
    collectProcessHeapObservation,
    readDeclaredCeiling
} from '../../../../../../ai/services/shared/processHeapObservation.mjs';

const MEGABYTE = 1024 * 1024;

/**
 * Spaces as node `v24.16.0` reports them, trimmed to the entries that carry bytes. `trusted_space`
 * is present on this line and absent on older ones, which is why the module sums "not a new space"
 * rather than an allowlist of names.
 */
const spacesFixture = () => [
    {space_name: 'read_only_space',    space_size:         0, space_used_size:         0, space_available_size:       0},
    {space_name: 'new_space',          space_size:  1 * MEGABYTE, space_used_size: 400_000, space_available_size: 600_000},
    {space_name: 'old_space',          space_size: 10 * MEGABYTE, space_used_size: 9_000_000, space_available_size: 1_000_000},
    {space_name: 'code_space',         space_size:  2 * MEGABYTE, space_used_size: 1_000_000, space_available_size: 1_000_000},
    {space_name: 'trusted_space',      space_size:  4 * MEGABYTE, space_used_size: 3_000_000, space_available_size: 1_000_000},
    {space_name: 'new_large_object_space', space_size: 0, space_used_size: 100_000, space_available_size: 0},
    {space_name: 'large_object_space', space_size:  8 * MEGABYTE, space_used_size: 8_000_000, space_available_size: 0}
];

/** Real container numbers: 768 MiB declared reports an 816 MiB limit under a 1 GiB cgroup. */
const statsFixture = ({heapSizeLimit = 816 * MEGABYTE} = {}) => ({
    heap_size_limit     : heapSizeLimit,
    used_heap_size      : 21_500_000,
    total_heap_size     : 25 * MEGABYTE,
    total_available_size: heapSizeLimit - 21_500_000
});

const memoryFixture = () => ({
    rss         : 47 * MEGABYTE,
    external    : 1_700_000,
    arrayBuffers: 20_000,
    heapTotal   : 25 * MEGABYTE,
    heapUsed    : 21_500_000
});

// `nodeOptions` is pinned to empty rather than left to default. The default reads
// `process.env.NODE_OPTIONS`, which a CI runner or a developer shell may legitimately set — leaving it
// open would make every ceiling assertion below depend on the environment the suite happens to run in.
const collect = (overrides = {}) => collectProcessHeapObservation({
    execArgv       : ['--max-old-space-size=768'],
    nodeOptions    : '',
    readNow        : () => 1_786_234_678_257,
    readHeapSpaces : spacesFixture,
    readHeapStats  : () => statsFixture(),
    readMemoryUsage: memoryFixture,
    ...overrides
});

/**
 * @summary The single-instant capture contract and the vocabulary that keeps an unreadable heap from
 * reading as an empty one.
 *
 * Two defects motivate these specs, both measured on the shipped deployment. Container memory
 * oscillates ~93 MiB inside 45 seconds under ordinary load, so a heap reading paired with a non-heap
 * reading from another moment is an artefact rather than a split — hence the microtask falsifier
 * below, which convicts an `await` between sources where a call-count assertion would pass. And the
 * gap between a declared ceiling and the reported limit is a stepped function of the memory limit V8
 * detected at startup (`+48 MiB` at 1 GiB, `+192` at 4 GiB), so a constant published from a host
 * measurement described no container — hence the specs pinning `heapSizeLimitBytes` as observed.
 */
test.describe('ai/services/shared/processHeapObservation — one instant, no derived constants', () => {
    test('every source is read inside ONE synchronous block', () => {
        // If an `await` is ever introduced between two reads, the pending microtask drains in the
        // gap. A synchronous capture cannot let it run, so every witness must see `false` — and all
        // four must have run by the time this assertion executes, which an async rewrite fails too
        // (only the pre-await reads would have happened).
        let microtaskDrained = false;

        Promise.resolve().then(() => {microtaskDrained = true});

        const witnessed = [],
              witness   = value => () => {
                  witnessed.push(microtaskDrained);
                  return typeof value === 'function' ? value() : value
              };

        collect({
            readNow        : witness(1_786_234_678_257),
            readHeapSpaces : witness(spacesFixture),
            readHeapStats  : witness(() => statsFixture()),
            readMemoryUsage: witness(memoryFixture)
        });

        expect(witnessed).toHaveLength(4);
        expect(witnessed).toEqual([false, false, false, false]);
    });

    test('the whole record carries ONE timestamp', () => {
        let tick = 0;

        const observation = collect({readNow: () => ++tick});

        expect(observation.observedAt).toBe(1);
        expect(tick).toBe(1);
    });

    test('`heapSizeLimitBytes` is the observed limit, never derived from the declaration', () => {
        // Same 768 MiB declaration, two environments: 816 MiB under a 1 GiB cgroup, 960 MiB at 4 GiB.
        // A module that applied any constant would report one of these for both.
        const inContainer = collect({readHeapStats: () => statsFixture({heapSizeLimit: 816 * MEGABYTE})}),
              onHost      = collect({readHeapStats: () => statsFixture({heapSizeLimit: 960 * MEGABYTE})});

        expect(inContainer.declaredCeilingBytes).toBe(768 * MEGABYTE);
        expect(onHost.declaredCeilingBytes).toBe(768 * MEGABYTE);

        expect(inContainer.heapSizeLimitBytes).toBe(816 * MEGABYTE);
        expect(onHost.heapSizeLimitBytes).toBe(960 * MEGABYTE);
    });

    test('the old generation is every space that is not a new space', () => {
        const observation = collect();

        // old + code + trusted + large_object — including `trusted_space`, which an allowlist written
        // against an older node line would have silently dropped.
        expect(observation.oldGenerationUsedBytes).toBe(9_000_000 + 1_000_000 + 3_000_000 + 8_000_000);
        expect(observation.newGenerationUsedBytes).toBe(400_000 + 100_000);
    });

    test('a space V8 has not shipped yet counts as old generation, not as nothing', () => {
        const withFutureSpace = collect({
            readHeapSpaces: () => [
                ...spacesFixture(),
                {space_name: 'future_space', space_size: 5 * MEGABYTE, space_used_size: 5_000_000, space_available_size: 0}
            ]
        });

        expect(withFutureSpace.oldGenerationUsedBytes).toBe(21_000_000 + 5_000_000);
    });

    test('raw spaces ride beside the sums so the arithmetic stays falsifiable', () => {
        const observation = collect(),
              recomputed  = observation.spaces
                  .filter(space => !space.name.startsWith('new_'))
                  .reduce((total, space) => total + space.usedBytes, 0);

        expect(recomputed).toBe(observation.oldGenerationUsedBytes);
    });

    test('the non-heap side is recorded raw, with no derived remainder', () => {
        const observation = collect();

        expect(observation.rssBytes).toBe(47 * MEGABYTE);
        expect(observation.externalBytes).toBe(1_700_000);
        expect(observation.arrayBuffersBytes).toBe(20_000);
    });
});

test.describe('ai/services/shared/processHeapObservation — the declared ceiling', () => {
    test('one declaration is observable, and names the channel it came from', () => {
        expect(readDeclaredCeiling(['--max-old-space-size=768'])).toEqual({
            state  : CEILING_STATE.declared,
            bytes  : 768 * MEGABYTE,
            sources: ['exec-argv']
        });
    });

    test('no declaration is `undeclared`, not zero', () => {
        const {state, bytes} = readDeclaredCeiling([]);

        expect(state).toBe(CEILING_STATE.undeclared);
        expect(bytes).toBeNull();
    });

    test('agreeing duplicates in one vector stay observable', () => {
        expect(readDeclaredCeiling(['--max-old-space-size=768', '--max-old-space-size=768']).state)
            .toBe(CEILING_STATE.declared);
    });

    // ---- The two-channel regression. -------------------------------------------------------------
    // A prior revision documented `NODE_OPTIONS` as merging into `process.execArgv` and read only
    // `execArgv`. Measured on node v25.9.0, it does NOT merge: with
    // `NODE_OPTIONS=--max-old-space-size=256`, `execArgv` carries no flag while `heap_size_limit`
    // reports 448 MiB — the ceiling is in force and unreported. These pin the repair, and each fails
    // against the old single-channel reader.

    test('a ceiling declared ONLY through NODE_OPTIONS is declared, not undeclared', () => {
        const {state, bytes, sources} = readDeclaredCeiling([], '--max-old-space-size=256');

        expect(state).toBe(CEILING_STATE.declared);
        expect(bytes).toBe(256 * MEGABYTE);
        expect(sources).toEqual(['node-options']);
    });

    test('a NODE_OPTIONS ceiling is found among unrelated options', () => {
        expect(readDeclaredCeiling([], '--enable-source-maps --max-old-space-size=256 --no-warnings').bytes)
            .toBe(256 * MEGABYTE);
    });

    test('both channels agreeing is declared once, and reports both sources', () => {
        const {state, bytes, sources} = readDeclaredCeiling(['--max-old-space-size=768'], '--max-old-space-size=768');

        expect(state).toBe(CEILING_STATE.declared);
        expect(bytes).toBe(768 * MEGABYTE);
        expect(sources).toEqual(['node-options', 'exec-argv']);
    });

    test('channels that DISAGREE are ambiguous — the resolution is V8s, not ours', () => {
        // Measured: the command line wins (NODE_OPTIONS 512 + CLI 256 reports a 448 MiB limit). The
        // rule is not restated here because `heapSizeLimitBytes` is observed independently, so a
        // consumer needing the effective ceiling already has it from the instrument rather than from
        // a rule this module would have to keep in sync with a runtime it does not control.
        const {state, bytes} = readDeclaredCeiling(['--max-old-space-size=256'], '--max-old-space-size=512');

        expect(state).toBe(CEILING_STATE.ambiguous);
        expect(bytes).toBeNull();
    });

    test('divergent declarations are ambiguous, never a pick', () => {
        const {state, bytes} = readDeclaredCeiling(['--max-old-space-size=768', '--max-old-space-size=200']);

        expect(state).toBe(CEILING_STATE.ambiguous);
        expect(bytes).toBeNull();
    });

    // ---- The quoting regression. -----------------------------------------------------------------
    // The repair above read both channels but whitespace-split NODE_OPTIONS and applied an
    // unquoted-token regex, asserting in a comment that Node accepts no quoting here. Measured on node
    // v25.9.0 by spawning real children with an explicit env object, every row below applies an
    // identical 256 MiB ceiling — `heap_size_limit = 469762048` against a 4288 MiB baseline — while the
    // superseded reader called four of the five `undeclared`. Node strips double quotes wherever they
    // appear (`ParseNodeOptionsEnvVar`), so recognising SHAPES would still miss the last row; the
    // tokenizer transcribes the mechanism instead.

    for (const nodeOptions of [
        '--max-old-space-size=256',
        '"--max-old-space-size=256"',
        '--max-old-space-size="256"',
        '"--max-old-space-size"=256',
        '--max-old-space-size=25"6"'
    ]) {
        test(`a quoted NODE_OPTIONS ceiling is in force and must read as declared: ${nodeOptions}`, () => {
            expect(readDeclaredCeiling([], nodeOptions)).toEqual({
                state  : CEILING_STATE.declared,
                bytes  : 256 * MEGABYTE,
                sources: ['node-options']
            });
        });
    }

    test('quoting is stripped WITHOUT swallowing the options around it', () => {
        // The control for the row above: a tokenizer that over-matched would credit a ceiling here, or
        // lose one. Measured — this exact value boots with the 256 MiB ceiling in force.
        expect(readDeclaredCeiling([], '"--enable-source-maps" --max-old-space-size=256 --no-warnings').bytes)
            .toBe(256 * MEGABYTE);
        // ...and a quoted option that is NOT the ceiling flag is still no declaration at all.
        expect(readDeclaredCeiling([], '"--enable-source-maps" --no-warnings')).toEqual({
            state: CEILING_STATE.undeclared, bytes: null, sources: []
        });
    });

    test('only a SPACE separates in NODE_OPTIONS — a tab does not, and Node refuses to start', () => {
        // Measured: `--max-old-space-size=256\t--no-warnings` aborts startup with *illegal value for
        // flag* — Node's parser tests `c == ' '` literally. The superseded `/\s+/` split reported this
        // as a clean 256 MiB declaration for a process that cannot exist.
        expect(readDeclaredCeiling([], '--max-old-space-size=256\t--no-warnings').state)
            .toBe(CEILING_STATE.ambiguous);
    });

    test('a NODE_OPTIONS value Node cannot tokenize is ambiguous, never undeclared', () => {
        // Measured: an unterminated quoted run aborts startup — *invalid value for NODE_OPTIONS
        // (unterminated string)*. No process to observe, but the declaration is unmistakably present,
        // and reading "nobody bounded this" off a string that names the flag is the false negative
        // this record exists to prevent.
        expect(readDeclaredCeiling([], '"--max-old-space-size=256')).toEqual({
            state: CEILING_STATE.ambiguous, bytes: null, sources: ['node-options']
        });

        // An unreadable value that does NOT name the flag is genuinely no declaration of ours.
        expect(readDeclaredCeiling([], '"--enable-source-maps').state).toBe(CEILING_STATE.undeclared);
    });

    // ---- Values V8 accepts, ignores, or rejects. --------------------------------------------------

    test('a leading + is a real ceiling, not an absent one', () => {
        // Measured: `+256` boots with the 256 MiB ceiling in force. `=(\d+)` missed it — the same
        // false-negative direction as the quoting rows, from the same predicate.
        expect(readDeclaredCeiling([], '--max-old-space-size=+256').bytes).toBe(256 * MEGABYTE);
        expect(readDeclaredCeiling(['--max-old-space-size=0256']).bytes).toBe(256 * MEGABYTE);
    });

    test('a value V8 IGNORES is ambiguous, never a ceiling of that number', () => {
        // Measured: each of these boots at the 4288 MiB baseline — the declaration binds nothing. The
        // superseded predicate reported `=0` as `declared` at ZERO bytes, which is worse than missing
        // it: every saturation ratio taken against a zero ceiling is infinite, so an unbounded process
        // reads as catastrophically saturated.
        for (const value of ['0', '-256', '99999999999999999999']) {
            const {state, bytes} = readDeclaredCeiling([`--max-old-space-size=${value}`]);

            expect(state, `--max-old-space-size=${value}`).toBe(CEILING_STATE.ambiguous);
            expect(bytes,  `--max-old-space-size=${value}`).toBeNull();
        }
    });

    test('a value Node REFUSES to start on is ambiguous, and so is a bare flag', () => {
        // Measured: `256abc` and `256.0` both abort startup (*illegal value for flag*), and the
        // space-separated form `--max-old-space-size 256` aborts too — the flag takes no detached
        // value. All three name the ceiling; none yields one.
        for (const arg of ['--max-old-space-size=256abc', '--max-old-space-size=256.0', '--max-old-space-size']) {
            expect(readDeclaredCeiling([arg]).state, arg).toBe(CEILING_STATE.ambiguous);
        }
    });

    test('quoting is NODE_OPTIONS syntax only — the same text in execArgv cannot be a ceiling', () => {
        // The asymmetry is measured, not stylistic: Node consumes the quotes before V8 sees the flag,
        // so `--max-old-space-size="256"` on the COMMAND LINE reaches V8 intact and aborts startup
        // (*Value for flag ... of type size_t is out of bounds*). Stripping quotes in this channel too
        // would credit a 256 MiB ceiling to a process that could never have booted.
        expect(readDeclaredCeiling(['--max-old-space-size="256"']).state).toBe(CEILING_STATE.ambiguous);
        expect(readDeclaredCeiling([], '--max-old-space-size="256"').bytes).toBe(256 * MEGABYTE);
    });

    test('a quoted NODE_OPTIONS ceiling agreeing with a plain execArgv one is declared once', () => {
        // The deployment-drift signal has to survive quoting: `ai/deploy/docker-compose.yml` forbids
        // the NODE_OPTIONS channel, and a quoted declaration that read as `undeclared` would hide
        // exactly the drift `sources` exists to expose.
        expect(readDeclaredCeiling(['--max-old-space-size=256'], '"--max-old-space-size=256"')).toEqual({
            state  : CEILING_STATE.declared,
            bytes  : 256 * MEGABYTE,
            sources: ['node-options', 'exec-argv']
        });
    });

    test('an ambiguous ceiling does not stop the heap from being observed', () => {
        // The declaration and the measurement are independent facts; losing one must not blind the
        // record to the other.
        const observation = collect({execArgv: ['--max-old-space-size=768', '--max-old-space-size=200']});

        expect(observation.state).toBe(HEAP_OBSERVATION_STATE.observed);
        expect(observation.ceilingState).toBe(CEILING_STATE.ambiguous);
        expect(observation.declaredCeilingBytes).toBeNull();
        expect(observation.heapSizeLimitBytes).toBe(816 * MEGABYTE);
    });

    test('the record says what `heapSizeLimitBytes` is NOT — and the retired wording cannot come back live', () => {
        // A structural claim about the contract, never about behaviour. `heapSizeLimitBytes` is the one
        // field on this record that reads like a ceiling and is not one: the process aborts at the
        // declaration, and this limit sits above it by the semi-space allowance. An earlier revision
        // pointed a consumer here as "the effective ceiling", which is the cross-scope defect this
        // module exists to end, re-created one scope in under a V8-scoped name.
        const source = fs.readFileSync(
            path.join(path.resolve(process.cwd()), 'ai/services/shared/processHeapObservation.mjs'), 'utf8');

        // The three facts a consumer needs in order not to reach for the wrong denominator.
        expect(source).toContain('sits strictly above the declared');
        expect(source).toContain('aborts on old-space exhaustion');
        expect(source).toContain('oldGenerationUsedBytes ÷ declaredCeilingBytes');

        // The retired phrasing survives EXACTLY ONCE, as its own retirement. A second occurrence is
        // someone describing a field that way again, which is what must not return; asserting plain
        // absence would forbid the record of the correction, and a correction nobody can read is how
        // the wording came back the first time.
        expect(source.match(/effective ceiling/g)).toHaveLength(1);
        expect(source).toContain('An earlier revision of this');
    });
});

test.describe('ai/services/shared/processHeapObservation — unavailable is never a zero', () => {
    test('an unreadable spaces API yields null fields and a reason', () => {
        const observation = collect({readHeapSpaces: () => { throw new Error('nope') }});

        expect(observation.state).toBe(HEAP_OBSERVATION_STATE.unavailable);
        expect(observation.unavailableReason).toBe(UNAVAILABLE_REASON.heapSpacesUnreadable);
        expect(observation.oldGenerationUsedBytes).toBeNull();
        expect(observation.heapSizeLimitBytes).toBeNull();
        expect(observation.rssBytes).toBeNull();
    });

    test('a STUB that satisfies `typeof fn === "function"` is still unavailable', () => {
        // The capability guard invokes rather than type-checks: a stub returning nothing usable would
        // pass a `typeof` probe on exactly the runtime the probe exists to exclude.
        const observation = collect({readHeapSpaces: () => undefined});

        expect(observation.state).toBe(HEAP_OBSERVATION_STATE.unavailable);
        expect(observation.unavailableReason).toBe(UNAVAILABLE_REASON.heapSpacesUnreadable);
    });

    test('an empty spaces array is unreadable, not an empty heap', () => {
        expect(collect({readHeapSpaces: () => []}).unavailableReason)
            .toBe(UNAVAILABLE_REASON.heapSpacesUnreadable);
    });

    test('a missing heap limit is unavailable rather than an unbounded heap', () => {
        const observation = collect({readHeapStats: () => ({used_heap_size: 1})});

        expect(observation.state).toBe(HEAP_OBSERVATION_STATE.unavailable);
        expect(observation.unavailableReason).toBe(UNAVAILABLE_REASON.heapStatsUnreadable);
    });

    test('a missing rss is unavailable rather than a process using no memory', () => {
        expect(collect({readMemoryUsage: () => ({})}).unavailableReason)
            .toBe(UNAVAILABLE_REASON.memoryUsageUnreadable);
    });

    test('a throwing CLOCK is unavailable, not a substituted Date.now()', () => {
        // The envelope is documented total, but `readNow()` was called outside the guard — so a
        // failing timestamp source threw out of a function promising never to throw, on a reporting
        // cadence inside a live service. Reverting the guard reds this with the raw throw.
        const observation = collect({readNow: () => { throw new Error('no clock') }});

        expect(observation.state).toBe(HEAP_OBSERVATION_STATE.unavailable);
        expect(observation.unavailableReason).toBe(UNAVAILABLE_REASON.clockUnreadable);
        // Null rather than a wall-clock fallback: substituting a different source would stamp the
        // record with a clock the caller did not choose, and the bridge reader refuses a non-finite
        // stamp as `malformed` — absence, never a wrong age.
        expect(observation.observedAt).toBeNull();
    });

    test('a clock returning nonsense is unavailable rather than an epoch-zero observation', () => {
        expect(collect({readNow: () => 'not-a-time'}).unavailableReason)
            .toBe(UNAVAILABLE_REASON.clockUnreadable);
    });

    test('a hostile argument vector cannot throw out of the collector', () => {
        // `String(arg)` runs over caller-supplied entries. Totality has to hold at the argument
        // boundary too, or the reporter's cadence inherits the throw.
        const observation = collect({execArgv: [{toString() { throw new Error('hostile') }}]});

        expect(observation.state).toBe(HEAP_OBSERVATION_STATE.observed);
        expect(observation.ceilingState).toBe(CEILING_STATE.undeclared);
        expect(observation.ceilingSources).toEqual([]);
    });

    test('an unavailable record still reports the declaration it could read', () => {
        // The two are independent observations. A dead heap probe does not un-declare the ceiling,
        // and a consumer needs to know the process HAD one to exhaust.
        const observation = collect({readHeapStats: () => null});

        expect(observation.state).toBe(HEAP_OBSERVATION_STATE.unavailable);
        expect(observation.ceilingState).toBe(CEILING_STATE.declared);
        expect(observation.declaredCeilingBytes).toBe(768 * MEGABYTE);
        expect(observation.observedAt).toBe(1_786_234_678_257);
    });
});
