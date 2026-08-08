import {expect, test} from '@playwright/test';
import {readFile}     from 'node:fs/promises';
import {
    ADAPTER_STATES,
    ADAPTER_STATE_NAMES,
    ROSTER_STATE_LABELS,
    STREAM_STATE_LABELS,
    computeFirstPaintVerdict,
    isAdapterRenderCoherent,
    resolveAdapterState
} from '../../../../harness/adapterWitness.mjs';

// The shell's FINAL VERDICT, which had no coverage at all while it lived inline in `main.mjs` — a file
// that exports nothing and only runs under Electron. The preload observer was well covered; the half
// the release gate actually reads was not. That asymmetry is the reason this module exists.
//
// Every invariant below is paired with a control that violates it, and the coherence check itself is
// mutation-discriminated: forcing it true must turn a case red.

const classList = names => ({contains: name => names.includes(name)});

/** A healthy sanitised report; overrides shape the case under test. */
const report = (overrides = {}) => ({
    cockpitVisible  : true,
    cardCount       : 10,
    rosterState     : 'sample',
    rosterLabel     : 'static roster',
    streamState     : 'sample',
    activityLabel   : 'sample · live feed pending',
    firstPaintMs    : 800,
    timedOut        : false,
    tourControlCount: 0,
    ...overrides
});

const verdict = (overrides = {}, env = {}) => computeFirstPaintVerdict({
    firstPaint  : report(overrides),
    packagedMode: true,
    brainMode   : true,
    brainUp     : true,
    ...env
});

test.describe('resolveAdapterState — exactly one known class, or unknown', () => {
    test('resolves each known state', () => {
        for (const state of ADAPTER_STATES) {
            expect(resolveAdapterState(name => name === `is-${state}`)).toBe(state);
        }
    })

    test('⭐ AMBIGUOUS: two known classes report `unknown`, never the first one listed', () => {
        // First-match resolution gave a confident answer about a contradictory DOM, preferring whichever
        // state sat earlier in the list — so `is-live is-sample` reported `live`.
        expect(resolveAdapterState(classList(['is-live', 'is-sample']).contains)).toBe('unknown');
        expect(resolveAdapterState(classList(['is-sample', 'is-stale']).contains)).toBe('unknown');
        expect(resolveAdapterState(classList(ADAPTER_STATES.map(s => `is-${s}`)).contains)).toBe('unknown');
    })

    test('no known class reports `unknown`', () => {
        expect(resolveAdapterState(() => false)).toBe('unknown');
        expect(resolveAdapterState(name => name === 'is-reconciling')).toBe('unknown');
    })
});

test.describe('isAdapterRenderCoherent — agreement, not a pinned state', () => {
    test('every state passes with its own label', () => {
        for (const [state, label] of Object.entries(ROSTER_STATE_LABELS)) {
            expect(isAdapterRenderCoherent(state, label, ROSTER_STATE_LABELS)).toBe(true);
        }
        for (const [state, label] of Object.entries(STREAM_STATE_LABELS)) {
            expect(isAdapterRenderCoherent(state, label, STREAM_STATE_LABELS)).toBe(true);
        }
    })

    test('⭐ a MISMATCHED label fails — the guard is still real', () => {
        // The point of agreement-over-pinning: a `live` head rendering the sample label is a defect.
        expect(isAdapterRenderCoherent('live', 'static roster · offline', ROSTER_STATE_LABELS)).toBe(false);
        expect(isAdapterRenderCoherent('sample', '', ROSTER_STATE_LABELS)).toBe(false);
        expect(isAdapterRenderCoherent('live', 'sample · live feed pending', STREAM_STATE_LABELS)).toBe(false);
    })

    test('an empty canonical label accepts an empty node or none at all', () => {
        expect(isAdapterRenderCoherent('live', '', ROSTER_STATE_LABELS)).toBe(true);
        expect(isAdapterRenderCoherent('live', null, ROSTER_STATE_LABELS)).toBe(true);
    })

    test('absent and unknown both fail closed', () => {
        expect(isAdapterRenderCoherent(null, null, ROSTER_STATE_LABELS)).toBe(false);
        expect(isAdapterRenderCoherent('unknown', 'anything', ROSTER_STATE_LABELS)).toBe(false);
    })
});

test.describe('computeFirstPaintVerdict — the final verdict, mutation-discriminated', () => {
    test('a matching SAMPLE cockpit passes the whole verdict', () => {
        const result = verdict();

        expect(result.adaptersCoherent).toBe(true);
        expect(result.firstPaintPassed).toBe(true);
        expect(result.productWitnessPassed).toBe(true);
        expect(result.productWitnessUnmet).toEqual([]);
    })

    test('⭐ a matching LIVE cockpit passes too — the witness can observe success', () => {
        // The defect this replaces: the gate required the sample labels, so wiring the cockpit to the
        // live fleet would have turned the smoke red.
        const result = verdict({
            rosterState: 'live', rosterLabel: '',
            streamState: 'live', activityLabel: '● streaming'
        });

        expect(result.adaptersCoherent).toBe(true);
        expect(result.productWitnessPassed).toBe(true);
    })

    test('⭐ a MISMATCHED label fails the verdict and names the conjunct', () => {
        const result = verdict({rosterState: 'live', rosterLabel: 'static roster · offline'});

        expect(result.adaptersCoherent).toBe(false);
        expect(result.firstPaintPassed).toBe(false);
        expect(result.productWitnessPassed).toBe(false);
        expect(result.productWitnessUnmet).toContain('adapterRenderCoherent');
        expect(result.productWitnessUnmet).toContain('firstPaint');
    })

    test('⭐ an ABSENT head fails the verdict', () => {
        const result = verdict({rosterState: null, rosterLabel: null});

        expect(result.adaptersCoherent).toBe(false);
        expect(result.productWitnessUnmet).toContain('adapterRenderCoherent');
    })

    test('⭐ an UNKNOWN state fails the verdict', () => {
        expect(verdict({rosterState: 'unknown'}).adaptersCoherent).toBe(false);
    })

    test('⭐ an AMBIGUOUS observation fails the verdict — via `unknown`, end to end', () => {
        // The full path: two known classes resolve to `unknown`, which the verdict then rejects.
        const state  = resolveAdapterState(classList(['is-live', 'is-sample']).contains),
              result = verdict({rosterState: state, rosterLabel: ''});

        expect(state).toBe('unknown');
        expect(result.adaptersCoherent).toBe(false);
        expect(result.productWitnessPassed).toBe(false);
    })

    test('the non-adapter conjuncts each fail on their own and are named', () => {
        expect(verdict({cockpitVisible: false}).productWitnessUnmet).toContain('firstPaint');
        expect(verdict({cardCount: 0}).productWitnessUnmet).toContain('firstPaint');
        expect(verdict({timedOut: true}).productWitnessUnmet).toContain('firstPaint');
        expect(verdict({firstPaintMs: null}).productWitnessUnmet).toContain('firstPaint');
        expect(verdict({firstPaintMs: 60001}).productWitnessUnmet).toContain('firstPaint');
    })

    test('⭐ a healthy boot that is merely UNPACKAGED names packagedMode and nothing alarming', () => {
        // A bare `productWitnessPassed: false` on a completely healthy boot invited the wrong
        // conclusion. It is normally just this.
        const result = verdict({}, {packagedMode: false});

        expect(result.firstPaintPassed).toBe(true);
        expect(result.adaptersCoherent).toBe(true);
        expect(result.productWitnessPassed).toBe(false);
        expect(result.productWitnessUnmet).toEqual(['packagedMode (run the packaged app, not `npm run smoke`)']);
    })

    test('brainMode and brainUp are named separately', () => {
        expect(verdict({}, {brainMode: false, brainUp: null}).productWitnessUnmet)
            .toContain('brainMode (use `npm run smoke:brain`)');
        expect(verdict({}, {brainUp: false}).productWitnessUnmet).toContain('brainUp');
    })

    test('⭐ MUTATION CONTROL: forcing coherence true must not rescue a mismatched observation', () => {
        // The review's exact requirement — the suite must go red if `isAdapterRenderCoherent()` is
        // forced true. Asserted as a property here: a mismatched label is only rejected BECAUSE the
        // coherence term is false, so if that term were hardcoded true the verdict would wrongly pass.
        const mismatched = report({rosterState: 'live', rosterLabel: 'static roster · offline'});

        expect(isAdapterRenderCoherent(mismatched.rosterState, mismatched.rosterLabel, ROSTER_STATE_LABELS)).toBe(false);

        // Every other conjunct of this report is healthy, so coherence is the ONLY thing failing it.
        expect(mismatched.cockpitVisible).toBe(true);
        expect(mismatched.cardCount).toBeGreaterThan(0);
        expect(mismatched.timedOut).toBe(false);
        expect(verdict({rosterState: 'live', rosterLabel: 'static roster · offline'}).firstPaintPassed).toBe(false);
    })
});

test.describe('the forced CJS/ESM duplication cannot drift', () => {
    test('⭐ the preload observer lists the SAME adapter states as the witness', async () => {
        // `preload.cjs` cannot import this module: Electron will not load an ESM preload in a sandboxed
        // renderer, so the state list is duplicated by necessity rather than by choice. That makes drift
        // possible, so it is asserted instead of trusted.
        const source  = await readFile(new URL('../../../../harness/preload.cjs', import.meta.url), 'utf8'),
              matched = source.match(/const ADAPTER_STATES = \[([^\]]+)\]/);

        expect(matched, 'preload declares ADAPTER_STATES').not.toBeNull();

        const declared = matched[1].split(',').map(part => part.trim().replace(/^'|'$/g, ''));

        expect(declared).toEqual([...ADAPTER_STATES]);
    })

    test('the sanitizer allowlist admits every state plus `unknown`, and nothing else', () => {
        expect([...ADAPTER_STATE_NAMES]).toEqual([...ADAPTER_STATES, 'unknown']);
    })
});
