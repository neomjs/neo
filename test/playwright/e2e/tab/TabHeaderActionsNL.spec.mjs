import {test, expect} from '../../fixtures.mjs';

const asArray = value => Array.isArray(value) ? value : value ? [value] : [];
const valueOf = (record, key) => record?.properties?.[key] ?? record?.[key];

/**
 * @summary Whitebox journey for flat TabContainer actions across focus, accessibility,
 * orientation, Overflow, and SortZone gesture boundaries.
 */
test.describe('TabContainer flat header actions (Neural Link)', () => {
    test.setTimeout(120000);
    test.use({viewport: {height: 800, width: 1000}});

    test('actions stay semantic, focus-aware, overflow-safe, and outside tab sorting', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

        await page.goto('/examples/tab/container/index.html');

        const app = await neuralLink.connectToApp('Neo.examples.tab.container');

        await expect(page.locator('.neo-tab-container')).toBeVisible({timeout: 30000});

        const tabRecords = asArray(await app.queryComponent(
            {ntype: 'tab-container'},
            ['id', 'activeIndex', 'bodyContainerId', 'tabBarId', 'tabBarPosition']
        ));

        expect(tabRecords, 'the rendered example owns one semantic TabContainer').toHaveLength(1);

        const tabRecord = tabRecords[0],
              tabId     = tabRecord.id,
              bodyId    = valueOf(tabRecord, 'bodyContainerId'),
              barId     = valueOf(tabRecord, 'tabBarId'),
              bar       = page.locator(`#${barId}`);

        expect(tabId, 'the example owns one semantic TabContainer').toBeTruthy();
        expect(await app.callMethod(tabId, 'getCount'), 'actions never change the semantic tab count').toBe(3);

        const actionRecords = asArray(await app.queryComponent(
                  {isToolbarAction: true},
                  ['id', 'action', 'contextual', 'role', 'vdom', 'wrapperCls']
              )),
              actionsByName = Object.fromEntries(actionRecords.map(record => [valueOf(record, 'action'), record])),
              nextRecord    = actionsByName['next-tab'],
              previousRecord= actionsByName['previous-tab'],
              nextId        = nextRecord.id,
              previousId    = previousRecord.id,
              nextAction    = page.locator(`#${nextId}`),
              previousAction= page.locator(`#${previousId}`);

        expect(nextId).toBeTruthy();
        expect(previousId).toBeTruthy();
        expect(valueOf(nextRecord, 'role')).toBe('button');
        expect(valueOf(previousRecord, 'role')).toBe('button');
        expect(valueOf(nextRecord, 'wrapperCls')).not.toContain('neo-draggable');
        expect(valueOf(previousRecord, 'wrapperCls')).not.toContain('neo-draggable');

        const semanticNext = await app.callMethod(tabId, 'getActionItem', ['next-tab']);
        expect(semanticNext?.id, 'semantic lookup resolves the stable action instance').toBe(nextId);

        await expect(page.getByRole('button', {name: 'next tab', exact: true})).toHaveCount(1);
        await expect(page.getByRole('button', {name: 'previous tab', exact: true})).toHaveCount(0);
        await expect(previousAction).toHaveCSS('visibility', 'hidden');
        expect(await previousAction.evaluate(node => ({
            ariaHidden: node.getAttribute('aria-hidden'),
            inert     : node.inert,
            tabIndex  : node.tabIndex
        }))).toEqual({ariaHidden: 'true', inert: true, tabIndex: -1});

        const bodyTree = await app.getComponentTree(bodyId, 2, true),
              cardId   = bodyTree.tree.items[0].id,
              card     = page.locator(`#${cardId}`);

        expect(cardId, 'the example exposes a naturally focusable active body').toBeTruthy();
        await card.click();

        await expect(previousAction).toHaveCSS('visibility', 'visible');
        await expect(page.getByRole('button', {name: 'previous tab', exact: true})).toHaveCount(1);
        expect(await previousAction.evaluate(node => ({
            ariaHidden: node.getAttribute('aria-hidden'),
            inert     : node.inert,
            tabIndex  : node.tabIndex
        }))).toEqual({ariaHidden: null, inert: false, tabIndex: 0});

        // Header actions precede the body in DOM order, so the natural body → trailing-action route
        // is one reverse-tab step (no positive tabindex reshaping).
        await page.keyboard.press('Shift+Tab');
        expect(await page.evaluate(() => document.activeElement?.id),
            'the armed contextual action enters native keyboard order').toBe(previousId);
        await expect(previousAction).toHaveCSS('visibility', 'visible');

        await previousAction.click();
        await expect.poll(async () => (await app.getComponent(tabId, ['activeIndex'])).activeIndex)
            .toBe(2);

        const outsideField = page.locator('#activeIndexField__input');
        await outsideField.click();
        await expect(previousAction).toHaveCSS('visibility', 'hidden');
        await expect(page.getByRole('button', {name: 'previous tab', exact: true})).toHaveCount(0);

        // Entering through a persistent header action does not arm the contextual sibling.
        await nextAction.click();
        await expect.poll(async () => (await app.getComponent(tabId, ['activeIndex'])).activeIndex)
            .toBe(0);
        await expect(previousAction).toHaveCSS('visibility', 'hidden');

        const tabIds = await bar.locator('.neo-tab-header-button').evaluateAll(nodes => nodes.map(node => node.id));

        expect(tabIds).toHaveLength(3);
        await expect(bar.locator('.neo-toolbar-action.neo-draggable')).toHaveCount(0);
        await expect(bar.locator('.neo-toolbar-action-spacer.neo-draggable')).toHaveCount(0);

        const overflowControl = page.getByRole('button', {name: 'More tabs', exact: true});

        for (const position of ['top', 'right', 'bottom', 'left']) {
            const horizontal = position === 'top' || position === 'bottom';

            await app.setProperties(tabId, {height: 300, tabBarPosition: position, width: 500});
            await expect(bar).toHaveClass(new RegExp(`neo-dock-${position}`));

            const [barRect, lastTabRect, firstActionRect] = await app.getDomRect([
                barId,
                tabIds[tabIds.length - 1],
                nextId
            ]);

            if (horizontal) {
                expect(firstActionRect.left,
                    `${position}: the action rail starts after the final tab`).toBeGreaterThanOrEqual(lastTabRect.right - 1);
                expect(firstActionRect.right,
                    `${position}: actions remain inside the toolbar main axis`).toBeLessThanOrEqual(barRect.right + 1)
            } else {
                expect(firstActionRect.top,
                    `${position}: the action rail starts after the final tab`).toBeGreaterThanOrEqual(lastTabRect.bottom - 1);
                expect(firstActionRect.bottom,
                    `${position}: actions remain inside the toolbar main axis`).toBeLessThanOrEqual(barRect.bottom + 1)
            }

            expect(await app.callMethod(tabId, 'getCount')).toBe(3);

            // Render a real Overflow control on every axis, not only in the rect-stubbed unit core.
            await app.setProperties(tabId, horizontal ? {width: 250} : {height: 200});
            await expect(overflowControl).toHaveCount(1, {timeout: 10000});

            // The same floating control survives axis changes, so count=1 can already be true while
            // the owner ResizeObserver is still projecting its new alignment. Poll the rendered
            // boundary itself — the contract under test — rather than sampling that transition.
            await expect.poll(async () => {
                const controlRect = await overflowControl.boundingBox(),
                      actionRect  = await nextAction.boundingBox();

                return horizontal
                    ? Math.abs(controlRect.x + controlRect.width - actionRect.x)
                    : Math.abs(controlRect.y + controlRect.height - actionRect.y)
            }, {message: `${position}: Overflow aligns before the action rail`, timeout: 10000})
                .toBeLessThanOrEqual(2);

            await app.setProperties(tabId, {height: 300, width: 500});
            await expect(overflowControl).toHaveCount(0, {timeout: 10000})
        }

        await app.setProperties(tabId, {height: 300, tabBarPosition: 'top', width: 250});
        await expect(bar).toHaveClass(/neo-dock-top/);

        // Re-enter through the body before focusing the logically-owned floating Overflow control.
        await card.click();
        await expect(previousAction).toHaveCSS('visibility', 'visible');

        await expect(overflowControl).toHaveCount(1, {timeout: 10000});
        const controlId         = await overflowControl.getAttribute('id'),
              controlProperties = await app.getComponent(controlId, ['parentComponent', 'parentId', 'role']);

        expect(await overflowControl.evaluate(node => node.parentElement === document.body),
            'Overflow remains a physical body child').toBe(true);
        expect(controlProperties.parentId).toBe('document.body');
        expect(controlProperties.parentComponent?.id,
            'Overflow retains logical toolbar ancestry for manager.Focus').toBe(barId);
        expect(controlProperties.role).toBe('button');

        const controlRect = await overflowControl.boundingBox(),
              nextRect    = await nextAction.boundingBox();

        expect(Math.abs(controlRect.x + controlRect.width - nextRect.x),
            'Overflow aligns immediately before the action rail').toBeLessThanOrEqual(2);

        await overflowControl.click();
        const menuItem = page.locator('.neo-tab-overflow-menu:visible .neo-list-item').first();

        await expect(menuItem).toBeVisible({timeout: 10000});

        const menuId         = await menuItem.evaluate(node => node.closest('.neo-tab-overflow-menu')?.id),
              menuProperties = await app.getComponent(menuId, ['parentComponent', 'parentId']);

        expect(menuProperties.parentId).toBe('document.body');
        expect(menuProperties.parentComponent?.id,
            'the generated menu retains the floating control as its logical owner').toBe(controlId);

        await menuItem.focus();
        expect(await page.evaluate(() => document.activeElement?.id),
            'focus moves off the control and into its generated popup').not.toBe(controlId);
        await expect(previousAction,
            'focus moving into the logically-owned Overflow/menu realm retains contextual actions').toHaveCSS('visibility', 'visible');

        await outsideField.click();
        await expect(previousAction).toHaveCSS('visibility', 'hidden');

        // Start from an all-fit header. Mid-gesture action growth would overflow, but the SortZone's
        // stable snapshot owns the gesture, so Overflow must queue until the terminal.
        await app.setProperties(tabId, {width: 310});
        await expect(overflowControl).toHaveCount(0, {timeout: 10000});
        await card.click();
        await expect(previousAction).toHaveCSS('visibility', 'visible');

        await app.getDragTrace(true);

        const lastTab  = page.locator(`#${tabIds[tabIds.length - 1]}`),
              startBox = await lastTab.boundingBox(),
              railBox  = await nextAction.boundingBox(),
              y        = startBox.y + startBox.height / 2;

        await page.mouse.move(startBox.x + startBox.width / 2, y);
        await page.mouse.down();
        await page.waitForTimeout(150);
        await page.mouse.move(railBox.x + railBox.width / 2, y, {steps: 30});

        await expect.poll(async () => {
            const zones = asArray(await app.findInstances(
                {ntype: 'tab-header-toolbar-sortzone'},
                ['id', 'startIndex']
            ));

            return valueOf(zones[0], 'startIndex')
        }, {message: 'the real mouse sensor armed the semantic tab snapshot'}).toBe(2);

        await app.setProperties(nextId, {width: 80});
        await page.waitForTimeout(200);

        const grownRailBox   = await nextAction.boundingBox(),
              renderedGrowth = grownRailBox.width - railBox.width;

        expect(await bar.locator('.neo-tab-header-button').count(),
            'Overflow cannot remove sortable members beneath a held geometry snapshot').toBe(3);
        await expect(overflowControl,
            'the action-width projection is queued for the drag terminal').toHaveCount(0);

        const overflowInstances = asArray(await app.findInstances(
            {ntype: 'plugin-tab-overflow'},
            ['id', 'sortDragProjectionQueued']
        ));
        if (renderedGrowth > 1) {
            expect(valueOf(overflowInstances[0], 'sortDragProjectionQueued'),
                'a rendered mid-drag resize queues its projection').toBe(true)
        }

        await page.mouse.move(grownRailBox.x + grownRailBox.width / 2, y, {steps: 20});
        await page.mouse.up();

        await expect(overflowControl,
            'the queued projection drains after SortZone restores natural layout').toHaveCount(1, {timeout: 10000});

        const traceData = await app.getDragTrace(),
              traces    = traceData?.traces || traceData?.result?.traces || [],
              trace     = traces[traces.length - 1],
              endEvent  = trace?.events?.find(event => event.t === 'end');

        expect(trace?.items, 'the trace contains only semantic tab members').toEqual(tabIds);
        expect(trace.items).not.toContain(nextId);
        expect(trace.items).not.toContain(previousId);
        expect(endEvent).toMatchObject({from: 2, noop: true, to: 2});

        await app.setProperties(nextId, {width: null});
        await app.setProperties(tabId, {width: 500});
        await expect(overflowControl).toHaveCount(0, {timeout: 10000});

        const consistency = await app.verifyComponentConsistency(barId),
              mismatches  = consistency?.mismatches || consistency?.result?.mismatches || [];

        expect(mismatches, 'post-drag items, VDOM, and DOM remain exact').toEqual([]);
        expect(await app.callMethod(tabId, 'getCount')).toBe(3);

        // Runtime host replacement enters Toolbar#syncActions rather than the construction path.
        // Contextual defaults are applied after the structural insert there, so pin their physical
        // DOM/a11y state rather than accepting the worker VDOM as proof that the insert flush carried it.
        await outsideField.click();
        await expect(previousAction).toHaveCSS('visibility', 'hidden');
        await app.setProperties(tabId, {
            headerActions: [{action: 'runtime-contextual', iconCls: 'fa fa-bolt'}]
        });

        const runtimeActionRecord = await app.callMethod(tabId, 'getActionItem', ['runtime-contextual']),
              runtimeActionId     = runtimeActionRecord?.id,
              runtimeAction       = page.locator(`#${runtimeActionId}`);

        expect(runtimeActionId, 'runtime replacement materialises the new semantic action').toBeTruthy();
        await expect(runtimeAction).toHaveCount(1);
        await expect(runtimeAction,
            'syncActions commits contextual inactivity to the rendered root').toHaveCSS('visibility', 'hidden');
        await expect(page.getByRole('button', {name: 'runtime contextual', exact: true})).toHaveCount(0);
        expect(await runtimeAction.evaluate(node => ({
            ariaHidden: node.getAttribute('aria-hidden'),
            inert     : node.inert,
            tabIndex  : node.tabIndex
        }))).toEqual({ariaHidden: 'true', inert: true, tabIndex: -1});

        await card.click();
        await expect(runtimeAction).toHaveCSS('visibility', 'visible');
        await expect(page.getByRole('button', {name: 'runtime contextual', exact: true})).toHaveCount(1);
        expect(await runtimeAction.evaluate(node => ({
            ariaHidden: node.getAttribute('aria-hidden'),
            inert     : node.inert,
            tabIndex  : node.tabIndex
        }))).toEqual({ariaHidden: null, inert: false, tabIndex: 0});

        expect(await app.callMethod(tabId, 'getCount'),
            'runtime action replacement never changes the semantic tab count').toBe(3);
        expect(pageErrors, 'the complete action/focus/overflow/drag journey emits no page errors').toEqual([])
    })
});
