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
            agentIdentity        : '@neo-opus-grace',
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

    test('the degrade lands regardless of whether a requester is bound — the race is removed, not half-pinned', async () => {
        // @neo-opus-ada observed the pre-fix path succeeding at 10:19 and failing at 00:07 on the SAME
        // subscription, and named the likely trigger: an MCP write shortly before a flush can leave an
        // identity bound that the flush inherits, so the RLS-scoped read sometimes succeeds. Her warning
        // is the right one — a spec that only ever observes the failing branch would pass against an
        // unfixed race, pinning the unlucky half rather than the defect.
        //
        // The fix is not a better-behaved race: the degrade read no longer consults RLS at all, so the
        // outcome is identical across every identity state. Asserting that directly is cheaper than
        // arguing it, and it fails if anyone reintroduces an RLS-scoped read on this path.
        for (const boundRequester of [null, '@neo-opus-grace', '@a-different-tenant']) {
            const subscriptionNode = makeSubscriptionNode();

            GraphService.db = makeFakeDb(subscriptionNode);
            requester.value = boundRequester;

            WebhookDeliveryService.consecutiveFailures.clear();
            WebhookDeliveryService.degradedSubscriptions.clear();

            await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX'});

            expect(subscriptionNode.properties.status, `bound requester: ${String(boundRequester)}`).toBe('degraded');
            expect(subscriptionNode.properties.harnessTarget, `bound requester: ${String(boundRequester)}`).toBe('a2a-webhook');
        }
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

test.describe('WakeSubscriptionService.resume — the operator-reachable way back (#16253)', () => {
    let GraphService, WakeSubscriptionService, WebhookDeliveryService, RequestContextService;
    let originalDb, originalGetAgentIdentityNodeId, originalFetch;
    let fetchCalls = [];

    test.beforeAll(async () => {
        GraphService           = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        WakeSubscriptionService = (await import('../../../../../../ai/services/memory-core/WakeSubscriptionService.mjs')).default;
        WebhookDeliveryService = (await import('../../../../../../ai/services/memory-core/WebhookDeliveryService.mjs')).default;
        RequestContextService  = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;
        originalFetch          = global.fetch;
        originalGetAgentIdentityNodeId = RequestContextService.getAgentIdentityNodeId;
    });

    test.beforeEach(() => {
        originalDb      = GraphService.db;
        requester.value = null;
        fetchCalls      = [];

        // `resume` is an operator action, so it resolves its caller from the REQUEST context — unlike the
        // background flush, which has none. That asymmetry is the point: degrading happens without a
        // requester, restoring requires one.
        RequestContextService.getAgentIdentityNodeId = () => '@neo-opus-grace';

        WebhookDeliveryService.configure({attemptTimeoutSeconds: 1});
        WebhookDeliveryService.consecutiveFailures.clear();
        WebhookDeliveryService.degradedSubscriptions.clear();
        WakeSubscriptionService.subscriptionCache.clear();

        global.fetch = async (url, options) => {
            fetchCalls.push({url, options});
            return {ok: false, status: 400};
        };
    });

    test.afterEach(() => {
        GraphService.db = originalDb;
        requester.value = null;
        global.fetch    = originalFetch;
        RequestContextService.getAgentIdentityNodeId = originalGetAgentIdentityNodeId;
        WakeSubscriptionService.subscriptionCache.clear();
    });

    test('degrade then resume restores delivery end-to-end', async () => {
        const subscriptionNode = makeSubscriptionNode();
        GraphService.db        = makeFakeDb(subscriptionNode);

        // Degrade it for real, through the delivery path.
        await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX'});
        expect(subscriptionNode.properties.status).toBe('degraded');
        expect(WebhookDeliveryService.degradedSubscriptions.has(subscriptionNode.id)).toBe(true);

        const result = await WakeSubscriptionService.resume({subscriptionId: subscriptionNode.id});

        expect(result).toEqual({subscriptionId: subscriptionNode.id, status: 'active', wasDegraded: true});

        // BOTH truths clear — the durable one and the in-flight one.
        expect(subscriptionNode.properties.status).toBe('active');
        expect(WebhookDeliveryService.degradedSubscriptions.has(subscriptionNode.id)).toBe(false);

        // And the route actually delivers again, which is the only claim that matters.
        fetchCalls   = [];
        global.fetch = async (url, options) => {
            fetchCalls.push({url, options});
            return {ok: true, status: 200};
        };

        expect(await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HYYY'})).toBe('delivered');
        expect(fetchCalls.length).toBe(1);
    });

    test('clearDegraded ALONE does not resume — the two-phase contract is mandatory, not tribal', async () => {
        const subscriptionNode = makeSubscriptionNode();
        GraphService.db        = makeFakeDb(subscriptionNode);

        await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX'});
        expect(subscriptionNode.properties.status).toBe('degraded');

        // The footgun, pinned: clearing only the in-memory half looks like a restore and is not one.
        WebhookDeliveryService.clearDegraded(subscriptionNode.id);

        fetchCalls = [];
        expect(await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HYYY'})).toBe('skipped');
        expect(fetchCalls.length).toBe(0);
        expect(subscriptionNode.properties.status).toBe('degraded');
    });

    test('resume reports wasDegraded false for a route that was never degraded', async () => {
        const subscriptionNode = makeSubscriptionNode();
        GraphService.db        = makeFakeDb(subscriptionNode);

        const result = await WakeSubscriptionService.resume({subscriptionId: subscriptionNode.id});

        expect(result.wasDegraded).toBe(false);
        expect(subscriptionNode.properties.status).toBe('active');
    });

    test('resume refuses a subscription owned by someone else', async () => {
        const subscriptionNode = makeSubscriptionNode();
        GraphService.db        = makeFakeDb(subscriptionNode);

        RequestContextService.getAgentIdentityNodeId = () => '@neo-opus-ada';

        // Restoring is an owner-scoped act. Without this, one seat could re-activate another seat's route.
        await expect(WakeSubscriptionService.resume({subscriptionId: subscriptionNode.id}))
            .rejects.toThrow(/Permission denied/);

        expect(subscriptionNode.properties.status).toBe('active');
    });

    test('resume is reachable through the manage() tool dispatch', async () => {
        const subscriptionNode = makeSubscriptionNode();
        GraphService.db        = makeFakeDb(subscriptionNode);

        await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX'});
        expect(subscriptionNode.properties.status).toBe('degraded');

        // The operator surface, not just the method — an action nothing can dispatch is not a path.
        const result = await WakeSubscriptionService.manage({
            action        : 'resume',
            subscriptionId: subscriptionNode.id
        });

        expect(result.status).toBe('active');
        expect(result.wasDegraded).toBe(true);
        expect(subscriptionNode.properties.status).toBe('active');
    });
});

/**
 * Builds a fake `fetch` response. Only the 404 branch reads a body, so `json` is present exactly where the
 * real receiver would send one — a fake that always parses would hide the fail-closed path.
 * @param {Number} status
 * @param {*} [body] Omit for no body; a string to force a parse failure.
 * @returns {Object}
 */
function makeResponse(status, body) {
    const response = {ok: status >= 200 && status < 300, status};

    if (body !== undefined) {
        response.json = async () => {
            if (typeof body === 'string') throw new SyntaxError(`Unexpected token in JSON: ${body}`);
            return body;
        };
    }

    return response;
}

test.describe('WebhookDeliveryService — a reload-lag 404 must not be terminal (#16366)', () => {
    let GraphService, WebhookDeliveryService, originalDb, originalFetch;
    let fetchCalls = [];
    let nextResponse;

    test.beforeAll(async () => {
        GraphService           = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        WebhookDeliveryService = (await import('../../../../../../ai/services/memory-core/WebhookDeliveryService.mjs')).default;
        originalFetch          = global.fetch;
    });

    test.beforeEach(() => {
        originalDb      = GraphService.db;
        requester.value = null;
        fetchCalls      = [];
        nextResponse    = () => makeResponse(404, {error: 'unknown-subscription'});

        WebhookDeliveryService.configure({attemptTimeoutSeconds: 1});
        WebhookDeliveryService.consecutiveFailures.clear();
        WebhookDeliveryService.degradedSubscriptions?.clear();

        global.fetch = async (url, options) => {
            fetchCalls.push({url, options});
            return nextResponse();
        };
    });

    test.afterEach(() => {
        GraphService.db = originalDb;
        requester.value = null;
        global.fetch    = originalFetch;
    });

    test('does NOT degrade on first sight — the publish→reload window survives it', async () => {
        const subscriptionNode = makeSubscriptionNode();
        GraphService.db        = makeFakeDb(subscriptionNode);

        const outcome = await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX'});

        // The assertion that fails on the pre-fix tree: every 4xx degraded immediately, so a receiver that
        // had merely not reloaded yet killed the route it was being armed with. @neo-opus-vega measured this
        // end-to-end — 19 minutes of gap, then a route that restarting the receiver did not revive.
        expect(subscriptionNode.properties.status).toBe('active');
        expect(WebhookDeliveryService.degradedSubscriptions.has(subscriptionNode.id)).toBe(false);
        expect(outcome).toBe('failed');
    });

    test('still degrades once the threshold is met — a withdrawn route stays terminal and bounded', async () => {
        const subscriptionNode = makeSubscriptionNode();
        GraphService.db        = makeFakeDb(subscriptionNode);

        // The other half of the contract, and the reason this is a threshold rather than an exemption:
        // `404 unknown-subscription` is ALSO the correct answer for a route deliberately withdrawn
        // (`buildReceiverManifest.mjs`). Tolerating it forever would leave a withdrawn route retrying with no
        // end, which is the unbounded-attempt failure the degrade exists to stop.
        for (let i = 0; i < 2; i++) {
            await WebhookDeliveryService.deliver(subscriptionNode, {eventId: `01HXXX-${i}`});
            expect(subscriptionNode.properties.status, `after ${i + 1} message(s)`).toBe('active');
        }

        await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX-2'});
        expect(subscriptionNode.properties.status).toBe('degraded');

        // Bounded: once degraded the route is skipped without an attempt, so the cost of a withdrawn route
        // is the threshold's attempts ONCE, not a cycle per message forever.
        const attemptsAtDegrade = fetchCalls.length;

        await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX-3'});
        expect(fetchCalls.length).toBe(attemptsAtDegrade);
    });

    test('a delivery that lands resets the counter, so a route that outlives the window is never degraded', async () => {
        const subscriptionNode = makeSubscriptionNode();
        GraphService.db        = makeFakeDb(subscriptionNode);

        // The actual shape of a publish→reload gap: some dispatches miss, then the manifest arrives and the
        // rest land. Without the reset, a long enough gap would still accumulate to the threshold and kill a
        // route that had already recovered.
        await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX-0'});
        await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX-1'});

        nextResponse = () => makeResponse(200);
        expect(await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX-2'})).toBe('delivered');

        nextResponse = () => makeResponse(404, {error: 'unknown-subscription'});
        await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX-3'});
        await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX-4'});

        expect(subscriptionNode.properties.status).toBe('active');
    });

    test('every other client error still degrades immediately — the boundary, not just the new branch', async () => {
        // A 404 at a wrong path or method is `not-found`, and a wrong URL is a persistent configuration
        // error, not a timing gap. Asserting the boundary is what stops the new tolerance from widening
        // into "4xx is advisory".
        const cases = [
            {label: '400 malformed',          response: () => makeResponse(400)},
            {label: '401 invalid-signature',  response: () => makeResponse(401, {error: 'invalid-signature'})},
            {label: '403 forbidden',          response: () => makeResponse(403, {error: 'forbidden'})},
            {label: '404 not-found (path)',   response: () => makeResponse(404, {error: 'not-found'})}
        ];

        for (const {label, response} of cases) {
            const subscriptionNode = makeSubscriptionNode();

            GraphService.db = makeFakeDb(subscriptionNode);
            nextResponse    = response;

            WebhookDeliveryService.consecutiveFailures.clear();
            WebhookDeliveryService.degradedSubscriptions.clear();

            expect(await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX'}), label).toBe('skipped');
            expect(subscriptionNode.properties.status, label).toBe('degraded');
        }
    });

    test('an unreadable 404 body degrades — the tolerance is earned by a signal, never granted by a parse failure', async () => {
        // Fail-closed. If a malformed body could reach the tolerant branch, any broken receiver would make
        // every dead route look retryable, and the attempt bound on a dead endpoint would be gone by accident.
        const cases = [
            {label: 'no body at all',        response: () => makeResponse(404)},
            {label: 'non-JSON body',         response: () => makeResponse(404, '<html>502</html>')},
            {label: 'unrecognised error',    response: () => makeResponse(404, {error: 'something-else'})},
            {label: 'JSON without an error', response: () => makeResponse(404, {message: 'nope'})}
        ];

        for (const {label, response} of cases) {
            const subscriptionNode = makeSubscriptionNode();

            GraphService.db = makeFakeDb(subscriptionNode);
            nextResponse    = response;

            WebhookDeliveryService.consecutiveFailures.clear();
            WebhookDeliveryService.degradedSubscriptions.clear();

            expect(await WebhookDeliveryService.deliver(subscriptionNode, {eventId: '01HXXX'}), label).toBe('skipped');
            expect(subscriptionNode.properties.status, label).toBe('degraded');
        }
    });
});

test.describe('The sender\'s discriminator agrees with what the receiver actually answers (#16366)', () => {
    let WebhookDeliveryService, createWakeReceiver, WakeReceiverState;
    let server, state, stateDir;

    test.beforeAll(async () => {
        WebhookDeliveryService = (await import('../../../../../../ai/services/memory-core/WebhookDeliveryService.mjs')).default;
        createWakeReceiver     = (await import('../../../../../../ai/daemons/wake/receiver.mjs')).createWakeReceiver;
        WakeReceiverState      = (await import('../../../../../../ai/daemons/wake/receiverState.mjs')).WakeReceiverState;
    });

    test.beforeEach(async () => {
        const fs   = await import('node:fs/promises'),
              os   = await import('node:os'),
              path = await import('node:path');

        stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-wake-16366-'));
        state    = new WakeReceiverState({stateDir});

        await state.init();

        const receiver = createWakeReceiver({
            manifest: {
                schemaVersion: 1,
                routes       : {
                    'WAKE_SUB:known': {
                        signingKey           : 'a'.repeat(64),
                        agentIdentity        : '@neo-opus-grace',
                        harnessTargetMetadata: {adapter: 'tmux', tmuxSession: 'test'},
                        adapterConfig        : {attemptTimeoutMs: 100}
                    }
                }
            },
            state,
            dispatch: async () => 'delivered',
            logger  : {error() {}, warn() {}, log() {}}
        });

        server = receiver.server;

        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
    });

    test.afterEach(async () => {
        const fs = await import('node:fs/promises');

        await new Promise(resolve => server.close(resolve));
        await fs.rm(stateDir, {recursive: true, force: true});
    });

    test('a route the receiver has not loaded is recognised as reload lag', async () => {
        // The wire contract is a bare string on one side and a literal on the other, so agreement is the
        // thing that can silently rot. Driving the REAL receiver is what makes this a contract test rather
        // than a restatement of the constant: rename the receiver's error code and this fails.
        const response = await fetch(`http://127.0.0.1:${server.address().port}/wake`, {
            method : 'POST',
            headers: {
                'Content-Type'              : 'application/json',
                'X-Neo-Wake-Subscription-Id': 'WAKE_SUB:not-in-this-manifest',
                'X-Neo-Wake-Event-Id'       : 'wake-digest:event-1',
                'X-Neo-Wake-Schema-Version' : '1.0'
            },
            body: JSON.stringify({schemaVersion: '1.0'})
        });

        expect(response.status).toBe(404);
        expect(await WebhookDeliveryService._isUnknownSubscriptionResponse(response)).toBe(true);
    });

    test('a wrong path answers a 404 the sender must still treat as terminal', async () => {
        // Both are 404s from the same server. If the sender keyed on the status code alone it could not tell
        // a stale manifest from a misconfigured URL, and would grant tolerance to a permanent error.
        const response = await fetch(`http://127.0.0.1:${server.address().port}/not-the-wake-path`, {
            method: 'POST',
            body  : '{}'
        });

        expect(response.status).toBe(404);
        expect(await WebhookDeliveryService._isUnknownSubscriptionResponse(response)).toBe(false);
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
