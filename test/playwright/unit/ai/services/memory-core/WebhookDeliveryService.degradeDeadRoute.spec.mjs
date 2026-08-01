import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'WebhookDeliveryServiceDegradeDeadRouteTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * A dead wake route that cannot be marked degraded re-runs the full delivery cycle on every subsequent
 * message forever, with no surfaced signal.
 *
 * These specs deliberately do NOT stub `GraphService`. The sibling suite
 * (`WebhookDeliveryService.spec.mjs`) replaces `getNode` / `upsertNode` with in-memory doubles that
 * return a node WITH `properties` and never consult row-level security — which healed both halves of
 * this defect in setup and is why it survived with coverage pointing straight at it. Here the real
 * service runs against the real `GraphService` read/write path, with the requester left UNBOUND to
 * reproduce a background flush.
 *
 * Every test below fails on the pre-fix tree, and fails for the right reason:
 * - the degrade never lands, because the RLS-scoped read returns `null` for a node that exists;
 * - and once it does land, it lands on `harnessTarget`, which no degradation consumer reads.
 */

// Mutable holder so one fake db can switch the "active requester" between calls. A background timer
// binds no request, so `null` is the case under test — not an edge case, the normal flush condition.
const requester = {value: null};

/**
 * Builds a fake `GraphService.db` holding one pre-warmed WAKE_SUBSCRIPTION node. `autoSave` is left
 * unset so `upsertNode` mutates the in-memory node without reaching for SQLite, letting the specs
 * assert against the node object itself.
 * @param {Object} subscriptionNode
 * @returns {Object}
 */
function makeFakeDb(subscriptionNode) {
    const nodeMap = new Map([[subscriptionNode.id, subscriptionNode]]);

    return {
        getAdjacentNodes() {},
        nodes  : nodeMap,
        edges  : {getByIndex() { return [] }},
        storage: {
            RequestContextService: {
                getAgentIdentityNodeId: () => requester.value
            }
        }
    };
}

/**
 * A WAKE_SUBSCRIPTION exactly as the migration writes it: owner-stamped, not shared, not team-visible —
 * so every branch of the RLS predicate is false once the requester is absent.
 * @returns {Object}
 */
function makeSubscriptionNode() {
    return {
        id        : 'WAKE_SUB:dead-route',
        label     : 'WAKE_SUBSCRIPTION',
        properties: {
            userId               : '@neo-opus-grace',
            status               : 'active',
            harnessTarget        : 'a2a-webhook',
            harnessTargetMetadata: {
                url       : 'http://127.0.0.1:1/wake',
                signingKey: 'test-signing-key'
            }
        }
    };
}

test.describe('WebhookDeliveryService — degrading a dead route from a background flush (#16246)', () => {
    let GraphService, WebhookDeliveryService, originalDb, originalFetch;
    let fetchCalls = [];

    test.beforeAll(async () => {
        GraphService           = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        WebhookDeliveryService = (await import('../../../../../../ai/services/memory-core/WebhookDeliveryService.mjs')).default;
        originalFetch          = global.fetch;
    });

    test.beforeEach(() => {
        originalDb      = GraphService.db;
        requester.value = null;
        fetchCalls      = [];

        WebhookDeliveryService.configure({attemptTimeoutSeconds: 1});
        WebhookDeliveryService.consecutiveFailures.clear();
        WebhookDeliveryService.degradedSubscriptions?.clear();

        global.fetch = async (url, options) => {
            fetchCalls.push({url, options});
            return {ok: false, status: 400};
        };
    });

    test.afterEach(() => {
        GraphService.db = originalDb;
        requester.value = null;
        global.fetch    = originalFetch;
    });

    test('marks a dead route degraded with NO bound request context', async () => {
        const subscriptionNode = makeSubscriptionNode();
        GraphService.db        = makeFakeDb(subscriptionNode);

        // Necessity probe (AC 2): the mechanism claims the flush has no resolvable requester. Assert that
        // directly — if a requester IS bound here, the ticket's mechanism is wrong and the fix is misplaced.
        expect(GraphService.db.storage.RequestContextService.getAgentIdentityNodeId()).toBe(null);

        // Control: with no requester bound, the RLS-scoped read genuinely cannot see this node. This is the
        // defect's cause, asserted rather than assumed — and it must stay true, because a fix that works by
        // weakening RLS would open a cross-tenant read path to close a logging bug.
        expect(GraphService.getNode({id: subscriptionNode.id})).toBe(null);
        expect(GraphService.getNodeRecord({id: subscriptionNode.id})).toBe(null);

        const outcome = await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX'});

        expect(outcome).toBe('skipped');

        // The assertion that fails on the pre-fix tree: the degrade was skipped entirely, so the route's
        // state never changed and the next message repeated the whole sequence.
        expect(subscriptionNode.properties.status).toBe('degraded');
    });

    test('degradation lands on `status`, the field its consumers actually read', async () => {
        const subscriptionNode = makeSubscriptionNode();
        GraphService.db        = makeFakeDb(subscriptionNode);

        await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX'});

        // `degraded` is a `status` value; `disabled` is a `harnessTarget` value. Both consumers of
        // degradation read `properties.status`: the sunset check (`checkSunsetted.mjs` — which otherwise
        // classifies this dead route as ACTIVE, since `status` is untouched and `harnessTarget` is not
        // 'disabled') and the heartbeat push exclusion (`SwarmHeartbeatService`, whose SQL predicate is
        // `$.properties.status != 'degraded'`). Writing into `harnessTarget` left both blind.
        expect(subscriptionNode.properties.status).toBe('degraded');

        // The routing field keeps its documented value space: mcp-notifications | a2a-webhook |
        // bridge-daemon | disabled | none. 'degraded' was never a member, and only "worked" by falling
        // through CoalescingEngineService's unknown-target branch, which drops the digest.
        expect(subscriptionNode.properties.harnessTarget).toBe('a2a-webhook');

        // The degrade must not disturb anything else — notably the delivery credentials, without which the
        // route could never be repaired, and the owner stamp, whose loss would make the node null-owned and
        // therefore readable by every tenant.
        expect(subscriptionNode.properties.harnessTargetMetadata.url).toBe('http://127.0.0.1:1/wake');
        expect(subscriptionNode.properties.harnessTargetMetadata.signingKey).toBe('test-signing-key');
        expect(subscriptionNode.properties.userId).toBe('@neo-opus-grace');
    });

    test('delivery attempts against a permanently dead route are bounded across repeated messages', async () => {
        const subscriptionNode = makeSubscriptionNode();
        GraphService.db        = makeFakeDb(subscriptionNode);

        // Counted over N sends rather than read off the threshold constant: the constant was always 3, and
        // the defect was that crossing it changed nothing, so every later message paid the full cycle again.
        for (let i = 0; i < 6; i++) {
            await WebhookDeliveryService.deliver(subscriptionNode, {eventId: `01HXXX-${i}`});
        }

        // A 4xx degrades immediately without retrying, so a bounded route costs exactly ONE attempt: the
        // first. Pre-fix this is 6 — one per message, forever, and 4 apiece once the endpoint refuses the
        // connection rather than answering 4xx.
        expect(fetchCalls.length).toBe(1);
        expect(subscriptionNode.properties.status).toBe('degraded');
    });

    test('a degraded route is skipped without an attempt, and clearDegraded is the way back', async () => {
        const subscriptionNode = makeSubscriptionNode();

        subscriptionNode.properties.status = 'degraded';
        GraphService.db                    = makeFakeDb(subscriptionNode);

        expect(await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX'})).toBe('skipped');
        expect(fetchCalls.length).toBe(0);

        // Terminal by design, with a NAMED resumption path — the property that makes the bound safe to hold.
        subscriptionNode.properties.status = 'active';
        WebhookDeliveryService.clearDegraded(subscriptionNode.id);

        global.fetch = async (url, options) => {
            fetchCalls.push({url, options});
            return {ok: true, status: 200};
        };

        expect(await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HYYY'})).toBe('delivered');
        expect(fetchCalls.length).toBe(1);
    });
});

test.describe('GraphService.getUnscopedNodeRecord — the one sanctioned context-free read (#16246)', () => {
    let GraphService, originalDb;

    test.beforeAll(async () => {
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
    });

    test.beforeEach(() => {
        originalDb      = GraphService.db;
        requester.value = null;
    });

    test.afterEach(() => {
        GraphService.db = originalDb;
        requester.value = null;
    });

    test('returns an owner-stamped node that the RLS-scoped reads cannot see', () => {
        const subscriptionNode = makeSubscriptionNode();
        GraphService.db        = makeFakeDb(subscriptionNode);

        expect(GraphService.getNodeRecord({id: subscriptionNode.id})).toBe(null);

        const record = GraphService.getUnscopedNodeRecord({
            id    : subscriptionNode.id,
            writer: 'spec'
        });

        expect(record.id).toBe(subscriptionNode.id);
        expect(record.type).toBe('WAKE_SUBSCRIPTION');
        expect(record.properties.userId).toBe('@neo-opus-grace');
    });

    test('returns null for a node that genuinely does not exist', () => {
        GraphService.db = makeFakeDb(makeSubscriptionNode());

        expect(GraphService.getUnscopedNodeRecord({id: 'WAKE_SUB:absent', writer: 'spec'})).toBe(null);
    });

    test('refuses a call that does not name its background writer', () => {
        GraphService.db = makeFakeDb(makeSubscriptionNode());

        // The `writer` name is what keeps this accessor greppable and auditable rather than an anonymous
        // hole. Making it required means a copy-paste into a new call site cannot stay unattributed.
        expect(() => GraphService.getUnscopedNodeRecord({id: 'WAKE_SUB:dead-route'}))
            .toThrow(/requires a `writer` name/);
    });
});
