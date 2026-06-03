import {test, expect} from '@playwright/test';
import {
    getDueTask,
    resolveTargets,
    VALID_TARGET_SOURCES
} from '../../../../../../../ai/daemons/orchestrator/scheduling/swarmHeartbeat.mjs';
import {IDENTITIES} from '../../../../../../../ai/graph/identityRoots.mjs';

test.describe('orchestrator/scheduling/swarmHeartbeat (#11859 / Epic #11831)', () => {
    test('returns a periodic-heartbeat trigger when the interval has elapsed since lastRunAt', () => {
        expect(getDueTask({
            state                   : {lastRunAt: 0},
            now                     : 900000,
            swarmHeartbeatIntervalMs: 900000
        })).toEqual({
            taskName: 'swarm-heartbeat',
            source  : 'periodic-heartbeat',
            reason  : 'periodic-heartbeat:900000'
        });
    });

    test('returns null when the interval has not yet elapsed', () => {
        expect(getDueTask({
            state                   : {lastRunAt: 0},
            now                     : 899999,
            swarmHeartbeatIntervalMs: 900000
        })).toBeNull();
    });

    test('treats intervalMs <= 0 as disabled (does not fire)', () => {
        expect(getDueTask({
            state                   : {lastRunAt: 0},
            now                     : 999999999,
            swarmHeartbeatIntervalMs: 0
        })).toBeNull();

        expect(getDueTask({
            state                   : {lastRunAt: 0},
            now                     : 999999999,
            swarmHeartbeatIntervalMs: -1
        })).toBeNull();
    });

    test('handles missing state gracefully (lastRunAt defaults to 0)', () => {
        expect(getDueTask({
            state                   : undefined,
            now                     : 900000,
            swarmHeartbeatIntervalMs: 900000
        })).toEqual({
            taskName: 'swarm-heartbeat',
            source  : 'periodic-heartbeat',
            reason  : 'periodic-heartbeat:900000'
        });
    });
});

test.describe('resolveTargets — deployment-portable swarm-heartbeat target resolver', () => {
    /** Build a stub logger that captures level + msg so we can assert + suppress noise. */
    function captureLogger() {
        const calls = [];
        return {
            calls,
            info: msg => calls.push({level: 'info', msg}),
            warn: msg => calls.push({level: 'warn', msg}),
            error: msg => calls.push({level: 'error', msg})
        };
    }

    test('no-config defaults to self (deployment-portable safe default)', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: '@neo-opus-4-7',
            logger
        });
        expect(result).toEqual(['@neo-opus-4-7']);
        expect(logger.calls).toEqual([]);
    });

    test('explicit null targetSource defaults to self', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: '@neo-gpt',
            targetSource: null,
            logger
        });
        expect(result).toEqual(['@neo-gpt']);
        expect(logger.calls).toEqual([]);
    });

    test('explicit target list wins over targetSource', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity   : '@neo-opus-4-7',
            targetSource   : 'active-local-team',   // would normally be honored
            explicitTargets: ['@some-external-agent', 'neo-gpt'],  // wins; gets normalized
            logger
        });
        expect(result).toEqual(['@some-external-agent', '@neo-gpt']);
        expect(logger.calls).toEqual([]);
    });

    test('explicit target list deduplicates while preserving order', async () => {
        const result = await resolveTargets({
            selfIdentity   : '@neo-opus-4-7',
            explicitTargets: ['@a', '@b', '@a', '@c', '@b']
        });
        expect(result).toEqual(['@a', '@b', '@c']);
    });

    test('empty explicitTargets array falls through to targetSource semantics', async () => {
        const result = await resolveTargets({
            selfIdentity   : '@neo-opus-4-7',
            targetSource   : 'self',
            explicitTargets: []
        });
        expect(result).toEqual(['@neo-opus-4-7']);
    });

    test('active-local-team reads identityRoots filtered on participationStatus active', async () => {
        const result = await resolveTargets({
            selfIdentity: '@neo-opus-4-7',
            targetSource: 'active-local-team'
        });
        // Compute the expected set off the live registry to keep this test resilient
        // to membership changes.
        const expected = IDENTITIES
            .filter(i => i.type === 'AgentIdentity' && i.properties?.participationStatus === 'active')
            .map(i => i.id);
        expect(result).toEqual(expected);
        // Non-active maintainers (e.g. a benched identity) must be filtered out unless
        // their status flips back to 'active'.
        const benched = IDENTITIES
            .filter(i => i.type === 'AgentIdentity' && i.properties?.participationStatus !== 'active')
            .map(i => i.id);
        for (const id of benched) {
            expect(result).not.toContain(id);
        }
    });

    test('identityRoots marks @neo-claude-opus active without static wake-route leakage (#12413)', () => {
        const identity = IDENTITIES.find(identity => identity.id === '@neo-claude-opus');

        expect(identity).toBeDefined();

        const {properties} = identity;

        expect(properties.participationStatus).toBe('active');
        expect(properties.statusReason).toBeNull();
        expect(properties.since).toBeNull();
        expect(properties.reactivationTrigger).toBeNull();
        expect(properties).not.toHaveProperty('subscriptionTemplate');
        expect(properties.identityContract.reviewSemantics.crossFamilyApprovalQualified).toBe(false);
        expect(properties.swarmRole).toContain('Active Claude-family generalist maintainer identity');
    });

    test('disabled — returns empty list + logs info', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: '@neo-opus-4-7',
            targetSource: 'disabled',
            logger
        });
        expect(result).toEqual([]);
        expect(logger.calls.some(c => c.level === 'info' && c.msg.includes('disabled'))).toBe(true);
    });

    test('active-subscribers — unions self with provider output', async () => {
        const subscribers = ['@neo-gpt', '@neo-opus-4-7', 'neo-gemini-3-1-pro'];
        const result = await resolveTargets({
            selfIdentity              : '@neo-opus-4-7',
            targetSource              : 'active-subscribers',
            activeSubscribersProvider: async () => subscribers
        });
        // Self appears first; subscribers union (no duplicates); 3rd entry gets normalized.
        expect(result).toEqual(['@neo-opus-4-7', '@neo-gpt', '@neo-gemini-3-1-pro']);
    });

    test('active-subscribers without provider — falls back to self with warn', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: '@neo-opus-4-7',
            targetSource: 'active-subscribers',
            logger
        });
        expect(result).toEqual(['@neo-opus-4-7']);
        expect(logger.calls.some(c => c.level === 'warn' && c.msg.includes('active-subscribers'))).toBe(true);
    });

    test('unknown targetSource fails closed to self + warns', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: '@neo-opus-4-7',
            targetSource: 'this-source-does-not-exist',
            logger
        });
        expect(result).toEqual(['@neo-opus-4-7']);
        expect(logger.calls.some(c => c.level === 'warn' && c.msg.includes('this-source-does-not-exist'))).toBe(true);
        // Operator should be told what valid values exist.
        expect(logger.calls.some(c => VALID_TARGET_SOURCES.every(v => c.msg.includes(v)))).toBe(true);
    });

    test('null selfIdentity + no source returns [] AND logs disables-with-log notice', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: null,
            logger
        });
        expect(result).toEqual([]);
        // The info log surfaces the misconfiguration so operators notice and either set
        // NEO_AGENT_IDENTITY or explicitly opt-in to targetSource='disabled'.
        const infoMatch = logger.calls.find(c =>
            c.level === 'info' &&
            c.msg.includes("'self' resolved to self") &&
            c.msg.includes('selfIdentity is null') &&
            c.msg.includes('disabled')
        );
        expect(infoMatch).toBeTruthy();
        // Operator-actionable guidance must name both knobs.
        expect(infoMatch.msg).toContain('NEO_AGENT_IDENTITY');
        expect(infoMatch.msg).toContain("targetSource='disabled'");
    });

    test('null selfIdentity + unknown source falls back to self + logs warn AND info', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: null,
            targetSource: 'bogus-source-name',
            logger
        });
        expect(result).toEqual([]);
        expect(logger.calls.some(c => c.level === 'warn' && c.msg.includes('bogus-source-name'))).toBe(true);
        expect(logger.calls.some(c => c.level === 'info' && c.msg.includes('unknown-source-fallback'))).toBe(true);
    });

    test('null selfIdentity + active-subscribers missing provider falls back to self + logs warn AND info', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: null,
            targetSource: 'active-subscribers',
            logger
        });
        expect(result).toEqual([]);
        expect(logger.calls.some(c => c.level === 'warn' && c.msg.includes('active-subscribers'))).toBe(true);
        expect(logger.calls.some(c => c.level === 'info' && c.msg.includes('active-subscribers-missing-provider'))).toBe(true);
    });

    test('active-subscribers — empty subscribers + valid self yields just [self]', async () => {
        const result = await resolveTargets({
            selfIdentity              : '@neo-opus-4-7',
            targetSource              : 'active-subscribers',
            activeSubscribersProvider: async () => []
        });
        expect(result).toEqual(['@neo-opus-4-7']);
    });

    // ----- active-a2a-participants (#12003): activity-derived candidate discovery -----

    test('active-a2a-participants — unions self with provider output (3h A2A activity)', async () => {
        const participants = ['@neo-gpt', '@neo-opus-4-7', 'neo-gemini-3-1-pro'];
        const result = await resolveTargets({
            selfIdentity                  : '@neo-opus-4-7',
            targetSource                  : 'active-a2a-participants',
            activeA2aParticipantsProvider : async () => participants
        });
        // Self appears first; participants union (no duplicates); 3rd entry gets normalized.
        expect(result).toEqual(['@neo-opus-4-7', '@neo-gpt', '@neo-gemini-3-1-pro']);
    });

    test('active-a2a-participants without provider — falls back to self with warn', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: '@neo-opus-4-7',
            targetSource: 'active-a2a-participants',
            logger
        });
        expect(result).toEqual(['@neo-opus-4-7']);
        expect(logger.calls.some(c => c.level === 'warn' && c.msg.includes('active-a2a-participants'))).toBe(true);
    });

    test('active-a2a-participants — empty participants + valid self yields just [self]', async () => {
        const result = await resolveTargets({
            selfIdentity                  : '@neo-opus-4-7',
            targetSource                  : 'active-a2a-participants',
            activeA2aParticipantsProvider : async () => []
        });
        expect(result).toEqual(['@neo-opus-4-7']);
    });

    test('null selfIdentity + active-a2a-participants missing provider falls back to self + logs warn AND info', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: null,
            targetSource: 'active-a2a-participants',
            logger
        });
        expect(result).toEqual([]);
        expect(logger.calls.some(c => c.level === 'warn' && c.msg.includes('active-a2a-participants'))).toBe(true);
        expect(logger.calls.some(c => c.level === 'info' && c.msg.includes('active-a2a-participants-missing-provider'))).toBe(true);
    });

    test('normalization — selfIdentity without @ prefix gets canonicalized', async () => {
        const result = await resolveTargets({
            selfIdentity: 'neo-opus-4-7'  // no @ prefix
        });
        expect(result).toEqual(['@neo-opus-4-7']);
    });

    test('VALID_TARGET_SOURCES — exported as frozen tuple of the 5 supported enum values', () => {
        expect(VALID_TARGET_SOURCES).toEqual(['self', 'active-local-team', 'active-subscribers', 'active-a2a-participants', 'disabled']);
        expect(Object.isFrozen(VALID_TARGET_SOURCES)).toBe(true);
    });
});
