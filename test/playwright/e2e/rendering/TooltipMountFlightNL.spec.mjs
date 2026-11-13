import {expect, test as base} from '../../fixtures.mjs';

/**
 * @summary Holds actual tooltip insert messages at Main, before the renderer and its ordinary App reply.
 * No vnode, mounted flag, DOM node or renderer result is substituted. Unrelated messages keep flowing.
 * @param {Object} page
 * @param {String} tooltipId
 * @returns {Promise<void>}
 */
async function observeMount(page, tooltipId) {
    await page.evaluate(id => {
        const manager  = Neo.worker.Manager,
              original = manager.handleDomUpdate,
              witness  = window.tooltipMountWitness = {
                  holding: true, pending: [], received: [], applied: [], maxNodes: 0, duplicateIds: []
              },
              targets  = delta => (delta.id || delta.vnode?.id) === id;

        manager.handleDomUpdate = function(...args) {
            const deltas = args[1] || [],
                  own    = deltas.filter(targets);

            witness.received.push(...own.map(delta => delta.action || 'updateNode'));

            if (witness.holding && own.some(delta => delta.action === 'insertNode')) {
                witness.pending.push({receiver: this, args});
                return
            }

            return original.apply(this, args)
        };

        const listener = Neo.main.DeltaUpdates.on('updated', data => {
            witness.applied.push(...[data.deltas].flat().filter(targets).map(delta => delta.action || 'updateNode'));

            const roots = [...document.querySelectorAll(`[id="${id}"]`)],
                  ids   = roots.flatMap(root => [root.id, ...[...root.querySelectorAll('[id]')].map(node => node.id)]);

            witness.maxNodes = Math.max(witness.maxNodes, roots.length);
            witness.duplicateIds.push(...ids.filter((value, index) => ids.indexOf(value) !== index))
        });

        witness.release = () => {
            witness.holding = false;
            witness.pending.splice(0).forEach(({receiver, args}) => original.apply(receiver, args))
        };
        witness.restore = () => {
            witness.release();
            manager.handleDomUpdate = original;
            Neo.main.DeltaUpdates.un('updated', listener)
        }
    }, tooltipId);

    const worker = page.workers().find(candidate => candidate.url().includes('/worker/App.mjs'));

    // Theme loading may re-enter initVnode. Count every genuine call only to await all settlements;
    // the native insert stream, rather than this call count, determines how many mounts occurred.
    await worker.evaluate(id => {
        const tooltip  = Neo.getComponent(id),
              original = tooltip.initVnode,
              witness  = tooltip.tooltipMountWitness = {started: 0, settled: 0};

        tooltip.initVnode = function(...args) {
            witness.started++;
            const flight = original.apply(this, args);

            flight.then(() => witness.settled++, () => witness.settled++);
            return flight
        }
    }, tooltipId)
}

/**
 * @summary Reads only the test's native message and DOM observations.
 * @param {Object} page
 * @returns {Promise<Object|null>}
 */
function readWitness(page) {
    return page.evaluate(() => {
        const witness = window.tooltipMountWitness;

        return witness ? {
            pending     : witness.pending.length,
            received    : witness.received,
            applied     : witness.applied,
            maxNodes    : witness.maxNodes,
            duplicateIds: [...new Set(witness.duplicateIds)]
        } : null
    })
}

/**
 * @summary Releases the real insert, then waits for every observed initVnode promise to settle.
 * @param {Object} harness
 * @returns {Promise<void>}
 */
async function landMount({app, page, tooltipId}) {
    await page.evaluate(() => window.tooltipMountWitness.release());
    await expect.poll(async () => {
        const state = await app.getComponent(tooltipId, ['mountFlight', 'tooltipMountWitness']);

        return state.mountFlight === null && state.tooltipMountWitness.started === state.tooltipMountWitness.settled
    }, {message: 'the genuine mount attempts and their presence reconciliation settle'}).toBe(true)
}

/**
 * @summary Requires the latest worker target, label, native rectangle and singleton DOM to agree.
 * @param {Object} harness
 * @param {Object} target
 * @returns {Promise<void>}
 */
async function expectTarget({app, page, tooltipId}, target) {
    await expect.poll(() => app.getComponent(tooltipId, ['text', 'mounted', 'hidden', 'align'])).toMatchObject({
        text   : target.text,
        mounted: true,
        hidden : false,
        align  : {target: target.id, targetMargin: 10}
    });
    await expect(page.locator(`[id="${tooltipId}"]`)).toHaveCount(1);
    await expect(page.locator(`[id="${tooltipId}"]`)).toHaveText(target.text);
    await expect.poll(async () => {
        const tooltip = await page.locator(`[id="${tooltipId}"]`).boundingBox(),
              button  = await page.locator(`[id="${target.id}"]`).boundingBox();

        return tooltip && button ? Math.abs(tooltip.y - button.y - button.height - 10) : Infinity
    }, {message: 'the native tooltip rectangle is below the latest target with its configured margin'}).toBeLessThan(2);

    const consistency = await app.verifyComponentConsistency(tooltipId);
    expect(consistency.consistent, JSON.stringify(consistency)).toBe(true)
}

const test = base.extend({
    tooltipHarness: async ({page, neuralLink, workerErrors}, use, testInfo) => {
        const pageConsoleErrors = [];

        page.on('console', message => {
            message.type() === 'error' && pageConsoleErrors.push(message.text())
        });

        await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
        await page.goto('/test/playwright/component/apps/tooltip-nested-theme/index.html');

        const app = await neuralLink.connectToApp('Test.Playwright.TooltipNestedTheme');
        let tooltips;

        await expect.poll(async () => {
            tooltips = await app.queryComponent({ntype: 'tooltip'}, ['id']);
            return tooltips.length
        }).toBe(1);

        const tooltipId = tooltips[0].id,
              targets   = [];

        for (const text of ['Dark target', 'Light target']) {
            const [button] = await app.queryComponent({ntype: 'button', text}, ['tooltip']);

            targets.push({id: button.id, text: button.properties.tooltip.text});
            await expect(page.locator(`[id="${button.id}"]`)).toBeVisible();
            // Remove presentation delays from the fixture; retain the production 400 ms hover bridge.
            await app.setProperties(button.id, {
                tooltip: {...button.properties.tooltip, showDelay: 0, dismissDelay: null}
            })
        }

        await observeMount(page, tooltipId);

        try {
            await use({app, page, tooltipId, targets})
        } finally {
            try {
                const receipt = {
                    native      : await readWitness(page),
                    worker      : await app.getComponent(tooltipId, ['text', 'align', 'mounted', 'hidden', 'tooltipMountWitness']),
                    workerErrors: workerErrors.lines,
                    pageConsoleErrors,
                    console     : await app.getConsoleLogs('error')
                };

                await testInfo.attach('tooltip-mount-flight', {
                    body: JSON.stringify(receipt, null, 2), contentType: 'application/json'
                });
                expect(pageConsoleErrors, 'no console errors from Main or its workers').toEqual([]);
                expect(receipt.console, 'Neural Link reported no App Worker console errors').toEqual([])
            } finally {
                await page.evaluate(() => window.tooltipMountWitness.restore())
            }
        }
    }
});

test.describe('Tooltip mount flights through App, VDOM and Main', () => {
    test('repeated show while the native insert waits starts one mount', async ({tooltipHarness}) => {
        const {app, page, tooltipId, targets} = tooltipHarness;

        await page.locator(`[id="${targets[0].id}"]`).hover();
        await expect.poll(async () => (await readWitness(page)).pending).toBe(1);
        await app.callMethod(tooltipId, 'show');
        await app.callMethod(tooltipId, 'show');

        await landMount(tooltipHarness);
        await expectTarget(tooltipHarness, targets[0]);
        const witness = await readWitness(page);

        expect(witness).toMatchObject({maxNodes: 1, duplicateIds: []});
        expect(witness.received.filter(action => action === 'insertNode')).toHaveLength(1);
        expect(witness.applied.filter(action => action === 'insertNode')).toHaveLength(1)
    });

    test('hide during the native mount lands hidden and permits a later show', async ({tooltipHarness}) => {
        const {app, page, tooltipId, targets} = tooltipHarness;

        await page.locator(`[id="${targets[0].id}"]`).hover();
        await expect.poll(async () => (await readWitness(page)).pending).toBe(1);
        await app.callMethod(tooltipId, 'hide');
        expect.soft(await app.getComponent(tooltipId, ['hidden', 'mounted'])).toEqual({hidden: true, mounted: false});
        expect((await readWitness(page)).received).not.toContain('removeNode');

        await landMount(tooltipHarness);
        await expect.poll(() => app.getComponent(tooltipId, ['hidden', 'mounted'])).toEqual({hidden: true, mounted: false});
        await expect(page.locator(`[id="${tooltipId}"]`)).toHaveCount(0);

        await app.callMethod(tooltipId, 'show');
        await expectTarget(tooltipHarness, targets[0]);
        expect(await readWitness(page)).toMatchObject({maxNodes: 1, duplicateIds: []})
    });

    test('retargeting during the native mount lands the latest text and alignment once', async ({tooltipHarness}) => {
        const {app, page, tooltipId, targets} = tooltipHarness;

        await page.locator(`[id="${targets[0].id}"]`).hover();
        await expect.poll(async () => (await readWitness(page)).pending).toBe(1);
        await page.locator(`[id="${targets[1].id}"]`).hover();
        await expect.poll(() => app.getComponent(tooltipId, ['text', 'align'])).toMatchObject({
            text: targets[1].text, align: {target: targets[1].id}
        });

        await landMount(tooltipHarness);
        await expectTarget(tooltipHarness, targets[1]);
        const witness = await readWitness(page);

        expect(witness).toMatchObject({maxNodes: 1, duplicateIds: []});
        expect(witness.received.filter(action => action === 'insertNode')).toHaveLength(1);
        expect(witness.applied.filter(action => action === 'insertNode')).toHaveLength(1)
    });

    test('an ordinarily mounted tooltip retargets without mounting again', async ({tooltipHarness}) => {
        const {page, targets} = tooltipHarness;

        await page.evaluate(() => window.tooltipMountWitness.release());
        await page.locator(`[id="${targets[0].id}"]`).hover();
        await expectTarget(tooltipHarness, targets[0]);
        await page.locator(`[id="${targets[1].id}"]`).hover();
        await expectTarget(tooltipHarness, targets[1]);
        await page.locator(`[id="${targets[0].id}"]`).hover();
        await expectTarget(tooltipHarness, targets[0]);
        const witness = await readWitness(page);

        expect(witness).toMatchObject({maxNodes: 1, duplicateIds: []});
        expect(witness.received.filter(action => action === 'insertNode')).toHaveLength(1);
        expect(witness.applied.filter(action => action === 'insertNode')).toHaveLength(1);
        expect(witness.received).not.toContain('removeNode')
    })
});
