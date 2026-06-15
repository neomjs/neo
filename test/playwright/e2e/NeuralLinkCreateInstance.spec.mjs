import { test, expect }               from '../fixtures.mjs';
import { NeuralLink_InstanceService } from '../../../ai/services.mjs';

/**
 * @summary Live Neural Link proof for the `create_instance` MCP tool.
 *
 * Drives the agent-facing service wrapper through the Bridge, proving the new general creation primitive can
 * create a standalone Store and a parent-attached component, while retaining the data-only boundary and undo
 * semantics. DOM checks are secondary; `inspect_store`, `get_record`, and `get_component_tree` are the
 * App-Worker truth surfaces.
 */
test.describe('Neural Link - create_instance (e2e)', () => {
    test.setTimeout(90000);

    test('creates standalone Store and parent-attached component through the live NL tool', async ({ page, neuralLink }) => {
        await page.goto('/examples/button/base/index.html');
        await expect(page.locator('.neo-button').first()).toBeVisible({ timeout: 30000 });

        const app = await neuralLink.connectToApp('Neo.examples.button.base');
        expect(app.sessionId).toBeTruthy();

        await expect(NeuralLink_InstanceService.createInstance({
            sessionId: app.sessionId,
            config   : {module: 'Neo.button.Base'}
        })).rejects.toThrow(/module.*cannot cross/);

        await expect(NeuralLink_InstanceService.createInstance({
            sessionId: app.sessionId,
            className: 'Neo.missing.DoesNotExist'
        })).rejects.toThrow(/does not exist/);

        const
            suffix  = Date.now(),
            storeId = `nl-create-instance-store-${suffix}`,
            rowId   = `row-${suffix}`;

        const storeResult = await app.createInstance({
            className: 'Neo.data.Store',
            config   : {
                id   : storeId,
                data : [
                    {id: rowId, label: 'Alpha'},
                    {id: `${rowId}-2`, label: 'Beta'}
                ],
                model: {
                    fields: [{name: 'id'}, {name: 'label'}]
                }
            }
        });

        expect(storeResult).toEqual({id: storeId, className: 'Neo.data.Store'});

        const inspectedStore = await app.inspectStore(storeId, 10, 0);
        expect(inspectedStore.items.map(item => item.id)).toContain(rowId);

        const record = await app.getRecord(rowId, storeId);
        expect(record.label).toBe('Alpha');

        const storeUndo = await NeuralLink_InstanceService.undo({sessionId: app.sessionId});
        expect(storeUndo.undone).toBe(true);

        await expect(app.inspectStore(storeId)).rejects.toThrow(/Store not found/);

        const pick = res => res?.[0]?.id ?? res?.components?.[0]?.id ?? res?.instances?.[0]?.id ?? res?.id ?? null;

        let containerId = pick(await app.findInstances({ ntype: 'viewport' }, ['id']));

        if (!containerId) {
            containerId = pick(await app.findInstances({ ntype: 'container' }, ['id']));
        }

        expect(containerId, 'could not resolve a target container id for the create').toBeTruthy();

        const buttonId = `nl-create-instance-button-${suffix}`;

        const buttonResult = await app.createInstance({
            ntype   : 'button',
            parentId: containerId,
            config  : {id: buttonId, text: 'NL create_instance'}
        });

        expect(buttonResult).toEqual({
            id       : buttonId,
            className: 'Neo.button.Base',
            parentId : containerId
        });

        await expect.poll(async () => JSON.stringify(await app.getComponentTree()).includes(buttonId), {
            message: 'the created button should appear in get_component_tree',
            timeout: 15000
        }).toBe(true);

        await expect(page.locator(`#${buttonId}`)).toBeVisible({ timeout: 10000 });

        const buttonUndo = await NeuralLink_InstanceService.undo({sessionId: app.sessionId});
        expect(buttonUndo.undone).toBe(true);

        await expect.poll(async () => JSON.stringify(await app.getComponentTree()).includes(buttonId), {
            message: 'the created button should disappear from get_component_tree after undo',
            timeout: 15000
        }).toBe(false);

        await expect(page.locator(`#${buttonId}`)).toHaveCount(0);
    });
});
