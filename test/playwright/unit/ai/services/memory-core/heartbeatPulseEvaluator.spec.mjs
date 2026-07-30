import {test, expect} from '@playwright/test';
import {
    HEARTBEAT_PULSE_ENTITY_PREFIX,
    HEARTBEAT_PULSE_ENTITY_TYPE,
    match,
    matchHeartbeatPulse,
    parseHeartbeatPulseEntityId,
    PERMISSION_EDGE_TYPES,
    TASK_STATE_CHANGED_ENTITY_TYPE,
    TASK_STATE_CHANGED_SCHEMA_VERSION
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

    test('matches the signed Shape-B route and rejects non-interrupt Shape A (#16180)', () => {
        expect(matchHeartbeatPulse({trace: pulseTrace, harnessTarget: 'a2a-webhook', agentIdentity: '@neo-opus-vega'}))
            .toEqual({targetIdentity: '@neo-opus-vega', pulseId: 'p1', logId: 42});
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

/**
 * Coverage for the shared `match()` evaluator — the option-3 consolidation that adopts the
 * WakeSubscriptionService (superset, correct) logic for all four triggers, so the wake-daemon stops
 * diverging. Pure functions + injected `entityData` accessors, so no Neo bootstrap / DB is required.
 * The cases that re-prove the three daemon-divergence fixes are called out inline.
 */
test.describe('Neo.ai.services.memory-core.heartbeatPulseEvaluator — match() (all 4 triggers)', () => {
    const OWNER     = '@neo-opus-vega';
    const edgeTrace = {entity_type: 'edges', entity_id: 'EDGE:e1', log_id: 7};

    const sub = (over = {}) => ({trigger: 'SENT_TO_ME', harnessTarget: 'mcp-notifications', agentIdentity: OWNER, filters: {}, ...over});
    const msg = (props = {}) => ({
        id        : 'MESSAGE:m1',
        label     : 'MESSAGE',
        properties: {
            from    : '@neo-gpt',
            priority: 'normal',
            sentAt  : '2026-07-22T10:00:00.000Z',
            subject : 'hi',
            ...props
        }
    });
    const data = (entity, {node = null, receipts = false} = {}) => ({entity, getNode: () => node, hasDeliveryReceipts: () => receipts});

    // --- guards ---
    test('returns null without an agentIdentity', () => {
        expect(match({trigger: 'SENT_TO_ME'}, data({type: 'SENT_TO'}), edgeTrace)).toBe(null);
    });

    test('returns null for a non-heartbeat trace with no resolved entity', () => {
        expect(match(sub(), {entity: null}, edgeTrace)).toBe(null);
    });

    // --- HEARTBEAT_PULSE (match() wraps matchHeartbeatPulse into the canonical envelope) ---
    test('heartbeat_pulse: wraps an eligible bridge-daemon pulse', () => {
        const trace = {entity_type: 'heartbeat_pulse', entity_id: `HEARTBEAT_PULSE:${OWNER}:p1`, log_id: 42};
        expect(match(sub({trigger: 'HEARTBEAT_PULSE', harnessTarget: 'bridge-daemon'}), {entity: null}, trace))
            .toEqual({type: 'heartbeat_pulse', payload: {targetIdentity: OWNER, pulseId: 'p1'}, logId: 42});
    });

    test('heartbeat_pulse: wraps an eligible a2a-webhook pulse', () => {
        const trace = {entity_type: 'heartbeat_pulse', entity_id: `HEARTBEAT_PULSE:${OWNER}:p2`, log_id: 43};
        expect(match(sub({trigger: 'SENT_TO_ME', harnessTarget: 'a2a-webhook'}), {entity: null}, trace))
            .toEqual({type: 'heartbeat_pulse', payload: {targetIdentity: OWNER, pulseId: 'p2'}, logId: 43});
    });

    // --- SENT_TO_ME ---
    test('sent_to_me: an unread direct SENT_TO to the owner fires', () => {
        const node = msg();
        expect(match(sub(), data({type: 'SENT_TO', source: node.id, target: OWNER}, {node}), edgeTrace))
            .toMatchObject({
                type   : 'sent_to_me',
                payload: {messageId: node.id, from: '@neo-gpt', sentAt: '2026-07-22T10:00:00.000Z'},
                logId  : 7
            });
    });

    test('sent_to_me: an already-read direct message does NOT fire (daemon over-wake fix)', () => {
        const node = msg({readAt: '2026-06-07T00:00:00Z'});
        expect(match(sub(), data({type: 'SENT_TO', source: node.id, target: OWNER}, {node}), edgeTrace)).toBe(null);
    });

    test('sent_to_me: a wakeSuppressed message does NOT fire', () => {
        const node = msg({wakeSuppressed: true});
        expect(match(sub(), data({type: 'SENT_TO', source: node.id, target: OWNER}, {node}), edgeTrace)).toBe(null);
    });

    test('sent_to_me: a broadcast from another agent fires', () => {
        const node = msg({from: '@neo-gpt', to: 'AGENT:*'});
        expect(match(sub(), data({type: 'SENT_TO', source: node.id, target: 'AGENT:*'}, {node}), edgeTrace))
            .toMatchObject({type: 'sent_to_me', payload: {isBroadcast: true}});
    });

    test('sent_to_me: the sender does NOT get woken by their own broadcast (same-sender suppression)', () => {
        const node = msg({from: OWNER, to: 'AGENT:*'});
        expect(match(sub(), data({type: 'SENT_TO', source: node.id, target: 'AGENT:*'}, {node}), edgeTrace)).toBe(null);
    });

    test('sent_to_me: a receipt-backed broadcast defers the legacy SENT_TO path (dedup)', () => {
        const node = msg({from: '@neo-gpt', to: 'AGENT:*'});
        expect(match(sub(), data({type: 'SENT_TO', source: node.id, target: 'AGENT:*'}, {node, receipts: true}), edgeTrace)).toBe(null);
    });

    test('sent_to_me: an unread DELIVERED_TO receipt fires', () => {
        const node = msg({from: '@neo-gpt'});
        expect(match(sub(), data({type: 'DELIVERED_TO', source: node.id, target: OWNER, properties: {}}, {node}), edgeTrace))
            .toMatchObject({type: 'sent_to_me', payload: {messageId: node.id}});
    });

    test('sent_to_me: a read DELIVERED_TO receipt does NOT fire', () => {
        const node = msg();
        expect(match(sub(), data({type: 'DELIVERED_TO', source: node.id, target: OWNER, properties: {readAt: 'x'}}, {node}), edgeTrace)).toBe(null);
    });

    test('sent_to_me: the priority filter gates a non-matching message', () => {
        const node = msg({priority: 'normal'});
        expect(match(sub({filters: {priority: 'high'}}), data({type: 'SENT_TO', source: node.id, target: OWNER}, {node}), edgeTrace)).toBe(null);
    });

    test('sent_to_me: the priority filter passes a matching direct message', () => {
        const node = msg({priority: 'high'});
        expect(match(sub({filters: {priority: 'high'}}), data({type: 'SENT_TO', source: node.id, target: OWNER}, {node}), edgeTrace))
            .toMatchObject({type: 'sent_to_me', payload: {priority: 'high'}});
    });

    test('sent_to_me: the priority filter gates a non-matching legacy broadcast', () => {
        const node = msg({priority: 'normal', to: 'AGENT:*'});
        expect(match(sub({filters: {priority: 'high'}}), data({type: 'SENT_TO', source: node.id, target: 'AGENT:*'}, {node}), edgeTrace)).toBe(null);
    });

    test('sent_to_me: the priority filter passes a matching legacy broadcast', () => {
        const node = msg({priority: 'high', to: 'AGENT:*'});
        expect(match(sub({filters: {priority: 'high'}}), data({type: 'SENT_TO', source: node.id, target: 'AGENT:*'}, {node}), edgeTrace))
            .toMatchObject({type: 'sent_to_me', payload: {isBroadcast: true, priority: 'high'}});
    });

    test('sent_to_me: the priority filter gates a non-matching receipt-backed broadcast', () => {
        const node = msg({priority: 'normal', to: 'AGENT:*'});
        expect(match(sub({filters: {priority: 'high'}}), data({type: 'DELIVERED_TO', source: node.id, target: OWNER, properties: {}}, {node}), edgeTrace)).toBe(null);
    });

    test('sent_to_me: the priority filter passes a matching receipt-backed broadcast', () => {
        const node = msg({priority: 'high', to: 'AGENT:*'});
        expect(match(sub({filters: {priority: 'high'}}), data({type: 'DELIVERED_TO', source: node.id, target: OWNER, properties: {}}, {node}), edgeTrace))
            .toMatchObject({type: 'sent_to_me', payload: {isBroadcast: true, priority: 'high'}});
    });

    test('sent_to_me: the senderFilter passes a whitelisted sender', () => {
        const node = msg({from: '@neo-gpt'});
        expect(match(sub({filters: {senderFilter: ['@neo-gpt']}}), data({type: 'SENT_TO', source: node.id, target: OWNER}, {node}), edgeTrace))
            .toMatchObject({type: 'sent_to_me'});
    });

    // --- PERMISSION_GRANTED (the dead-code fix: daemon keyed on HAS_PERMISSION, created nowhere) ---
    test('permission_granted: a CAN_* grant to the owner fires (was dead on the daemon)', () => {
        const edge = {type: 'CAN_REPLY_TO', source: '@neo-gpt', target: OWNER, properties: {}};
        expect(match(sub({trigger: 'PERMISSION_GRANTED'}), {entity: edge}, edgeTrace))
            .toEqual({type: 'permission_granted', payload: {scope: 'CAN_REPLY_TO', grantedBy: '@neo-gpt'}, logId: 7});
    });

    test('permission_granted: the legacy HAS_PERMISSION edge no longer matches anything', () => {
        const edge = {type: 'HAS_PERMISSION', source: '@neo-gpt', target: OWNER, properties: {}};
        expect(match(sub({trigger: 'PERMISSION_GRANTED'}), {entity: edge}, edgeTrace)).toBe(null);
    });

    test('permission_granted: a grant to a different target does not fire', () => {
        const edge = {type: 'CAN_READ_INBOX_OF', source: '@neo-gpt', target: '@someone-else', properties: {}};
        expect(match(sub({trigger: 'PERMISSION_GRANTED'}), {entity: edge}, edgeTrace)).toBe(null);
    });

    test('exposes the canonical CAN_* permission edge types', () => {
        expect(PERMISSION_EDGE_TYPES).toEqual(['CAN_REPLY_TO', 'CAN_READ_INBOX_OF', 'CAN_READ_MEMORIES_OF']);
    });

    // --- TASK_STATE_CHANGED ---------------------------------------------------------------
    const taskTrace = (payload = {}, extra = {}) => ({
        entity_type  : 'task_state_changed',
        entity_id    : 'MESSAGE:t1',
        event_id     : 'task-event-1',
        event_payload: JSON.stringify({
            schemaVersion      : 'task-state-change.v1',
            taskId             : 'MESSAGE:t1',
            previousState      : 'Submitted',
            newState           : 'Working',
            originator         : '@neo-gpt',
            assignee           : OWNER,
            assignmentAuthority: 'memory-core.v1',
            lastModifiedAt     : '2026-07-12T20:00:00.000Z',
            ...payload
        }),
        log_id: 9,
        ...extra
    });

    test('task_state_changed: fires when the owner is the assignee', () => {
        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, taskTrace()))
            .toMatchObject({
                type         : 'task_state_changed',
                sourceEventId: 'task-event-1',
                payload      : {newState: 'Working', assignee: OWNER}
            });
    });

    test('task_state_changed: ALSO fires when the owner is the originator (broadened from assignee-only)', () => {
        const trace = taskTrace({originator: OWNER, assignee: '@neo-gpt', newState: 'Completed'});
        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, trace))
            .toMatchObject({type: 'task_state_changed', payload: {originator: OWNER}});
    });

    test('task_state_changed: does not fire when the owner is neither originator nor assignee', () => {
        const trace = taskTrace({originator: '@neo-gpt', assignee: '@neo-gpt'});
        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, trace)).toBe(null);
    });

    test('task_state_changed: does not trust an assignee without the server-owned authority stamp', () => {
        const missing = taskTrace({assignmentAuthority: null});
        const spoofed = taskTrace({assignmentAuthority: 'caller-spoof.v1'});

        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, missing)).toBe(null);
        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, spoofed)).toBe(null);
    });

    test('task_state_changed: reports the immutable transition snapshot and durable event identity', () => {
        const trace = taskTrace({
            previousState : 'Working',
            newState      : 'InputRequired',
            lastModifiedAt: '2026-07-12T20:01:02.003Z'
        }, {event_id: 'task-event-2'});

        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, trace)).toMatchObject({
            sourceEventId: 'task-event-2',
            payload      : {
                previousState : 'Working',
                newState      : 'InputRequired',
                lastModifiedAt: '2026-07-12T20:01:02.003Z'
            }
        });
    });

    test('task_state_changed: malformed or incomplete typed payloads fail closed', () => {
        const malformed        = taskTrace({}, {event_payload: '{not-json'});
        const missingClock     = taskTrace({lastModifiedAt: null});
        const missingEventId   = taskTrace({}, {event_id: null});
        const emptyAssignee    = taskTrace({assignee: ''});
        const invalidAuthority = taskTrace({assignmentAuthority: {source: 'caller'}});
        const invalidOldState  = taskTrace({previousState: 'BANANA'});
        const invalidNewState  = taskTrace({newState: 'NOT_A_TASK_STATE'});
        const invalidClock     = taskTrace({lastModifiedAt: 'not-a-date'});

        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, malformed)).toBe(null);
        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, missingClock)).toBe(null);
        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, missingEventId)).toBe(null);
        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, emptyAssignee)).toBe(null);
        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, invalidAuthority)).toBe(null);
        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, invalidOldState)).toBe(null);
        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, invalidNewState)).toBe(null);
        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: null}, invalidClock)).toBe(null);
    });

    test('task_state_changed: generic MESSAGE node rewrites are cache invalidation only', () => {
        const mutableNode = {
            id        : 'MESSAGE:t1',
            label     : 'MESSAGE',
            properties: {
                from                   : '@neo-gpt',
                lastModifiedAt         : '2026-07-12T20:00:00.000Z',
                taskAssignmentAuthority: 'memory-core.v1',
                task                   : {state: 'Working', assignee: OWNER}
            }
        };
        const genericTrace = {entity_type: 'nodes', entity_id: 'MESSAGE:t1', log_id: 10};

        expect(match(sub({trigger: 'TASK_STATE_CHANGED'}), {entity: mutableNode}, genericTrace)).toBe(null);
    });

    test('exposes the canonical typed Task-event constants', () => {
        expect(TASK_STATE_CHANGED_ENTITY_TYPE).toBe('task_state_changed');
        expect(TASK_STATE_CHANGED_SCHEMA_VERSION).toBe('task-state-change.v1');
    });
});
