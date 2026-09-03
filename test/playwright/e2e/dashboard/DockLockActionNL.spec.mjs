import {test, expect} from '../../fixtures.mjs';

const WORKSPACE_ID = 'dock-lock-workspace';

const asArray = value => Array.isArray(value) ? value : value ? [value] : [];

const values = record => record?.properties ?? record ?? {};

const tabsNodeWith = (page, tabText) => page.locator('.neo-dashboard-dock-tabs', {
    has: page.locator(`.neo-tab-header-button:has-text("${tabText}")`)
});

const tabButton = (node, text) => node.locator('.neo-tab-header-button', {hasText: text});

const actionButton = (node, glyph) =>
    node.locator(`.neo-tab-header-toolbar .neo-button:has([class*="${glyph}"])`);

const dragAfter = async (page, source, target) => {
    const from = await source.boundingBox(),
          to   = await target.boundingBox(),
          y    = from.y + from.height / 2;

    await page.mouse.move(from.x + from.width / 2, y);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.move(to.x + to.width / 2, y, {steps: 40});
    await page.mouse.up()
};

test.describe('dock lock action — Whitebox gesture contract', () => {
    test('lock refuses stale close and drag; unlock restores both gestures', async ({page, neuralLink}) => {
        await page.goto('/test/playwright/component/apps/dock-lock/');
        await page.waitForSelector('#dock-lock-workspace', {state: 'visible'});

        const app  = await neuralLink.connectToApp('Test.Playwright.DockLock'),
              main = tabsNodeWith(page, 'Alpha');

        const readDocument = async () => {
            const component = await app.getComponent(WORKSPACE_ID, ['dockModel']);

            return values(component).dockModel
        };

        const awaitRefresh = async value => {
            await app.setProperties(WORKSPACE_ID, {settleProbeCount: value});
            await expect.poll(async () => {
                const component = await app.getComponent(WORKSPACE_ID, ['settledProbeCount']);

                return values(component).settledProbeCount
            }).toBe(value)
        };

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-lock').click();

        await expect.poll(async () => (await readDocument()).items.alpha.locked).toBe(true);

        const before     = structuredClone(await readDocument()),
              tabsRecord = asArray(await app.queryComponent(
                  {dockNodeId: 'main-tabs'},
                  ['id']
              ))[0],
              tabsId     = tabsRecord?.id ?? values(tabsRecord).id;

        expect(tabsId).toBeTruthy();

        // Stale presentation falsifier: bypass hidden chrome through the real TabContainer event
        // route. Workspace still reaches handleDockCloseAction, and the model remains the boundary.
        await app.callMethod(tabsId, 'onHeaderAction', [{action: 'close'}]);

        expect(await readDocument()).toEqual(before);

        await app.getDragTrace(true);
        await dragAfter(page, tabButton(main, 'Alpha'), tabButton(main, 'Beta'));

        expect((await readDocument()).nodes['main-tabs'].items,
            'a locked header refuses the drag, so the tabs node is untouched')
            .toEqual(before.nodes['main-tabs'].items);
        expect((await app.getDragTrace()).traces || [],
            'a locked header never arms the SortZone').toEqual([]);

        const lockedConsistency = await app.verifyComponentConsistency(WORKSPACE_ID),
              lockedMismatches  =
                  lockedConsistency?.mismatches || lockedConsistency?.result?.mismatches || [];

        expect(lockedMismatches, 'the refused locked gesture leaves every render surface exact')
            .toEqual([]);

        await actionButton(main, 'fa-lock-open').click();
        await expect.poll(async () => (await readDocument()).items.alpha.locked).toBe(false);
        await expect(tabButton(main, 'Alpha')).toHaveClass(/neo-draggable/);

        await app.getDragTrace(true);
        await dragAfter(page, tabButton(main, 'Alpha'), tabButton(main, 'Beta'));

        let unlockedEnd;

        await expect.poll(async () => {
            const traceData = await app.getDragTrace(),
                  traces    = traceData?.traces || traceData?.result?.traces || [],
                  trace     = traces[traces.length - 1];

            unlockedEnd = trace?.events?.find(event => event.t === 'end') || null;

            return unlockedEnd
        }, {message: 'the restored SortZone commits the one-slot reorder'})
            .toMatchObject({from: 0, to: 1});

        expect(unlockedEnd.noop).not.toBe(true);

        const expectedOrder = [...before.nodes['main-tabs'].items];

        [expectedOrder[0], expectedOrder[1]] = [expectedOrder[1], expectedOrder[0]];

        await expect.poll(async () => (await readDocument()).nodes['main-tabs'].items)
            .toEqual(expectedOrder);
        await awaitRefresh(1);

        await actionButton(main, 'fa-times').click();
        await expect.poll(async () => Boolean((await readDocument()).items.alpha)).toBe(false);
        await awaitRefresh(2);
    })
});
