import { test, expect }               from '../fixtures.mjs';
import { NeuralLink_InstanceService } from '../../../ai/services.mjs';

/**
 * @summary Live Neural Link proof for the `redo` MCP tool — the e2e counterpart to the unit specs
 * (which mock the transport).
 *
 * Drives the full undo↔redo cycle over the live bridge: `create_instance` a component → `undo` (gone
 * from the App-Worker component tree + the live DOM) → `redo` → assert the component is **restored** to
 * both the tree and the DOM. Restoration is asserted by a unique text label rather than the original id,
 * because a create re-apply is documented to mint a fresh id (single-level Slice-2 boundary). Sibling:
 * NeuralLinkCreateInstance.spec (the create/undo proof this extends with the redo leg).
 */
test.describe('Neural Link - redo (e2e)', () => {
    test.setTimeout(90000);

    test('restores an undone agent-created component: create -> undo -> redo -> back in the live tree + DOM', async ({ page, neuralLink }) => {
        await page.goto('/examples/button/base/index.html');
        await expect(page.locator('.neo-button').first()).toBeVisible({ timeout: 30000 });

        const app = await neuralLink.connectToApp('Neo.examples.button.base');
        expect(app.sessionId).toBeTruthy();

        // ⚠️ Fresh-bridge diagnostic guard: an `{undone:false}` / `{redone:false, reason:'no-writer-identity'}`
        // below means a STALE `:8081` bridge — one predating the `agent_message` sidecar-emit that threads the
        // writer `{agentId, sessionId}` into the App Worker — NOT a logic regression. Restart `run-bridge.mjs`
        // and rerun. (The undo/redo capture + replay key on that writer identity; the assertion messages below
        // surface the raw `{reason}`, so a stale bridge is diagnosable at a glance. Mirrors the undo-e2e story.)

        const pick = res => res?.[0]?.id ?? res?.components?.[0]?.id ?? res?.instances?.[0]?.id ?? res?.id ?? null;

        let containerId = pick(await app.findInstances({ ntype: 'viewport' }, ['id']));

        if (!containerId) {
            containerId = pick(await app.findInstances({ ntype: 'container' }, ['id']));
        }

        expect(containerId, 'could not resolve a target container id for the create').toBeTruthy();

        const
            suffix   = Date.now(),
            buttonId = `nl-redo-button-${suffix}`,
            label    = `NL-redo-${suffix}`;

        // create_instance → present in the tree + DOM
        const createResult = await app.createInstance({
            ntype   : 'button',
            parentId: containerId,
            config  : {id: buttonId, text: label}
        });

        expect(createResult).toEqual({id: buttonId, className: 'Neo.button.Base', parentId: containerId});

        await expect.poll(async () => JSON.stringify(await app.getComponentTree()).includes(label), {
            message: 'the created button should appear before undo', timeout: 15000
        }).toBe(true);
        await expect(page.locator(`.neo-button:has-text("${label}")`)).toBeVisible({ timeout: 10000 });

        // undo → gone from the tree + DOM
        const undoResult = await NeuralLink_InstanceService.undo({sessionId: app.sessionId});
        expect(undoResult.undone, `undo returned: ${JSON.stringify(undoResult)}`).toBe(true);

        await expect.poll(async () => JSON.stringify(await app.getComponentTree()).includes(label), {
            message: 'the button should be gone from the tree after undo', timeout: 15000
        }).toBe(false);
        await expect(page.locator(`.neo-button:has-text("${label}")`)).toHaveCount(0);

        // redo → restored to the tree + DOM (asserted by the unique label; a create re-apply may mint a fresh id)
        const redoResult = await NeuralLink_InstanceService.redo({sessionId: app.sessionId});
        expect(redoResult.redone, `redo returned: ${JSON.stringify(redoResult)}`).toBe(true);

        await expect.poll(async () => JSON.stringify(await app.getComponentTree()).includes(label), {
            message: 'the button should be restored to the tree after redo', timeout: 15000
        }).toBe(true);
        await expect(page.locator(`.neo-button:has-text("${label}")`)).toBeVisible({ timeout: 10000 });
    });
});
