import {test, expect} from '@playwright/test';
import {
    HEARTBEAT_PULSE_ENTITY_PREFIX,
    HEARTBEAT_PULSE_ENTITY_TYPE,
    matchHeartbeatPulse,
    parseHeartbeatPulseEntityId
} from '../../../../../../ai/services/memory-core/heartbeatPulseEvaluator.mjs';

/**
 * Unit coverage for the shared heartbeat-pulse evaluator — the single source of truth
 * consolidated from the wake-daemon + WakeSubscriptionService dual-write. Pure functions, so no
 * Neo bootstrap / DB is required; this exercises the parse + eligibility both consumers now share.
 */
test.describe('Neo.ai.services.memory-core.heartbeatPulseEvaluator', () => {
    // --- parseHeartbeatPulseEntityId ---------------------------------------------------------

    test('parses a well-formed entity id (#12008)', () => {
        expect(parseHeartbeatPulseEntityId('HEARTBEAT_PULSE:@neo-opus-vega:abc-123'))
            .toEqual({targetIdentity: '@neo-opus-vega', pulseId: 'abc-123'});
    });

    test('splits on the LAST colon so identities containing colons survive (#12008)', () => {
        // `lastIndexOf` separator: a colon-bearing identity keeps its colon; only the trailing
        // uuid segment is the pulseId. Preserves the original daemon + service parse behavior.
        expect(parseHeartbeatPulseEntityId('HEARTBEAT_PULSE:AGENT:*:uuid-9'))
            .toEqual({targetIdentity: 'AGENT:*', pulseId: 'uuid-9'});
    });

    test('returns null for a wrong prefix (#12008)', () => {
        expect(parseHeartbeatPulseEntityId('OTHER:x:y')).toBe(null);
    });

    test('returns null for a malformed id with no pulse segment (#12008)', () => {
        expect(parseHeartbeatPulseEntityId('HEARTBEAT_PULSE:onlyidentity')).toBe(null);
    });

    test('returns null for nullish input (#12008)', () => {
        expect(parseHeartbeatPulseEntityId(null)).toBe(null);
        expect(parseHeartbeatPulseEntityId(undefined)).toBe(null);
    });

    test('honors a custom prefix parameter (preserves service config override-ability) (#12008)', () => {
        expect(parseHeartbeatPulseEntityId('HB:id:p', 'HB')).toEqual({targetIdentity: 'id', pulseId: 'p'});
        expect(parseHeartbeatPulseEntityId('HEARTBEAT_PULSE:id:p', 'HB')).toBe(null);
    });

    // --- matchHeartbeatPulse -----------------------------------------------------------------

    const pulseTrace = {entity_type: 'heartbeat_pulse', entity_id: 'HEARTBEAT_PULSE:@neo-opus-vega:p1', log_id: 42};

    test('matches an eligible bridge-daemon pulse for the target identity (#12008)', () => {
        expect(matchHeartbeatPulse({trace: pulseTrace, harnessTarget: 'bridge-daemon', agentIdentity: '@neo-opus-vega'}))
            .toEqual({targetIdentity: '@neo-opus-vega', pulseId: 'p1', logId: 42});
    });

    test('returns null when entity_type is not a heartbeat pulse (#12008)', () => {
        expect(matchHeartbeatPulse({trace: {...pulseTrace, entity_type: 'edges'}, harnessTarget: 'bridge-daemon', agentIdentity: '@neo-opus-vega'})).toBe(null);
    });

    test('returns null when harnessTarget is not the frozen bridge-daemon route value (#12008)', () => {
        expect(matchHeartbeatPulse({trace: pulseTrace, harnessTarget: 'mcp-notifications', agentIdentity: '@neo-opus-vega'})).toBe(null);
    });

    test('returns null when the pulse target identity does not match the subscription (#12008)', () => {
        expect(matchHeartbeatPulse({trace: pulseTrace, harnessTarget: 'bridge-daemon', agentIdentity: '@neo-gpt'})).toBe(null);
    });

    test('exposes the canonical constants the daemon + service both source (#12008)', () => {
        expect(HEARTBEAT_PULSE_ENTITY_TYPE).toBe('heartbeat_pulse');
        expect(HEARTBEAT_PULSE_ENTITY_PREFIX).toBe('HEARTBEAT_PULSE');
    });
});
