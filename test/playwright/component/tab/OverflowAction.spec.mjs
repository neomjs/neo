import {test, expect} from '@playwright/test';

const TAB_ID = 'overflow-action-tab-container';

let componentId = null;

/**
 * Creates a real TabContainer whose Overflow plugin contributes into a host/close action rail.
 * @param {Object} page
 * @returns {Promise<String>}
 */
async function createTabContainer(page) {
    const result = await page.evaluate(async id => {
        const loaded = await Neo.worker.App.loadModule({path: '../tab/plugin/Overflow.mjs'});

        if (!loaded.success) {
            throw new Error(`Overflow module load failed: ${loaded.error?.message}`)
        }

        return Neo.worker.App.createNeoInstance({
            activeIndex  : 0,
            height       : 240,
            headerActions: [{
                action     : 'host-action',
                iconCls    : 'fa fa-star',
                showOnFocus: false
            }, {
                action     : 'close',
                iconCls    : 'fa fa-times',
                showOnFocus: false
            }],
            headerToolbar: {
                plugins: [{ntype: 'plugin-tab-overflow', projectAsAction: true}]
            },
            id,
            importPath: '../tab/Container.mjs',
            items     : Array.from({length: 8}, (_, index) => ({
                header: {text: `Tab ${index + 1}`},
                ntype : 'component',
                text  : `Content ${index + 1}`
            })),
            ntype   : 'tab-container',
            parentId: 'component-test-viewport',
            width   : 380
        })
    }, TAB_ID);

    if (!result.success) {
        throw new Error(`TabContainer creation failed: ${result.error.message}`)
    }

    return result.id
}

/** Returns the action-root ids in rendered toolbar order. */
const actionIds = toolbar => toolbar.locator(':scope > .neo-toolbar-action')
    .evaluateAll(nodes => nodes.map(node => node.id));

/** Replaces consumer actions through the public TabContainer config path. */
const replaceHeaderActions = (page, suffix) => page.evaluate(({id, suffix}) =>
    Neo.worker.App.setConfigs({
        id,
        headerActions: [{
            action     : `host-${suffix}`,
            iconCls    : 'fa fa-bolt',
            showOnFocus: false
        }, {
            action     : 'close',
            iconCls    : 'fa fa-times',
            showOnFocus: false
        }]
    }), {id: TAB_ID, suffix});

test.describe('Neo.tab.plugin.Overflow — toolbar action projection', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        componentId = await createTabContainer(page);
        await page.waitForSelector(`#${componentId}`, {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
            componentId = null
        }
    });

    test('renders first, outside focus gating, with measured non-overlap and ordinary menu activation', async ({page}) => {
        const errors = [];

        page.on('pageerror', error => errors.push(String(error?.message || error)));

        const root    = page.locator(`#${TAB_ID}`),
              toolbar = root.locator(':scope > .neo-tab-header-toolbar'),
              control = toolbar.getByRole('button', {name: 'More tabs', exact: true}),
              host    = toolbar.getByRole('button', {name: 'host action', exact: true}),
              close   = toolbar.getByRole('button', {name: 'close', exact: true});

        await expect(control).toBeVisible({timeout: 10000});
        await expect(host).toBeVisible();
        await expect(close).toBeVisible();
        await expect(control).not.toHaveClass(/neo-toolbar-action-context-inactive/);
        await expect(control).not.toHaveAttribute('aria-hidden');
        await expect(page.locator('body > .neo-tab-overflow-control')).toHaveCount(0);

        const ids = await actionIds(toolbar);

        expect(ids[0], 'Overflow owns the first action slot').toBe(await control.getAttribute('id'));
        expect(ids.at(-1), 'close remains the final action').toBe(await close.getAttribute('id'));

        const visibleTabs = toolbar.locator(':scope > .neo-tab-header-button:visible'),
              lastTab     = visibleTabs.last(),
              tabBox      = await lastTab.boundingBox(),
              controlBox  = await control.boundingBox();

        expect(tabBox.x + tabBox.width,
            'the visible tab partition ends before the measured contribution').toBeLessThanOrEqual(controlBox.x + 1);

        await control.click();

        const menuItem = page.locator('.neo-tab-overflow-menu:visible .neo-list-item').first();

        await expect(menuItem).toBeVisible({timeout: 10000});

        const selected = (await menuItem.innerText()).trim();

        await menuItem.click();
        await expect(toolbar.locator('.neo-tab-header-button.pressed:visible').filter({hasText: selected}))
            .toHaveCount(1, {timeout: 10000});
        expect(errors).toEqual([])
    });

    test('preserves one instance across visible and all-fit consumer action replacements', async ({page}) => {
        const root    = page.locator(`#${TAB_ID}`),
              toolbar = root.locator(':scope > .neo-tab-header-toolbar'),
              control = toolbar.getByRole('button', {name: 'More tabs', exact: true});

        await expect(control).toBeVisible({timeout: 10000});

        const controlId = await control.getAttribute('id');

        await replaceHeaderActions(page, 'visible');
        await expect(toolbar.getByRole('button', {name: 'host visible', exact: true})).toBeVisible();
        expect((await actionIds(toolbar))[0]).toBe(controlId);
        await expect(toolbar.locator(`#${controlId}`)).toHaveCount(1);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 1200}), TAB_ID);
        await expect(toolbar.locator(`#${controlId}`), 'all-fit hides the contribution from DOM')
            .toHaveCount(0, {timeout: 10000});

        await replaceHeaderActions(page, 'hidden');
        await expect(toolbar.getByRole('button', {name: 'host hidden', exact: true})).toBeVisible();

        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 380}), TAB_ID);

        const restored = toolbar.locator(`#${controlId}`);

        await expect(restored, 'the pre-overflow contribution instance returns after replacement')
            .toBeVisible({timeout: 10000});
        await expect(toolbar.locator('.neo-tab-overflow-control')).toHaveCount(1);

        const ids = await actionIds(toolbar);

        expect(ids[0]).toBe(controlId);
        expect(ids.at(-1)).toBe(await toolbar.getByRole('button', {name: 'close', exact: true}).getAttribute('id'));

        await restored.click();

        const menuItem = page.locator('.neo-tab-overflow-menu:visible .neo-list-item').first();

        await expect(menuItem, 'the recovered contribution keeps its ordinary menu route')
            .toBeVisible({timeout: 10000});

        const selected = (await menuItem.innerText()).trim();

        await menuItem.click();
        await expect(toolbar.locator('.neo-tab-header-button.pressed:visible').filter({hasText: selected}),
            'selection still activates through activeIndex after the hidden replacement').toHaveCount(1)
    });

    test('the restored split settles once — no pass re-applies a superseded extent', async ({page}) => {
        const root    = page.locator(`#${TAB_ID}`),
              toolbar = root.locator(':scope > .neo-tab-header-toolbar'),
              control = toolbar.getByRole('button', {name: 'More tabs', exact: true});

        await expect(control).toBeVisible({timeout: 10000});

        const controlId = await control.getAttribute('id');

        await replaceHeaderActions(page, 'visible');
        await expect(toolbar.getByRole('button', {name: 'host visible', exact: true})).toBeVisible();

        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 1200}), TAB_ID);
        await expect(toolbar.locator(`#${controlId}`), 'all-fit hides the contribution from DOM')
            .toHaveCount(0, {timeout: 10000});

        await replaceHeaderActions(page, 'hidden');
        await expect(toolbar.getByRole('button', {name: 'host hidden', exact: true})).toBeVisible();

        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 380}), TAB_ID);

        // A retrying assertion cannot witness a transient — it polls until the contribution returns and
        // then stops looking, which is why the sibling arm above races this defect instead of pinning it.
        // So sample from the moment the width is set, WITHOUT waiting for the restore first: record every
        // distinct state of the action group, then assert against the recorded sequence. Waiting for the
        // contribution before sampling would let the flap happen inside the wait and go unrecorded.
        const states = [];

        for (let i = 0; i < 80; i++) {
            const ids = (await actionIds(toolbar)).join(',');

            states.at(-1) !== ids && states.push(ids);
            await page.waitForTimeout(25)
        }

        const restoredAt = states.findIndex(state => state.split(',').includes(controlId));

        expect(restoredAt, 'the contribution returns after the narrow resize').toBeGreaterThan(-1);

        // Once it is back it must STAY back. A later state without it means a projection pass applied a
        // verdict measured against the superseded (wide) extent, taking the contribution out of the DOM
        // and the overflowing tabs back into it — a state that reads as coherent because it is one.
        const afterRestore = states.slice(restoredAt);

        expect(afterRestore.filter(state => !state.split(',').includes(controlId)),
            'no pass re-applies a superseded extent once the contribution is restored').toEqual([]);
        expect(afterRestore.at(-1).split(',')[0], 'the contribution holds the first action slot')
            .toBe(controlId)
    });

    test('a withdrawn focus-gated action contributes no extent to the partition', async ({page}) => {
        // The other arms in this file use `showOnFocus: false` throughout, so none of them exercise
        // the plugin against a collapsed action. This one does: a gated action is removed from the
        // layout while withdrawn, and the plugin must therefore EXCLUDE it from measurement rather
        // than measure it. A collapsed node reports an all-zero rect, and this measurement reads the
        // rect's POSITION as well as its size — measuring one places the action cluster at offset 0
        // and consumes the whole strip, collapsing every tab into the overflow menu.
        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);

        // This arm is the only one that replaces the shared `beforeEach` container, and it reuses the
        // same id. Resolving the worker-side destroy does NOT mean the DOM is gone: the removal travels
        // to main as a separate message, so re-creating immediately can mount the new header while the
        // old one is still attached. Two toolbars then answer to one id and the strict-mode locators
        // below abort on arity — and the orphan outlives the test, because the App Worker is shared, so
        // the casualty surfaces in whatever spec runs next. Await the detach; it is the actual barrier.
        await page.waitForSelector(`#${TAB_ID}`, {state: 'detached'});

        componentId = await page.evaluate(async id => {
            const result = await Neo.worker.App.createNeoInstance({
                activeIndex  : 0,
                height       : 240,
                headerActions: [{
                    action     : 'host-action',
                    iconCls    : 'fa fa-star',
                    showOnFocus: false
                }, {
                    // Focus-gated: the subject of this arm.
                    action : 'gated-action',
                    iconCls: 'fa fa-thumbtack'
                }, {
                    action     : 'close',
                    iconCls    : 'fa fa-times',
                    showOnFocus: false
                }],
                headerToolbar: {plugins: [{ntype: 'plugin-tab-overflow', projectAsAction: true}]},
                id,
                importPath   : '../tab/Container.mjs',
                items        : Array.from({length: 8}, (_, index) => ({
                    header: {text: `Tab ${index + 1}`},
                    ntype : 'component',
                    text  : `Content ${index + 1}`
                })),
                ntype   : 'tab-container',
                parentId: 'component-test-viewport',
                width   : 380
            });

            if (!result.success) {
                throw new Error(`gated TabContainer creation failed: ${result.error.message}`)
            }

            return result.id
        }, TAB_ID);

        await page.waitForSelector(`#${componentId}`, {state: 'attached'});

        const root    = page.locator(`#${TAB_ID}`),
              toolbar = root.locator(':scope > .neo-tab-header-toolbar'),
              control = toolbar.getByRole('button', {name: 'More tabs', exact: true}),
              gated   = toolbar.locator(':scope > .neo-toolbar-action:has(.fa-thumbtack)'),
              tabs    = toolbar.locator(':scope > .neo-tab-header-button');

        await expect(gated, 'the gated action is projected').toHaveCount(1);
        await expect(control, 'precondition: the strip overflows, so a partition exists to lose')
            .toBeVisible({timeout: 10000});

        const toolbarId = await toolbar.getAttribute('id'),
              setGate   = visible => page.evaluate(
                  ({id, visible}) => Neo.worker.App.setConfigs({id, contextualActionsVisible: visible}),
                  {id: toolbarId, visible}
              );

        // The withdrawn state is pinned through the SAME reactive config the focus wiring writes
        // (`toolbar.Base#contextualActionsVisible`), rather than by moving real focus. A standalone
        // container has no focus subject holding focus, so driving the config is what makes the
        // state deterministic here — and it is the identical state, not a proxy for it.
        await setGate(false);
        await expect(gated, 'the action is withdrawn').toHaveClass(/neo-toolbar-action-context-inactive/);

        // Force a re-partition WHILE the action is collapsed. Toggling the gate alone does not
        // re-measure, and the all-zero-rect defect only surfaces on a measurement pass: without
        // this the arm passes whether or not the plugin excludes collapsed actions, which is the
        // vacuity this control exists to remove.
        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 1200}), TAB_ID);
        await expect(toolbar.locator('.neo-tab-overflow-control'), 'all-fit retires the contribution')
            .toHaveCount(0, {timeout: 10000});
        await page.evaluate(id => Neo.worker.App.setConfigs({id, width: 380}), TAB_ID);

        // Withdrawn: no box at all, so it cannot be measured into the strip extent.
        expect(await gated.boundingBox(), 'a withdrawn action occupies no space').toBeNull();

        // The partition stays usable. This is the assertion that reds when the plugin measures the
        // collapsed action's all-zero rect: the cluster is then placed at offset 0, the strip reads
        // as fully consumed, and every non-active tab is driven into the menu.
        await expect(control, 'the overflow control is contributed').toHaveCount(1);
        expect(await tabs.count(), 'direct tabs remain reachable without opening the menu')
            .toBeGreaterThan(1);

        const directTabs = await tabs.count();

        // Revealing it must not break the invariants the other arms protect.
        await setGate(true);
        await expect(gated, 'the reveal exposes the gated action').not.toHaveClass(/neo-toolbar-action-context-inactive/);
        expect(await gated.boundingBox(), 'and revealing it gives it a box').not.toBeNull();

        await expect(control, 'the overflow control survives the reveal').toHaveCount(1);
        await expect(toolbar.locator(':scope > .neo-tab-header-button.pressed'),
            'exactly one tab stays active across the reveal').toHaveCount(1);
        expect(await tabs.count(), 'the reveal may repartition, but never empties the strip')
            .toBeGreaterThan(0);
        expect(directTabs, 'precondition sanity: the withdrawn state had a real partition to lose')
            .toBeGreaterThan(1)
    })
});
