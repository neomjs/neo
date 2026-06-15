import { test, expect } from '../fixtures.mjs';
import { openRawAgent } from '../util/rawAgent.mjs';

/**
 * @summary Live e2e proof that a writer's disconnect RELEASES its held WriteGuard lock, re-admitting an
 * overlapping second writer — the release half of the lock lifecycle, symmetric to the deny-while-held
 * proof in `WriteGuardMultiWriterNL.spec.mjs`. The shipped implementation sweeps a disconnected writer's
 * held locks; the unit coverage lives in InstanceService/TransactionService. This exercises the full live path
 * the unit coverage cannot reach: Bridge `agent_disconnected` (app-side, `sessionId`-stamped) →
 * `Client.handleAgentDisconnected` → `WriteGuard.releaseAgent` → the subtree is writable again.
 *
 * Scenario: writer-1 (a raw agent `ws`) acquires + holds a button's subtree lock; a distinct writer-2 (a
 * raw agent `ws`, with its own Bridge-minted `sessionId`) writes the SAME subtree → DENIED (conflict).
 * writer-1 then disconnects → its lock is swept → writer-2's retry is ADMITTED.
 *
 * ⚠️ Harness ordering matters: writer-1 must be fully established and HOLDING the lock before writer-2
 * opens. Opening both sockets back-to-back races writer-1's lock acquisition against writer-2's first
 * write and yields a non-deterministic deny/admit; establishing the holder first is deterministic.
 *
 * ⚠️ Requires a FRESH bridge (one predating the `agent_message` sidecar-emit merge forwards bare frames →
 * no enforcement). neo CI does not run the playwright e2e suite, so this is a manual/local L3 proof.
 */
test.describe('WriteGuard disconnect-release (live e2e)', () => {
    test.setTimeout(90000);

    test('a disconnected writer\'s lock is released, re-admitting an overlapping second writer', async ({ page, neuralLink }) => {
        await page.goto('/examples/button/base/index.html');
        await expect(page.locator('.neo-button').first()).toBeVisible({ timeout: 30000 });

        const app = await neuralLink.connectToApp('Neo.examples.button.base');
        expect(app.sessionId, 'app worker session id').toBeTruthy();

        const idsOf = res => (Array.isArray(res) ? res : res?.components ?? res?.instances ?? [])
            .map(c => c?.id).filter(Boolean);
        const componentA = idsOf(await app.findInstances({ ntype: 'button' }, ['id']))[0];
        expect(componentA, 'a button subtree to contend for').toBeTruthy();

        // writer-1 is established + HOLDING before writer-2 exists — the deterministic ordering (a back-to-back
        // open races the lock acquisition). The Bridge mints writer-1 a distinct sessionId for the connection.
        let writer1, writer2;
        try {
            writer1 = await openRawAgent(neuralLink.bridgePort, 'wg-disc-writer-1');
            const acquired = await writer1.call(app.sessionId, 'set_instance_properties',
                { id: componentA, properties: { text: 'writer-1-holds-A' } });
            expect(acquired.error, 'writer-1 acquires + holds the lock on A').toBeFalsy();

            // writer-2 — a distinct raw agent — only now connects and writes the SAME subtree.
            writer2 = await openRawAgent(neuralLink.bridgePort, 'wg-disc-writer-2');

            // (1) Overlapping write while writer-1 holds the lock → DENIED (conflict).
            const denied = await writer2.call(app.sessionId, 'set_instance_properties',
                { id: componentA, properties: { text: 'writer-2-blocked' } });
            expect(denied.error, 'writer-2 is denied while writer-1 holds the lock').toBeTruthy();

            // writer-1 disconnects → Bridge agent_disconnected (sessionId-stamped to the app) → releaseAgent.
            writer1.close();

            // (2) Once the lock is swept, writer-2's retry of the same subtree is ADMITTED. The polled value
            // carries the deny reason, so an admit-poll timeout names WHY it stayed denied in the diff.
            await expect.poll(async () => {
                const res = await writer2.call(app.sessionId, 'set_instance_properties',
                    { id: componentA, properties: { text: 'writer-2-after-release' } });
                return res.error ? `denied: ${res.error.message ?? JSON.stringify(res.error)}` : 'admitted';
            }, {
                message: 'writer-2 must be admitted once writer-1 disconnects and its lock is released',
                timeout: 15000
            }).toBe('admitted');
        } finally {
            // Guard BOTH raw-ws writers: writer-1's close() above is the release trigger, but if an assertion
            // throws before it, this prevents a leaked socket — a double close() is a safe no-op.
            writer1?.close();
            writer2?.close();
        }
    });
});
