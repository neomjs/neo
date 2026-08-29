import {test, expect} from '@playwright/test';

/**
 * The DockSplitter parent-transition equivalence contract — rendered tier.
 *
 * Pins the projected config/class surface on a real mounted instance: orientation drives the
 * modifier class, the axis dimension pair, and their live re-projection on config change. The
 * behavior half of the equivalence contract (capture, vector, the single fail-closed semantic
 * commit, terminal events, teardown) lives in the unit sibling
 * `test/playwright/unit/dashboard/DockSplitterEquivalence.spec.mjs`, where the gesture handlers
 * are driven synthetically with zero DOM-transport variables. Both files must pass UNCHANGED
 * after DockSplitter adopts generic `Neo.component.Splitter` for its mechanics.
 */

let containerId, splitterId;

const mount = async (page, splitterConfig = {}) => {
    const ids = await page.evaluate(async cfg => {
        const container = await Neo.worker.App.createNeoInstance({
            importPath: '../container/Base.mjs',
            ntype     : 'container',
            height    : 300,
            layout    : {ntype: 'hbox', align: 'stretch'},
            parentId  : 'dock-splitter-test-viewport',
            width     : 600
        });

        if (!container.success) throw new Error(`container: ${container.error.message}`);

        const splitter = await Neo.worker.App.createNeoInstance({
            importPath: '../dashboard/dock/interaction/DockSplitter.mjs',
            ntype     : 'dashboard-dock-splitter',
            id        : 'equiv-splitter',
            parentId  : container.id,
            ...cfg
        });

        if (!splitter.success) throw new Error(`splitter: ${splitter.error.message}`);

        return {containerId: container.id, splitterId: splitter.id}
    }, splitterConfig);

    await page.waitForSelector('#equiv-splitter', {state: 'attached'});
    return ids
};

// worker getConfigs returns POSITIONAL values for array keys — zip them into a keyed map
const getConfigs = async (page, id, keys) => {
    const values = await page.evaluate(
        ({id, keys}) => Neo.worker.App.getConfigs({id, keys}), {id, keys});
    return Object.fromEntries(keys.map((key, index) => [key, values[index]]))
};

test.describe('Neo.dashboard.dock.interaction.DockSplitter — rendered equivalence', () => {
    test.setTimeout(60000);
    test.use({viewport: {height: 800, width: 1200}});

    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/dock-splitter/index.html');
        await page.waitForSelector('#dock-splitter-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        containerId && await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), containerId);
        containerId = splitterId = null
    });

    test('config projection: orientation drives class, axis dims and their live re-projection', async ({page}) => {
        ({containerId, splitterId} = await mount(page, {orientation: 'horizontal', size: 6}));

        let cfg = await getConfigs(page, splitterId, ['cls', 'width', 'minWidth', 'height']);
        expect(cfg.cls).toContain('neo-dashboard-dock-splitter-horizontal');
        expect(cfg.width).toBe(6);
        expect(cfg.minWidth).toBe(6);
        expect(cfg.height).toBe(null);

        // the rendered node carries the same projection
        const box = await page.locator('#equiv-splitter').boundingBox();
        expect(Math.round(box.width)).toBe(6);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, orientation: 'vertical'}), splitterId);

        await expect.poll(async () => (await getConfigs(page, splitterId, ['cls'])).cls)
            .toContain('neo-dashboard-dock-splitter-vertical');

        cfg = await getConfigs(page, splitterId, ['cls', 'width', 'height', 'minHeight']);
        expect(cfg.cls).not.toContain('neo-dashboard-dock-splitter-horizontal');
        expect(cfg.height).toBe(6);
        expect(cfg.minHeight).toBe(6);
        expect(cfg.width).toBe(null)
    });
});
