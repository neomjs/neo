import {test, expect}                   from '@playwright/test';
import {createBootIdentityFactGatherer} from '../../../../../../../ai/daemons/orchestrator/services/bootIdentityFactGatherer.mjs';
import {SCHEDULER_RESUME_STATE}         from '../../../../../../../ai/daemons/orchestrator/services/bootIdentityFreshness.mjs';

test.describe('ai/daemons/orchestrator/services/bootIdentityFactGatherer — #14490 slice 2', () => {
    const bootAt = 1_000_000_000_000;

    test('maps the latest REM run-state entry to lastCycleAt/lastCycleRef + carries bootAt', async () => {
        const gather = createBootIdentityFactGatherer({
            bootAt,
            remRunStateDir        : '/tmp/rem',
            readRecentRemRunStates: async ({dir, limit}) => {
                expect(dir).toBe('/tmp/rem');
                expect(limit).toBe(1);
                return [{runId: 'cycle-abc', completedAt: bootAt - 3_600_000}];
            }
        });

        const facts = await gather();

        expect(facts.bootAt).toBe(bootAt);
        expect(facts.lastCycleAt).toBe(bootAt - 3_600_000);
        expect(facts.lastCycleRef).toBe('cycle-abc');
        expect(facts.schedulerResumeState).toBe(SCHEDULER_RESUME_STATE.none); // conservative default
        expect(facts.deferralReason).toBeNull();
    });

    test('read fault fails soft -> null cycle facts (discriminator returns unknown, never a definitive stale)', async () => {
        const gather = createBootIdentityFactGatherer({
            bootAt,
            remRunStateDir        : '/tmp/rem',
            readRecentRemRunStates: async () => { throw new Error('read fault'); }
        });

        const facts = await gather();

        expect(facts.lastCycleAt).toBeNull();
        expect(facts.lastCycleRef).toBeNull();
        expect(facts.bootAt).toBe(bootAt); // the boot fact is still present
    });

    test('empty store -> null cycle facts', async () => {
        const gather = createBootIdentityFactGatherer({
            bootAt,
            remRunStateDir        : '/tmp/rem',
            readRecentRemRunStates: async () => []
        });

        const facts = await gather();

        expect(facts.lastCycleAt).toBeNull();
        expect(facts.lastCycleRef).toBeNull();
    });

    test('injected resolvers refine the conservative defaults in place', async () => {
        const gather = createBootIdentityFactGatherer({
            bootAt,
            remRunStateDir             : '/tmp/rem',
            readRecentRemRunStates     : async () => [{runId: 'c1', completedAt: bootAt - 100}],
            resolveSchedulerResumeState: () => SCHEDULER_RESUME_STATE.reArmed,
            resolveDeferralReason      : async () => 'heavy-maintenance',
            resolveSourceRef           : () => 'runtime-digest-xyz'
        });

        const facts = await gather();

        expect(facts.schedulerResumeState).toBe(SCHEDULER_RESUME_STATE.reArmed);
        expect(facts.deferralReason).toBe('heavy-maintenance');
        expect(facts.sourceRef).toBe('runtime-digest-xyz');
    });
});
