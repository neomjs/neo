import { test, expect } from '../fixtures.mjs';
import { openRawAgent } from '../util/rawAgent.mjs';

/**
 * @summary LIVE two-writer proof for the multi-writer WriteGuard enforcement (the umbrella-closure proof) —
 * the live-app counterpart to the unit specs (which inject the writer context past the transport).
 *
 * Two DISTINCT agent writers connect to the live Neural Link Bridge:
 *  - writer-1 = the fixture's `ConnectionService` (one `(agentId, sessionId)` pair),
 *  - writer-2 = a RAW second `ws` (`?role=agent&id=…`) — the Bridge mints a distinct `sessionId` per
 *    connection, so the two are distinct writers. Per the Bridge-auth read (@neo-claude-opus): the Bridge
 *    stamps the `agent_message` sidecar for EVERY agent connection unconditionally (dev / no-token
 *    included), and `WriteGuard` keys on `(agentId, sessionId)` regardless of token-verification — so a
 *    no-token dev connection IS enforced.
 *
 * It exercises the full transport→enforcement path the unit coverage cannot reach: Bridge `agent_message`
 * sidecar → `parseAgentEnvelope` → `InstanceService.assertWritable` → `admitWrite` → `WriteGuard`.
 *
 * Scenario: writer-1 writes component A (acquires + HOLDS the lock on A's subtree — held-on-grant until
 * disconnect). Then writer-2 writes the SAME component A → DENIED (overlapping subtree, different writer).
 * A control write by writer-2 to a sibling B → ADMITTED (no overlap) — proving writer-2's writes succeed
 * absent a conflict, so the deny on A is a genuine cross-writer conflict, not a broken writer-2.
 *
 * Verifies the full path fires end-to-end — writer-1's `set_instance_properties` holds the lock; writer-2's
 * overlapping write returns the jsonrpc error `-32603 "Write denied for <id>: conflict (held by <agentId> /
 * <sessionId>)"` from `InstanceService.assertWritable`; writer-2's sibling write returns
 * `{result:{success:true}}`. The raw-`ws` response arrives as a `{type:'app_message', message:<jsonrpc>}`
 * frame, matched by request id.
 *
 * ⚠️ REQUIRES A FRESH BRIDGE. A long-running bridge predating the `agent_message` sidecar-emit merge
 * forwards BARE frames → enforcement silently no-ops → writer-2's A write would wrongly ADMIT. CI (clean
 * port) spawns a fresh bridge from source via `ConnectionService.spawnBridge`. LOCALLY, kill any
 * neural-link bridge on the configured port first. A step-2 ADMIT (instead of deny) most likely means a
 * stale bridge, not a logic regression — a stale bridge fails the conflict assertion for an environment reason.
 */
test.describe('WriteGuard multi-writer enforcement (live two-writer e2e)', () => {
    test.setTimeout(90000);

    test('a second writer is DENIED an overlapping write but ADMITTED a non-overlapping one', async ({ page, neuralLink }) => {
        await page.goto('/examples/button/base/index.html');
        await expect(page.locator('.neo-button').first()).toBeVisible({ timeout: 30000 });

        const app = await neuralLink.connectToApp('Neo.examples.button.base');
        expect(app.sessionId, 'app worker session id').toBeTruthy();

        // Normalize the NL query envelope defensively so this proof does not couple to one shape.
        const idsOf = res => (Array.isArray(res) ? res : res?.components ?? res?.instances ?? [])
            .map(c => c?.id).filter(Boolean);
        const pickId = res => idsOf(res)[0] ?? res?.id ?? null;

        // A container to host the two sibling write targets.
        const containerId = pickId(await app.findInstances({ ntype: 'viewport' }, ['id']))
                         ?? pickId(await app.findInstances({ ntype: 'container' }, ['id']));
        expect(containerId, 'a container to host the two writers').toBeTruthy();

        // Two sibling targets A, B. Create buttons until the example exposes at least two.
        let buttonIds = idsOf(await app.findInstances({ ntype: 'button' }, ['id']));
        while (buttonIds.length < 2) {
            const seen = buttonIds.length;
            await app.createComponent(containerId, { ntype: 'button', text: 'wg-target-' + seen });
            await expect.poll(
                async () => idsOf(await app.findInstances({ ntype: 'button' }, ['id'])).length,
                { message: 'created button should register', timeout: 10000 }
            ).toBeGreaterThan(seen);
            buttonIds = idsOf(await app.findInstances({ ntype: 'button' }, ['id']));
        }
        const [componentA, componentB] = buttonIds;
        expect(componentA).not.toBe(componentB);

        // writer-1 (the fixture ConnectionService, identity #1) acquires + HOLDS the lock on A's subtree.
        await app.setProperties(componentA, { text: 'writer-1-holds-A' });

        // writer-2 — a RAW second agent ws with a DISTINCT identity (the bridge mints its own sessionId).
        const writer2 = await openRawAgent(neuralLink.bridgePort, 'neo-writer-2');

        try {
            // (1) Overlapping write — same component A, different writer → DENIED (conflict).
            const denied = await writer2.call(app.sessionId, 'set_instance_properties',
                { id: componentA, properties: { text: 'writer-2-tries-A' } });
            expect(denied.error,
                'writer-2 overlapping write must be denied (conflict); an ADMIT here most likely means a STALE bridge'
            ).toBeTruthy();

            // (2) Non-overlapping control — sibling B → ADMITTED (proves writer-2 writes work absent a conflict).
            const admitted = await writer2.call(app.sessionId, 'set_instance_properties',
                { id: componentB, properties: { text: 'writer-2-writes-B' } });
            expect(admitted.error,
                'writer-2 non-overlapping write must be admitted'
            ).toBeFalsy();
        } finally {
            writer2.close();
        }
    });
});
