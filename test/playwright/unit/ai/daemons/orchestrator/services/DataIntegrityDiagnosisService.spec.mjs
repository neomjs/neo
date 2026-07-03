import {test, expect}                  from '@playwright/test';
import Neo                             from '../../../../../../../src/Neo.mjs';
import * as core                       from '../../../../../../../src/core/_export.mjs';
import {DataIntegrityDiagnosisService} from '../../../../../../../ai/daemons/orchestrator/services/DataIntegrityDiagnosisService.mjs';

const OBSERVED_AT = 1710000000000;

/**
 * Records every actuator surface reached so a test can assert SELF-HEAL behavior: `applyHeal` is the only
 * sink — there is no `escalateDiagnosis`/operator path by construction.
 */
function fakeActuator({failOn = null} = {}) {
    const calls = {applyHeal: []};

    return {
        calls,
        async applyHeal({action, collection, evidence, now}) {
            calls.applyHeal.push({action, collection, evidence, now});
            if (failOn && failOn === collection) {
                throw new Error(`heal failed for ${collection}`);
            }
            return {status: 'healed', action};
        }
    };
}

/** A clean per-collection evidence row. */
function clean(collection = 'neo-agent-memory') {
    return {collection, rowCount: 1000};
}

/** A WAL-stall row: metadata-without-vector, documents intact → autonomous re-embed-missing. */
function walStall(collection = 'neo-agent-memory') {
    return {collection, rowCount: 1000, missingFromVectorCount: 200, documentsPresentCount: 200};
}

function createService(config = {}) {
    return Neo.create(DataIntegrityDiagnosisService, {
        serviceId: 'memory-core',
        nowFn    : () => OBSERVED_AT,
        ...config
    });
}

test.describe('Neo.ai.daemons.services.DataIntegrityDiagnosisService', () => {
    test('clean evidence → clean decision, nothing healed', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  evidenceGatherer: async () => [clean()],
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision).toMatchObject({
            recordType: 'data-integrity-self-heal-decision',
            serviceId : 'memory-core',
            observedAt: OBSERVED_AT,
            status    : 'clean'
        });
        expect(decision.heals).toHaveLength(0);
        expect(actuator.calls.applyHeal).toHaveLength(0);
    });

    test('WAL-stall → routes an autonomous re-embed-missing heal to applyHeal (no escalate)', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  evidenceGatherer: async () => [walStall()],
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('healed');
        expect(decision.heals).toHaveLength(1);
        expect(decision.heals[0]).toMatchObject({collection: 'neo-agent-memory', action: 're-embed-missing', mode: 'wal-stall'});
        expect(actuator.calls.applyHeal).toHaveLength(1);
        expect(actuator.calls.applyHeal[0]).toMatchObject({action: 're-embed-missing', collection: 'neo-agent-memory', now: OBSERVED_AT});
        expect(actuator.calls.applyHeal[0].evidence).toMatchObject({missingFromVectorCount: 200, documentsPresentCount: 200});
    });

    test('wipe (docs gone) → restore-delta-merge; systemic mismatch → freeze (never mass re-embed)', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  evidenceGatherer: async () => [
                      {collection: 'neo-agent-memory',   rowCount: 1000, missingFromVectorCount: 200, documentsPresentCount: 0},
                      {collection: 'neo-agent-sessions', rowCount: 1000, mismatchedVectorCount: 900}
                  ],
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('healed');
        const actions = decision.heals.map(h => h.action);
        expect(actions).toContain('restore-delta-merge');
        expect(actions).toContain('freeze');
        expect(actuator.calls.applyHeal).toHaveLength(2);
    });

    test('probe-unavailable: a failing gatherer heals NOTHING (failed probe ≠ corruption signal)', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  evidenceGatherer: async () => { throw new Error('Chroma unreachable'); },
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision).toMatchObject({status: 'probe-unavailable', probeError: 'Chroma unreachable'});
        expect(decision.heals).toHaveLength(0);
        expect(actuator.calls.applyHeal).toHaveLength(0);
    });

    test('a single heal failure is recorded, not thrown — the cycle still heals the other collections', async () => {
        const actuator = fakeActuator({failOn: 'neo-agent-memory'}),
              service  = createService({
                  evidenceGatherer: async () => [walStall('neo-agent-memory'), walStall('neo-agent-sessions')],
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('healed');
        expect(decision.heals).toHaveLength(2);
        const memHeal = decision.heals.find(h => h.collection === 'neo-agent-memory');
        expect(memHeal.outcome).toMatchObject({status: 'failed'});
        const sessHeal = decision.heals.find(h => h.collection === 'neo-agent-sessions');
        expect(sessHeal.outcome).toMatchObject({status: 'healed'});
    });

    test('INVARIANT: the runner reaches applyHeal ONLY — there is no escalate/operator sink', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  evidenceGatherer: async () => [walStall()],
                  recoveryActuator: actuator
              });

        await service.gatherAndDiagnose();

        // The fake actuator exposes no escalateDiagnosis; the runner must only ever call applyHeal.
        expect(typeof actuator.escalateDiagnosis).toBe('undefined');
        expect(actuator.calls.applyHeal).toHaveLength(1);
    });

    test('threads the injected clock into every heal call', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  evidenceGatherer: async () => [walStall()],
                  recoveryActuator: actuator
              });

        await service.gatherAndDiagnose();

        expect(actuator.calls.applyHeal[0].now).toBe(OBSERVED_AT);
    });

    test('fail-closed: a missing evidenceGatherer throws', async () => {
        const service = createService({recoveryActuator: fakeActuator()});

        await expect(service.gatherAndDiagnose()).rejects.toThrow(/evidenceGatherer is required/);
    });

    test('fail-closed: a recoveryActuator without applyHeal throws', async () => {
        const service = createService({
            evidenceGatherer: async () => [clean()],
            recoveryActuator: {}
        });

        await expect(service.gatherAndDiagnose()).rejects.toThrow(/recoveryActuator with applyHeal/);
    });

    test('reversibility: a clean re-audit lifts a prior serving fence (terminalAction none → un-quarantine)', async () => {
        const lifted  = [],
              service = createService({
                  evidenceGatherer: async () => [clean('neo-agent-memory')],
                  recoveryActuator: fakeActuator(),
                  liftQuarantine  : async collection => { lifted.push(collection); return true; } // simulate: was fenced, now clean
              });

        const decision = await service.gatherAndDiagnose();

        expect(lifted).toEqual(['neo-agent-memory']);                                             // the clean re-audit probed the fence
        expect(decision.heals).toContainEqual(expect.objectContaining({
            collection: 'neo-agent-memory', action: 'unquarantine', outcome: {status: 'unquarantined'}
        }));
    });

    test('reversibility: a clean collection that was never fenced records NO un-quarantine (no spurious heal)', async () => {
        const service = createService({
            evidenceGatherer: async () => [clean('neo-agent-memory')],
            recoveryActuator: fakeActuator(),
            liftQuarantine  : async () => false                                                   // not fenced → no-op
        });

        const decision = await service.gatherAndDiagnose();

        expect(decision.heals).toHaveLength(0);                                                   // nothing fenced → nothing recorded
    });

    test('systemic circuit TRIPPED → suppresses every heal + records circuit-open (no mass-heal storm)', async () => {
        const actuator = fakeActuator(),
              events   = [],
              service  = createService({
                  evidenceGatherer   : async () => [walStall('neo-agent-memory'), walStall('neo-agent-sessions')],
                  recoveryActuator   : actuator,
                  systemicCircuitGate: async () => ({open: true, status: 'tripped', reason: '3 distinct collections failing an embedder outage'}),
                  recordCircuitEvent : async event => { events.push(event); }
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('circuit-open');
        expect(decision.heals).toHaveLength(0);                          // the per-collection storm was suppressed
        expect(actuator.calls.applyHeal).toHaveLength(0);                // NOTHING hammered the dead embedder
        expect(events).toContainEqual(expect.objectContaining({type: 'circuit-open'}));
    });

    test('circuit riding-out (circuit-open) → suppresses, but does NOT re-record (only the fresh trip opens)', async () => {
        const events  = [],
              service = createService({
                  evidenceGatherer   : async () => [walStall()],
                  recoveryActuator   : fakeActuator(),
                  systemicCircuitGate: async () => ({open: true, status: 'circuit-open', reason: 'riding out the suppression window'}),
                  recordCircuitEvent : async event => { events.push(event); }
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('circuit-open');
        expect(events).toHaveLength(0);                                  // riding-out is not a fresh trip
    });

    test('half-open probe that heals cleanly → the probe heal RUNS and the circuit closes', async () => {
        const actuator = fakeActuator(),
              events   = [],
              service  = createService({
                  evidenceGatherer   : async () => [walStall()],
                  recoveryActuator   : actuator,
                  systemicCircuitGate: async () => ({open: false, status: 'half-open-probe', reason: 'cooldown elapsed — one recovery probe'}),
                  recordCircuitEvent : async event => { events.push(event); }
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('healed');
        expect(actuator.calls.applyHeal).toHaveLength(1);                // the single probe heal ran
        expect(events).toContainEqual(expect.objectContaining({type: 'circuit-close'}));
    });

    test('half-open probe runs EXACTLY ONE actionable heal (not the full batch — no mini-storm)', async () => {
        const actuator = fakeActuator(),
              events   = [],
              service  = createService({
                  evidenceGatherer   : async () => [walStall('neo-agent-memory'), walStall('neo-agent-sessions')],
                  recoveryActuator   : actuator,
                  systemicCircuitGate: async () => ({open: false, status: 'half-open-probe', reason: 'cooldown elapsed'}),
                  recordCircuitEvent : async event => { events.push(event); }
              });

        await service.gatherAndDiagnose();

        expect(actuator.calls.applyHeal).toHaveLength(1);                              // ONE probe, NOT two (no re-storm)
        expect(events).toContainEqual(expect.objectContaining({type: 'circuit-close'})); // the single probe healed → close
    });

    test('half-open probe that RE-FAILS refreshes the open circuit (circuit-open at observedAt, not circuit-close)', async () => {
        const actuator = fakeActuator({failOn: 'neo-agent-memory'}),
              events   = [],
              service  = createService({
                  evidenceGatherer   : async () => [walStall('neo-agent-memory')],
                  recoveryActuator   : actuator,
                  systemicCircuitGate: async () => ({open: false, status: 'half-open-probe', reason: 'cooldown elapsed'}),
                  recordCircuitEvent : async event => { events.push(event); }
              });

        await service.gatherAndDiagnose();

        expect(actuator.calls.applyHeal).toHaveLength(1);                              // the probe ran
        expect(events).toContainEqual(expect.objectContaining({type: 'circuit-open'})); // re-opened → next fold rides it out
        expect(events.some(event => event.type === 'circuit-close')).toBe(false);
    });

    test('circuit CLOSED → proceeds normally (heals run, no circuit event recorded)', async () => {
        const actuator = fakeActuator(),
              events   = [],
              service  = createService({
                  evidenceGatherer   : async () => [walStall()],
                  recoveryActuator   : actuator,
                  systemicCircuitGate: async () => ({open: false, status: 'closed', reason: 'not systemic'}),
                  recordCircuitEvent : async event => { events.push(event); }
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('healed');
        expect(actuator.calls.applyHeal).toHaveLength(1);
        expect(events).toHaveLength(0);
    });

    test('surfaces a chronic unsafe-input mis-wire in the decision (observability only — does not gate)', async () => {
        const service = createService({
            evidenceGatherer          : async () => [clean()],
            recoveryActuator          : fakeActuator(),
            chronicUnsafeInputDetector: async () => [{action: 're-embed-missing', collection: 'neo-agent-memory', count: 7}]
        });

        const decision = await service.gatherAndDiagnose();

        expect(decision.chronicUnsafeInput).toEqual([{action: 're-embed-missing', collection: 'neo-agent-memory', count: 7}]);
        expect(decision.status).toBe('clean'); // observability only — the detector does NOT change the heal status
    });

    test('no chronic detector wired → decision.chronicUnsafeInput defaults to []', async () => {
        const service  = createService({evidenceGatherer: async () => [clean()], recoveryActuator: fakeActuator()}),
              decision = await service.gatherAndDiagnose();

        expect(decision.chronicUnsafeInput).toEqual([]);
    });
});
