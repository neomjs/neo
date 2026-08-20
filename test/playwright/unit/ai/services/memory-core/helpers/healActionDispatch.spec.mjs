import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    DEFAULT_FUTILITY_BOUNDS,
    FUTILITY_ESCALATIONS,
    decideFutilityFreeze,
    decideHealAction,
    detectChronicUnsafeInput,
    dispatchHeal,
    DEFAULT_DISPATCH_BOUNDS,
    HEAL_ACTIONS,
    MUTATING_HEAL_ACTIONS,
    NO_HEAL_ACTION
} from '../../../../../../../ai/services/memory-core/helpers/healActionDispatch.mjs';
import {
    createRestoreTargetSetDescriptor,
    deriveRestoreTargetSetIdentity,
    RESTORE_EMPTY_TARGET_ACTION
} from '../../../../../../../ai/services/memory-core/helpers/restoreTargetSetContract.mjs';

const NOW        = 10_000_000;
const TARGET_SET = createRestoreTargetSetDescriptor({
    memoriesCollection            : 'neo-agent-memory',
    summariesCollection           : 'neo-agent-sessions',
    graphDestination              : '/data/graph.sqlite',
    bundleManifestFingerprint     : `sha256:${'a'.repeat(64)}`,
    admissionDescriptorFingerprint: `sha256:${'b'.repeat(64)}`
});

test.describe('decideHealAction — autonomous bounded-dispatch safety gate', () => {
    test('action none / absent → no-op (nothing to heal)', () => {
        expect(decideHealAction({action: 'none', now: NOW})).toMatchObject({execute: false, status: 'no-op'});
        expect(decideHealAction({now: NOW})).toMatchObject({execute: false, status: 'no-op'});
    });

    test('an unknown action → unknown-action (fail-closed: never execute an unrecognized heal)', () => {
        expect(decideHealAction({action: 'rm-rf-everything', collection: 'mc', now: NOW}))
            .toMatchObject({execute: false, status: 'unknown-action'});
    });

    test('non-mutating containment (freeze / quarantine) always executes — no rate/thrash bound', () => {
        // even with a flood of recent runs, containment is always allowed (it mutates nothing)
        const recentRuns = Array.from({length: 99}, () => ({action: 'quarantine', collection: 'mc', at: NOW - 1}));
        expect(decideHealAction({action: 'freeze', collection: 'mc', recentRuns, now: NOW})).toMatchObject({execute: true, status: 'execute'});
        expect(decideHealAction({action: 'quarantine', collection: 'mc', recentRuns, now: NOW})).toMatchObject({execute: true, status: 'execute'});
    });

    test('a mutating action with no recent runs → execute (within bounds)', () => {
        expect(decideHealAction({action: 're-embed-missing', collection: 'mc-memory', recentRuns: [], now: NOW}))
            .toMatchObject({execute: true, status: 'execute'});
    });

    test('anti-thrash: a same action+collection run inside the cooldown → thrash-cooldown (no loop)', () => {
        const recentRuns = [{action: 're-embed-missing', collection: 'mc-memory', at: NOW - 60_000}]; // 1 min ago < 10 min cooldown
        expect(decideHealAction({action: 're-embed-missing', collection: 'mc-memory', recentRuns, now: NOW}))
            .toMatchObject({execute: false, status: 'thrash-cooldown'});
    });

    test('the cooldown is per action+collection — a different collection is unaffected', () => {
        const recentRuns = [{action: 're-embed-missing', collection: 'mc-memory', at: NOW - 60_000}];
        expect(decideHealAction({action: 're-embed-missing', collection: 'mc-graph', recentRuns, now: NOW}))
            .toMatchObject({execute: true, status: 'execute'});
    });

    test('rate-limit: too many runs of the same action+collection in the window → rate-limited', () => {
        // 3 runs spread across the hour but all older than the cooldown → cooldown passes, but the window rate trips.
        const recentRuns = [
            {action: 'defrag', collection: 'mc-memory', at: NOW - 3_000_000},
            {action: 'defrag', collection: 'mc-memory', at: NOW - 2_000_000},
            {action: 'defrag', collection: 'mc-memory', at: NOW - 1_000_000}
        ];
        expect(decideHealAction({action: 'defrag', collection: 'mc-memory', recentRuns, now: NOW}))
            .toMatchObject({execute: false, status: 'rate-limited'});
    });

    test('fail-closed: a mutating action with a missing/empty collection → unsafe-input (no fail-open execute)', () => {
        expect(decideHealAction({action: 're-embed-missing', now: NOW}))
            .toMatchObject({execute: false, status: 'unsafe-input'});
        expect(decideHealAction({action: 're-embed-missing', collection: '', now: NOW}))
            .toMatchObject({execute: false, status: 'unsafe-input'});
    });

    test('restore-empty-target requires targetSet, rejects collection, and keys anti-thrash by recovery unit', () => {
        const identity = deriveRestoreTargetSetIdentity(TARGET_SET);

        expect(decideHealAction({action: RESTORE_EMPTY_TARGET_ACTION, now: NOW}))
            .toMatchObject({execute: false, status: 'unsafe-input'});
        expect(decideHealAction({
            action    : RESTORE_EMPTY_TARGET_ACTION,
            collection: 'synthetic-collection',
            targetSet : TARGET_SET,
            now       : NOW
        })).toMatchObject({execute: false, status: 'unsafe-input'});

        expect(decideHealAction({
            action    : RESTORE_EMPTY_TARGET_ACTION,
            targetSet : TARGET_SET,
            recentRuns: [{
                action         : RESTORE_EMPTY_TARGET_ACTION,
                recoveryUnitKey: identity.recoveryUnitKey,
                at             : NOW - 1
            }],
            now: NOW
        })).toMatchObject({
            execute: false,
            status : 'thrash-cooldown'
        });
    });

    test('collection-scoped actions reject targetSet even when a collection is present', () => {
        expect(decideHealAction({
            action    : 'quarantine',
            collection: 'mc',
            targetSet : TARGET_SET,
            now       : NOW
        })).toMatchObject({execute: false, status: 'unsafe-input'});
    });

    test('fail-closed: a mutating action with a non-finite now → unsafe-input (no cooldown/window clock)', () => {
        expect(decideHealAction({action: 'defrag', collection: 'mc'}))
            .toMatchObject({execute: false, status: 'unsafe-input'});
        expect(decideHealAction({action: 'defrag', collection: 'mc', now: NaN}))
            .toMatchObject({execute: false, status: 'unsafe-input'});
    });

    test('partial bounds are normalized onto the defaults — an empty {} cannot disable the gate', () => {
        // a run 1 min ago is within the DEFAULT 10-min cooldown; an empty bounds {} must still hold it.
        const recentRuns = [{action: 're-embed-missing', collection: 'mc', at: NOW - 60_000}];
        expect(decideHealAction({action: 're-embed-missing', collection: 'mc', recentRuns, bounds: {}, now: NOW}))
            .toMatchObject({execute: false, status: 'thrash-cooldown'});
    });

    test('fail-closed: a bound that resolves non-finite → unsafe-input', () => {
        expect(decideHealAction({action: 're-embed-missing', collection: 'mc', bounds: {cooldownMs: 'soon'}, now: NOW}))
            .toMatchObject({execute: false, status: 'unsafe-input'});
    });

    test('the vocabulary split is frozen + mutating ⊂ all actions', () => {
        expect(Object.isFrozen(HEAL_ACTIONS)).toBe(true);
        expect(Object.isFrozen(MUTATING_HEAL_ACTIONS)).toBe(true);
        expect(MUTATING_HEAL_ACTIONS.every(a => HEAL_ACTIONS.includes(a))).toBe(true);
        expect(HEAL_ACTIONS).toContain('quarantine'); // quarantine is a containment heal-action
        expect(HEAL_ACTIONS).toContain(RESTORE_EMPTY_TARGET_ACTION);
        expect(HEAL_ACTIONS).not.toContain('restore-delta-merge');
        expect(DEFAULT_DISPATCH_BOUNDS.maxRunsPerWindow).toBeGreaterThan(0);
        // the no-op sentinel is non-dispatchable: it lives OUTSIDE HEAL_ACTIONS and resolves to no-op.
        expect(NO_HEAL_ACTION).toBe('none');
        expect(HEAL_ACTIONS).not.toContain(NO_HEAL_ACTION);
        expect(decideHealAction({action: NO_HEAL_ACTION, now: NOW})).toMatchObject({execute: false, status: 'no-op'});
    });
});

test.describe('dispatchHeal — actuator core dispatch (safety gate + injected execution)', () => {
    const ok = async () => ({status: 'healed', detail: 're-embedded 5 rows'});

    test('a held action (thrash-cooldown) returns the hold outcome and NEVER calls the operation', async () => {
        let   called     = false;
        const recentRuns = [{action: 're-embed-missing', collection: 'mc', at: NOW - 1000}],
              outcome    = await dispatchHeal({
                  action        : 're-embed-missing',
                  collection    : 'mc',
                  recentRuns,
                  now           : NOW,
                  healOperations: {'re-embed-missing': async () => { called = true; return ok(); }}
              });

        expect(outcome).toMatchObject({status: 'thrash-cooldown', healedAt: NOW});
        expect(called).toBe(false);
    });

    test('an executable action with a wired operation → healed + records the run', async () => {
        const runs    = [],
              outcome = await dispatchHeal({
                  action        : 're-embed-missing',
                  collection    : 'mc-memory',
                  evidence      : {gap: 5},
                  now           : NOW,
                  healOperations: {'re-embed-missing': ok},
                  recordRun     : async run => { runs.push(run); }
              });

        expect(outcome).toMatchObject({action: 're-embed-missing', collection: 'mc-memory', status: 'healed', detail: 're-embedded 5 rows'});
        expect(runs).toEqual([{action: 're-embed-missing', collection: 'mc-memory', at: NOW}]);
    });

    test('an executable target-set action with NO wired operation → deferred (autonomous, no page)', async () => {
        const outcome = await dispatchHeal({
            action        : RESTORE_EMPTY_TARGET_ACTION,
            targetSet     : TARGET_SET,
            now           : NOW,
            healOperations: {}
        });

        expect(outcome).toMatchObject({
            action            : RESTORE_EMPTY_TARGET_ACTION,
            status            : 'deferred',
            healedAt          : NOW,
            recoveryUnitKey   : deriveRestoreTargetSetIdentity(TARGET_SET).recoveryUnitKey,
            attemptFingerprint: deriveRestoreTargetSetIdentity(TARGET_SET).attemptFingerprint
        });
        expect(outcome.detail).toMatch(/no heal operation wired/);
    });

    test('target-set dispatch records and invokes the operation with canonical identities', async () => {
        const
            calls    = [],
            records  = [],
            expected = deriveRestoreTargetSetIdentity(TARGET_SET),
            outcome  = await dispatchHeal({
                action        : RESTORE_EMPTY_TARGET_ACTION,
                targetSet     : TARGET_SET,
                now           : NOW,
                healOperations: {
                    [RESTORE_EMPTY_TARGET_ACTION]: async input => {
                        calls.push(input);
                        return {status: 'committed', detail: {serviceEligible: true}}
                    }
                },
                recordRun: async record => records.push(record)
            });

        expect(records).toEqual([expect.objectContaining({
            action            : RESTORE_EMPTY_TARGET_ACTION,
            collection        : undefined,
            recoveryUnitKey   : expected.recoveryUnitKey,
            attemptFingerprint: expected.attemptFingerprint,
            at                : NOW
        })]);
        expect(calls).toEqual([expect.objectContaining({
            targetSet         : TARGET_SET,
            recoveryUnitKey   : expected.recoveryUnitKey,
            attemptFingerprint: expected.attemptFingerprint
        })]);
        expect(outcome).toMatchObject({status: 'committed', detail: {serviceEligible: true}});
    });

    test('a throwing operation → failed (recorded, never escalated)', async () => {
        const outcome = await dispatchHeal({
            action        : 'defrag',
            collection    : 'mc',
            now           : NOW,
            healOperations: {defrag: async () => { throw new Error('chroma unreachable'); }},
            recordRun     : async () => {}
        });

        expect(outcome).toMatchObject({status: 'failed', detail: 'chroma unreachable'});
    });

    test('fail-closed: a mutating action with NO recordRun does not execute (no recorder, no mutation)', async () => {
        let   called  = false;
        const outcome = await dispatchHeal({
            action        : 're-embed-missing',
            collection    : 'mc',
            now           : NOW,
            healOperations: {'re-embed-missing': async () => { called = true; return {status: 'healed'}; }}
            // no recordRun → the mutating attempt cannot be persisted → must not execute.
        });

        expect(called).toBe(false);
        expect(outcome).toMatchObject({status: 'unsafe-input'});
        expect(outcome.detail).toMatch(/requires a recordRun/);
    });

    test('the operation status+detail is carried through (e.g. quarantine reports frozen)', async () => {
        const outcome = await dispatchHeal({
            action        : 'quarantine',
            collection    : 'mc',
            now           : NOW,
            healOperations: {quarantine: async () => ({status: 'frozen', detail: 'collection marked unhealthy'})}
        });

        expect(outcome).toMatchObject({status: 'frozen', detail: 'collection marked unhealthy'});
    });

    test('recordRun is NOT called when the gate holds', async () => {
        let   recorded   = false;
        const recentRuns = [{action: 'defrag', collection: 'mc', at: NOW - 1000}];
        await dispatchHeal({
            action        : 'defrag',
            collection    : 'mc',
            recentRuns,
            now           : NOW,
            healOperations: {defrag: ok},
            recordRun     : async () => { recorded = true; }
        });

        expect(recorded).toBe(false);
    });

    test('a throwing mutating heal RECORDS the attempt before execution → it cannot immediately re-run', async () => {
        const runs      = [],
              recordRun = async run => { runs.push(run); };

        // First dispatch: the operation throws → failed, BUT the attempt is recorded.
        const first = await dispatchHeal({
            action        : 're-embed-missing',
            collection    : 'mc',
            now           : NOW,
            healOperations: {'re-embed-missing': async () => { throw new Error('provider 404'); }},
            recordRun
        });

        expect(first).toMatchObject({status: 'failed', detail: 'provider 404'});
        expect(runs).toEqual([{action: 're-embed-missing', collection: 'mc', at: NOW}]); // recorded despite the throw

        // A moment later, feeding the recorded attempt as recentRuns → the gate holds (no hot-loop).
        expect(decideHealAction({action: 're-embed-missing', collection: 'mc', recentRuns: runs, now: NOW + 1000}))
            .toMatchObject({execute: false, status: 'thrash-cooldown'});
    });

    test('fail-closed: if the pre-execution recordRun throws, the mutating heal does NOT execute', async () => {
        let   called  = false;
        const outcome = await dispatchHeal({
            action        : 're-embed-missing',
            collection    : 'mc',
            now           : NOW,
            healOperations: {'re-embed-missing': async () => { called = true; return {status: 'healed'}; }},
            recordRun     : async () => { throw new Error('anti-thrash store down'); }
        });

        expect(called).toBe(false); // never executed the mutation when the attempt could not be recorded
        expect(outcome).toMatchObject({status: 'failed'});
        expect(outcome.detail).toMatch(/recordRun failed pre-execution/);
    });
});

test.describe('detectChronicUnsafeInput — chronic unsafe-input mis-wire detector', () => {
    const NOW = 5_000_000;

    test('>= threshold unsafe-input for the same (action, collection) in-window → flagged', () => {
        const chronic = detectChronicUnsafeInput([
            {type: 're-embed-missing', collection: 'a', status: 'unsafe-input', at: NOW - 1000},
            {type: 're-embed-missing', collection: 'a', status: 'unsafe-input', at: NOW - 2000},
            {type: 're-embed-missing', collection: 'a', status: 'unsafe-input', at: NOW - 3000},
            {type: 're-embed-missing', collection: 'b', status: 'unsafe-input', at: NOW - 1000}, // below threshold
            {type: 're-embed-missing', collection: 'a', status: 'healed',       at: NOW - 500}   // not unsafe-input
        ], {threshold: 3, windowMs: 60_000, now: NOW});

        expect(chronic).toEqual([{action: 're-embed-missing', collection: 'a', count: 3}]);
    });

    test('out-of-window unsafe-input does NOT count toward the threshold', () => {
        const chronic = detectChronicUnsafeInput([
            {type: 're-embed-missing', collection: 'a', status: 'unsafe-input', at: NOW - 1000},
            {type: 're-embed-missing', collection: 'a', status: 'unsafe-input', at: NOW - 2000},
            {type: 're-embed-missing', collection: 'a', status: 'unsafe-input', at: NOW - 9_000_000} // out of window
        ], {threshold: 3, windowMs: 60_000, now: NOW});

        expect(chronic).toEqual([]); // only 2 in-window < 3
    });

    test('non-finite bounds → no alert (indeterminate input never spuriously fires)', () => {
        const events = [{type: 'x', collection: 'a', status: 'unsafe-input', at: 1000}];
        expect(detectChronicUnsafeInput(events, {threshold: NaN, windowMs: 60_000, now: 5000})).toEqual([]);
        expect(detectChronicUnsafeInput(events, {threshold: 1,   windowMs: 60_000, now: NaN })).toEqual([]);
    });
});

test.describe('healActionDispatch — throttle-shed vocabulary (#14284)', () => {
    const NOW2 = 12_000_000;

    test('throttle-shed is a dispatchable, NON-mutating containment action (not unknown-action)', () => {
        expect(HEAL_ACTIONS).toContain('throttle-shed');
        expect(MUTATING_HEAL_ACTIONS).not.toContain('throttle-shed'); // non-mutating like freeze/quarantine
        // admitted by the vocabulary gate + exempt from the mutating rate-limit/anti-thrash bound
        expect(decideHealAction({action: 'throttle-shed', collection: 'kbSync', now: NOW2})).toMatchObject({execute: true});
    });

    test('dispatchHeal invokes the throttle-shed operation + returns the shed outcome (was inert before the vocabulary fix)', async () => {
        let   called  = false;
        const outcome = await dispatchHeal({
            action        : 'throttle-shed',
            collection    : 'kbSync',
            now           : NOW2,
            healOperations: {'throttle-shed': async () => { called = true; return {status: 'shed', detail: {shedUntil: NOW2 + 300000}}; }}
        });

        expect(called).toBe(true); // reachable through the dispatch vocabulary — NOT rejected as unknown-action
        expect(outcome).toMatchObject({action: 'throttle-shed', collection: 'kbSync', status: 'shed', healedAt: NOW2});
    });
});

/**
 * The futility breaker: freeze a target whose verdict repeats with no state change.
 *
 * Keyed on repeated identical verdicts rather than executor failures, because the route table gives
 * `throttle-shed` and `record` an `actuatorAction: null` — neither ever invokes an executor, and those
 * two dispositions are the majority of live ledger rows.
 */
test.describe('decideFutilityFreeze — futility breaker', () => {
    const NOW = 1_000_000;

    const verdicts = ({count, disposition = 'recorded', fingerprint = 'f1', reasonCode = 'throttle-shed-has-no-admitted-action'}) =>
        Array.from({length: count}, (_, i) => ({
            target          : 'embedding-model',
            recoveryClass   : 'exhaustion',
            rung            : 'rung-2',
            reasonCode,
            disposition,
            stateFingerprint: fingerprint,
            at              : NOW - (count - i) * 1000
        }));

    test('freezes on the threshold for EVERY disposition, including the ones that invoke no executor', () => {
        for (const disposition of ['recorded', 'declined', 'no-action', 'deferred', 'failed']) {
            const result = decideFutilityFreeze({verdicts: verdicts({count: 5, disposition}), now: NOW});

            expect(result.freeze, `${disposition} must freeze at the threshold`).toBe(true);
            expect(result.streak).toBe(5);
        }
    });

    test('RED-PROOF: a failure counter would see none of these — four of five dispositions never fail', () => {
        // The arm that fails if the signal reverts to executor failures.
        const unactioned = verdicts({count: 9, disposition: 'recorded'});

        expect(unactioned.filter(v => v.disposition === 'failed')).toHaveLength(0);
        expect(decideFutilityFreeze({verdicts: unactioned, now: NOW}).freeze).toBe(true);
    });

    test('escalation distinguishes an ineffective remedy from an absent one', () => {
        expect(decideFutilityFreeze({verdicts: verdicts({count: 5, disposition: 'failed'}), now: NOW}).escalation)
            .toBe(FUTILITY_ESCALATIONS.REMEDY_INEFFECTIVE);
        expect(decideFutilityFreeze({verdicts: verdicts({count: 5, disposition: 'recorded'}), now: NOW}).escalation)
            .toBe(FUTILITY_ESCALATIONS.NO_ADMITTED_REMEDY);
    });

    test('NEGATIVE CONTROL: below the threshold does not freeze', () => {
        const result = decideFutilityFreeze({verdicts: verdicts({count: DEFAULT_FUTILITY_BOUNDS.maxIdenticalVerdicts - 1}), now: NOW});

        expect(result.freeze).toBe(false);
        expect(result.status).toBe('below-threshold');
    });

    test('a changed state fingerprint breaks the run — the loop is observing something new', () => {
        const rows = verdicts({count: 5});

        rows[2].stateFingerprint = 'f2';

        const result = decideFutilityFreeze({verdicts: rows, now: NOW});

        expect(result.freeze).toBe(false);
        expect(result.status).toBe('state-changed');
        expect(result.streak).toBe(2);
    });

    test('a changed verdict breaks the run', () => {
        const rows = verdicts({count: 5});

        rows[1].reasonCode = 'diagnosis-record';

        const result = decideFutilityFreeze({verdicts: rows, now: NOW});

        expect(result.freeze).toBe(false);
        expect(result.status).toBe('verdict-changed');
    });

    test('RED-PROOF: interleaved targets each reach the threshold independently', () => {
        // The breaker's unit is ONE target. Because the verdict identity includes the target, an
        // unfiltered backward walk read every other target's row as "the verdict changed" — so two
        // targets failing in alternation both sat at streak 1 forever while each was independently
        // futile. A ledger with more than one sick target is the normal case, not the exotic one.
        const rowsFor = target => verdicts({count: 5}).map(row => ({...row, target})),
              a       = rowsFor('embedding-model'),
              b       = rowsFor('chroma');

        // Alternate them, preserving each target's own chronology.
        const interleaved = a.flatMap((row, index) => [row, b[index]]).sort((x, y) => x.at - y.at);

        const latest = decideFutilityFreeze({verdicts: interleaved, now: NOW});

        expect(latest.freeze, 'the newest target is futile on its own rows').toBe(true);
        expect(latest.streak).toBe(5);

        // And the other target reaches it too, from the same ledger — asserted by making it newest.
        const flipped = decideFutilityFreeze({
            verdicts: interleaved.map(row => row === interleaved.at(-1) ? {...row, at: row.at - 10_000} : row)
                .sort((x, y) => x.at - y.at),
            now: NOW
        });

        expect(flipped.freeze, 'both targets are independently futile in one ledger').toBe(true);
        expect(flipped.verdict.target).not.toBe(latest.verdict.target);
    });

    test('NEGATIVE CONTROL: another target cannot rescue a futile one, and cannot fabricate a streak', () => {
        // The mirror of the red-proof. Filtering per target must not become "ignore everything else":
        // this target's OWN changed verdict still breaks its run, even when other targets are steady.
        const mine  = verdicts({count: 5}),
              other = verdicts({count: 5}).map(row => ({...row, target: 'chroma', at: row.at - 500}));

        mine[3].reasonCode = 'diagnosis-record';

        const result = decideFutilityFreeze({verdicts: [...other, ...mine].sort((x, y) => x.at - y.at), now: NOW});

        expect(result.freeze).toBe(false);
        expect(result.status).toBe('verdict-changed');
    });

    test('verdicts older than the window do not count toward the streak', () => {
        const stale = verdicts({count: 9}).map(v => ({...v, at: NOW - DEFAULT_FUTILITY_BOUNDS.windowMs - 1}));

        expect(decideFutilityFreeze({verdicts: stale, now: NOW}).status).toBe('no-verdicts');
    });

    test('fails OPEN on unsafe input — a breaker must never silence healing on a bad clock', () => {
        for (const bad of [{verdicts: verdicts({count: 9})}, {verdicts: verdicts({count: 9}), now: NaN},
                           {verdicts: verdicts({count: 9}), now: NOW, bounds: {maxIdenticalVerdicts: 0}}]) {
            const result = decideFutilityFreeze(bad);

            expect(result.freeze, 'unsafe input must not freeze').toBe(false);
            expect(result.status).toBe('unsafe-input');
        }
    });

    test('partial bounds normalize onto the defaults rather than disabling the gate', () => {
        const result = decideFutilityFreeze({verdicts: verdicts({count: 5}), bounds: {windowMs: 3_600_000}, now: NOW});

        expect(result.freeze).toBe(true);
    });
});
