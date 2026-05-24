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

test.describe('resolveTargets (Sub 1 #11905 / Epic #11829 Layer 2)', () => {
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

    test('AC4 / Step 3 — no-config defaults to self (deployment-portable safe default)', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: '@neo-opus-4-7',
            logger
        });
        expect(result).toEqual(['@neo-opus-4-7']);
        expect(logger.calls).toEqual([]);
    });

    test('AC4 / Step 3 — explicit null targetSource defaults to self', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: '@neo-gpt',
            targetSource: null,
            logger
        });
        expect(result).toEqual(['@neo-gpt']);
        expect(logger.calls).toEqual([]);
    });

    test('AC4 / Step 1 — explicit target list wins over targetSource', async () => {
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

    test('Step 1 — explicit target list deduplicates while preserving order', async () => {
        const result = await resolveTargets({
            selfIdentity   : '@neo-opus-4-7',
            explicitTargets: ['@a', '@b', '@a', '@c', '@b']
        });
        expect(result).toEqual(['@a', '@b', '@c']);
    });

    test('Step 1 — empty explicitTargets array falls through to targetSource semantics', async () => {
        const result = await resolveTargets({
            selfIdentity   : '@neo-opus-4-7',
            targetSource   : 'self',
            explicitTargets: []
        });
        expect(result).toEqual(['@neo-opus-4-7']);
    });

    test('AC4 / Step 4 — active-local-team reads identityRoots filtered on participationStatus active', async () => {
        const result = await resolveTargets({
            selfIdentity: '@neo-opus-4-7',
            targetSource: 'active-local-team'
        });
        // Resolver output should match the IDENTITIES filter; we compute the expected set
        // off the live registry to keep this test resilient to peer membership changes.
        const expected = IDENTITIES
            .filter(i => i.type === 'AgentIdentity' && i.properties?.participationStatus === 'active')
            .map(i => i.id);
        expect(result).toEqual(expected);
        // AC3 fork-safety check: result should NOT contain non-active maintainers (e.g., a
        // benched Gemini identity must be filtered out unless its status flips back to 'active').
        const benched = IDENTITIES
            .filter(i => i.type === 'AgentIdentity' && i.properties?.participationStatus !== 'active')
            .map(i => i.id);
        for (const id of benched) {
            expect(result).not.toContain(id);
        }
    });

    test('Step 5 / disabled — returns empty list + logs info', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: '@neo-opus-4-7',
            targetSource: 'disabled',
            logger
        });
        expect(result).toEqual([]);
        expect(logger.calls.some(c => c.level === 'info' && c.msg.includes('disabled'))).toBe(true);
    });

    test('Step 5 / active-subscribers — unions self with provider output (preserves pre-#11905 shape)', async () => {
        const subscribers = ['@neo-gpt', '@neo-opus-4-7', 'neo-gemini-3-1-pro'];
        const result = await resolveTargets({
            selfIdentity              : '@neo-opus-4-7',
            targetSource              : 'active-subscribers',
            activeSubscribersProvider: async () => subscribers
        });
        // Self appears first; subscribers union (no duplicates); 3rd entry gets normalized.
        expect(result).toEqual(['@neo-opus-4-7', '@neo-gpt', '@neo-gemini-3-1-pro']);
    });

    test('Step 5 / active-subscribers without provider — falls back to self with warn', async () => {
        const logger = captureLogger();
        const result = await resolveTargets({
            selfIdentity: '@neo-opus-4-7',
            targetSource: 'active-subscribers',
            logger
        });
        expect(result).toEqual(['@neo-opus-4-7']);
        expect(logger.calls.some(c => c.level === 'warn' && c.msg.includes('active-subscribers'))).toBe(true);
    });

    test('AC4 / Step 5 — unknown targetSource fails closed to self + warns', async () => {
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

    test('AC3 fork-safety — null selfIdentity + no source returns [] (operator must notice, not silent leak)', async () => {
        const result = await resolveTargets({
            selfIdentity: null
        });
        expect(result).toEqual([]);
    });

    test('Step 5 / active-subscribers — empty subscribers + valid self yields just [self]', async () => {
        const result = await resolveTargets({
            selfIdentity              : '@neo-opus-4-7',
            targetSource              : 'active-subscribers',
            activeSubscribersProvider: async () => []
        });
        expect(result).toEqual(['@neo-opus-4-7']);
    });

    test('normalization — selfIdentity without @ prefix gets canonicalized', async () => {
        const result = await resolveTargets({
            selfIdentity: 'neo-opus-4-7'  // no @ prefix
        });
        expect(result).toEqual(['@neo-opus-4-7']);
    });

    test('VALID_TARGET_SOURCES — exported as frozen tuple of the 4 supported enum values', () => {
        expect(VALID_TARGET_SOURCES).toEqual(['self', 'active-local-team', 'active-subscribers', 'disabled']);
        expect(Object.isFrozen(VALID_TARGET_SOURCES)).toBe(true);
    });
});
