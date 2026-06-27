import {test, expect}              from '@playwright/test';
import Neo                         from '../../../../../../../src/Neo.mjs';
import * as core                   from '../../../../../../../src/core/_export.mjs';
import DataRecoveryActuatorService from '../../../../../../../ai/daemons/orchestrator/services/DataRecoveryActuatorService.mjs';

const NOW = 1_000_000_000_000;

/**
 * The interim autonomous data-recovery actuator: `applyHeal` is the escalate-replacement terminal.
 * These assert the INTERIM contract (no ops → autonomous defer, never a page) AND the wired-actuator seam
 * (a wired op executes; the anti-thrash invariant holds), so the interim → wired transition needs no seam change.
 */
test.describe('DataRecoveryActuatorService.applyHeal — autonomous terminal (no escalate, no page)', () => {
    test('interim: no heal operation wired → deferred (autonomous, never a page)', async () => {
        const actuator = Neo.create(DataRecoveryActuatorService);
        const outcome  = await actuator.applyHeal({action: 'quarantine', collection: 'c1', evidence: {}, now: NOW});

        expect(outcome).toMatchObject({action: 'quarantine', collection: 'c1', status: 'deferred'});
        // The whole point of the cutover: NO escalate/page status is ever produced.
        expect(['escalate', 'escalated', 'page', 'paged']).not.toContain(outcome.status);
    });

    test('a nullish / unknown action resolves to a recorded no-op, not a throw or a page', async () => {
        const actuator = Neo.create(DataRecoveryActuatorService);
        const outcome  = await actuator.applyHeal({action: 'none', collection: 'c1', now: NOW});

        expect(outcome.collection).toBe('c1');
        expect(['escalate', 'escalated', 'page', 'paged']).not.toContain(outcome.status);
    });

    test('seam #14134 extends: a wired containment operation EXECUTES (defer → act)', async () => {
        const calls    = [];
        const actuator = Neo.create(DataRecoveryActuatorService, {
            healOperations: {quarantine: async ({collection}) => { calls.push(collection); return {status: 'quarantined', detail: 'not-served'}; }}
        });

        const outcome = await actuator.applyHeal({action: 'quarantine', collection: 'c1', evidence: {}, now: NOW});

        expect(calls).toEqual(['c1']);                 // the injected op ran
        expect(outcome).toMatchObject({status: 'quarantined'});
    });

    test('the injected recentRunsReader feeds the anti-thrash gate', async () => {
        const seen     = [];
        const actuator = Neo.create(DataRecoveryActuatorService, {
            recentRunsReader: async collection => { seen.push(collection); return []; },
            healOperations  : {quarantine: async () => ({status: 'quarantined'})}
        });

        await actuator.applyHeal({action: 'quarantine', collection: 'c2', now: NOW});
        expect(seen).toEqual(['c2']); // the gate consulted the per-collection history
    });

    test('a MUTATING action with no recordRun fails CLOSED (no recorder, no mutation) — never a page', async () => {
        const actuator = Neo.create(DataRecoveryActuatorService, {
            healOperations: {'re-embed-missing': async () => ({status: 're-embedded'})}
            // no recordRun → the dispatch core must refuse the mutating op
        });

        const outcome = await actuator.applyHeal({action: 're-embed-missing', collection: 'c1', now: NOW});
        expect(outcome.status).toBe('unsafe-input');
        expect(['escalate', 'escalated', 'page', 'paged']).not.toContain(outcome.status);
    });
});

test.describe('DataRecoveryActuatorService.applyHeal — recordHealOutcome (persist the OUTCOME, not just the attempt)', () => {
    test('persists the dispatch OUTCOME via the injected recordHealOutcome', async () => {
        const recorded = [];
        const actuator = Neo.create(DataRecoveryActuatorService, {
            recordHealOutcome: async outcome => { recorded.push(outcome); }
        });

        // 'quarantine' is non-mutating containment → the gate clears it; no wired op → a 'deferred' outcome.
        const outcome = await actuator.applyHeal({action: 'quarantine', collection: 'c1', now: NOW});

        expect(outcome).toMatchObject({action: 'quarantine', collection: 'c1', status: 'deferred'});
        expect(recorded).toHaveLength(1);
        expect(recorded[0]).toMatchObject({action: 'quarantine', collection: 'c1', status: 'deferred', healedAt: NOW});
    });

    test('a recordHealOutcome failure never breaks the heal (best-effort telemetry, swallowed)', async () => {
        const actuator = Neo.create(DataRecoveryActuatorService, {
            recordHealOutcome: async () => { throw new Error('ledger write failed'); }
        });

        const outcome = await actuator.applyHeal({action: 'quarantine', collection: 'c1', now: NOW});
        expect(outcome).toMatchObject({action: 'quarantine', collection: 'c1', status: 'deferred'}); // the heal stands
    });

    test('no recordHealOutcome wired → applyHeal still returns the outcome (observability is optional)', async () => {
        const actuator = Neo.create(DataRecoveryActuatorService); // recordHealOutcome stays null
        const outcome  = await actuator.applyHeal({action: 'quarantine', collection: 'c1', now: NOW});

        expect(outcome).toMatchObject({action: 'quarantine', collection: 'c1', status: 'deferred'});
    });
});
