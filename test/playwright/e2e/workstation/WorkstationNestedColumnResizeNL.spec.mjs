import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E regression for a retained nested dock column whose outer splitter moves.
 *
 * The journey deliberately composes two trusted-pointer interactions which older witnesses kept
 * separate: move Matrix right of Heavy, move the bottom Feed tab above Heavy, then resize the
 * enclosing horizontal split while the structural DockFlip is still active. The nested split is one direct outer flex child, so both stacked tab
 * descendants must share its cross-axis edges during preview and after the semantic terminal.
 *
 * Worker truth classifies the failure: the drop must first commit the expected nested vertical
 * split; the resize preview must leave the document byte-identical; release may change only the
 * outer split's size vector. Rendered rects then prove whether retained projection geometry follows
 * that correct model or leaves one pane at its former width.
 *
 * Run: NEO_E2E_PORT=8096 npx playwright test WorkstationNestedColumnResizeNL \
 *   -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation nested dock column follows its outer splitter (#17985)', () => {
    test.setTimeout(120000);
    test.use({viewport: {height: 900, width: 1600}});

    /**
     * @param {Object|Object[]|null} result
     * @returns {String|null}
     */
    function readId(result) {
        if (Array.isArray(result)) return readId(result[0]);

        return result?.properties?.id ?? result?.id ?? null
    }

    /**
     * @param {Object} document
     * @param {String} itemId
     * @returns {String|null}
     */
    function findTabsNode(document, itemId) {
        return Object.entries(document?.nodes || {})
            .find(([, node]) => node.type === 'tabs' && node.items?.includes(itemId))?.[0] ?? null
    }

    /**
     * @param {Object} document
     * @returns {{feedTabsId: String, nestedId: String}|null}
     */
    function findNestedHeavyFeedColumn(document) {
        const feedTabsId = findTabsNode(document, 'feed');

        if (!feedTabsId || feedTabsId === 'bottom-tabs') return null;

        const match = Object.entries(document.nodes || {}).find(([, node]) =>
            node.type === 'split'
            && node.orientation === 'vertical'
            && node.children?.includes('heavy-tabs')
            && node.children?.includes(feedTabsId)
        );

        return match ? {feedTabsId, nestedId: match[0]} : null
    }

    /**
     * @param {Object} document
     * @param {String[]} childIds
     * @param {String} orientation
     * @returns {{id: String, node: Object}|null}
     */
    function findSplitWithChildren(document, childIds, orientation) {
        const match = Object.entries(document?.nodes || {}).find(([, node]) =>
            node.type === 'split'
            && node.orientation === orientation
            && childIds.every(childId => node.children?.includes(childId))
        );

        return match ? {id: match[0], node: match[1]} : null
    }

    /**
     * @param {import('@playwright/test').Page} page
     * @param {String} workspaceId
     * @returns {Promise<Object>}
     */
    async function readDocument(app, workspaceId) {
        return (await app.getComponent(workspaceId, ['dockModel'])).dockModel
    }

    /**
     * @param {Object} app
     * @param {Object} ids
     * @returns {Promise<Object>}
     */
    async function readGeometry(page, ids) {
        return page.evaluate(values => Object.fromEntries(Object.entries(values).map(([key, id]) => {
            const rect = document.getElementById(id)?.getBoundingClientRect();

            return [key, rect && {
                bottom: rect.bottom,
                height: rect.height,
                left  : rect.left,
                right : rect.right,
                top   : rect.top,
                width : rect.width,
                x     : rect.x,
                y     : rect.y
            }]
        })), ids)
    }

    /**
     * @param {Object} geometry
     * @param {String} label
     */
    function assertColumnEdges(geometry, label) {
        for (const key of ['feedPane', 'feedTabs', 'heavyPane', 'heavyTabs']) {
            expect(
                Math.abs(geometry[key].left - geometry.column.left),
                `${label}: ${key} left edge follows the nested column`
            ).toBeLessThanOrEqual(1);
            expect(
                Math.abs(geometry[key].right - geometry.column.right),
                `${label}: ${key} right edge follows the nested column`
            ).toBeLessThanOrEqual(1)
        }
    }

    /**
     * @param {Object} geometry
     * @param {String} label
     */
    function assertColumnWidths(geometry, label) {
        for (const key of ['feedPane', 'feedTabs', 'heavyPane', 'heavyTabs']) {
            const tolerance = key.endsWith('Pane') ? 2 : 1;

            expect(
                Math.abs(geometry[key].width - geometry.column.width),
                `${label}: ${key} width follows the nested column`
            ).toBeLessThanOrEqual(tolerance)
        }
    }

    /**
     * @param {import('@playwright/test').Page} page
     * @param {Object} neuralLink
     * @returns {Promise<Object>}
     */
    async function boot(page, neuralLink) {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => {
            const host = document.querySelector('.workstation-dock-host');

            return host?.getBoundingClientRect().height > 300
                && [...document.querySelectorAll('.neo-dashboard-dock-tabs')]
                    .filter(element => element.getClientRects().length)
                    .every(element => element.getBoundingClientRect().width > 100)
        }, {timeout: 60000});

        const
            app         = await neuralLink.connectToApp('Workstation'),
            workspaces  = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
            workspaceId = readId(workspaces);

        expect(workspaceId, 'one live Workstation workspace must exist').toBeTruthy();

        return {app, workspaceId}
    }

    /**
     * @summary Drives one trusted-pointer tab drag into an exact pane-body ratio.
     * @param {import('@playwright/test').Page} page
     * @param {Object} config
     */
    async function dragTabToPoint(page, {placement, sourceTitle, target, targetNodeId, xRatio, yOffset=null, yRatio=null}) {
        const
            source = page.locator('.neo-tab-header-button', {hasText: sourceTitle}).first();

        await expect(source, `${sourceTitle} must be visible before its real drag`).toBeVisible();
        await expect(source, `${sourceTitle} must retain the draggable header contract`).toHaveClass(/neo-draggable/);
        await expect(target, `${sourceTitle} target pane must be the visible retained instance`).toBeVisible();

        let sourceRect, targetRect, armed = false;

        for (let attempt = 0; attempt < 3 && !armed; attempt++) {
            sourceRect = await source.boundingBox();
            targetRect = await target.boundingBox();

            expect(targetRect, `${sourceTitle} target pane must have live geometry`).toBeTruthy();

            await page.mouse.move(sourceRect.x + sourceRect.width / 2, sourceRect.y + sourceRect.height / 2);
            await page.mouse.down();
            await page.waitForTimeout(130); // real Mouse-sensor arming delay, not settlement
            await page.mouse.move(sourceRect.x + sourceRect.width / 2 + 12, sourceRect.y + sourceRect.height / 2, {steps: 4});

            armed = await page.locator('.neo-tab-header-toolbar.neo-is-dragging')
                .waitFor({state: 'visible', timeout: 1200})
                .then(() => true, () => false);

            if (!armed) {
                await page.mouse.up();
                await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging'),
                    `${sourceTitle} failed arm attempt leaves no drag state`).toHaveCount(0)
            }
        }

        expect(armed, `${sourceTitle} opens a real pointer drag session within three clean arms`).toBe(true);
        targetRect = await target.boundingBox();
        expect(targetRect, `${sourceTitle} target stays measurable after drag-start refresh`).toBeTruthy();

        const targetX = targetRect.x + targetRect.width * xRatio,
              targetY = yOffset == null ? targetRect.y + targetRect.height * yRatio : targetRect.y + yOffset;

        await page.mouse.move(targetX, targetY, {steps: 20});
        for (const dx of [2, -2, 1]) {
            await page.mouse.move(targetX + dx, targetY, {steps: 1});
            await page.waitForTimeout(80)
        }
        await expect.poll(() => page.locator('.neo-dock-preview-affordance').evaluateAll(nodes => nodes
            .filter(node => node.getClientRects().length)
            .map(node => {
                const kind = [...node.classList].find(value => value.startsWith('neo-dock-preview-')
                    && !['neo-dock-preview-affordance', 'neo-dock-preview-accepted', 'neo-dock-preview-edge',
                        'neo-dock-preview-region', 'neo-dock-preview-split', 'neo-dock-preview-tab']
                        .includes(value));

                return `${kind?.slice('neo-dock-preview-'.length)}:${node.dataset.dockTarget}`
            })
            .join(',')), {
            message: `${sourceTitle} preview must resolve ${placement} on ${targetNodeId} before release`,
            timeout: 5000
        }).toContain(`${placement}:${targetNodeId}`);
        await page.mouse.up()
    }

    test('both stacked panes follow a real outer resize during preview and after commit', async ({page, neuralLink}) => {
        const {app, workspaceId} = await boot(page, neuralLink),
              heavyBeforeId      = readId(await app.queryComponent({dockNodeId: 'heavy-tabs', ntype: 'tab-container'}, ['id'])),
              feedPaneBeforeId   = await page.locator('.workstation-pane-feed:visible').first().getAttribute('id'),
              heavyPaneBeforeId  = await page.locator('.workstation-pane-alerts:visible').first().getAttribute('id');

        expect(heavyBeforeId, 'the opening Heavy tab group resolves by dock node identity').toBeTruthy();
        expect(feedPaneBeforeId, 'the live Feed pane exposes a retained DOM identity').toBeTruthy();
        expect(heavyPaneBeforeId, 'the live Alerts pane exposes a retained DOM identity').toBeTruthy();

        await dragTabToPoint(page, {
            placement   : 'split-after',
            sourceTitle : '100k Matrix',
            target      : page.locator('.workstation-pane-alerts:visible').first(),
            targetNodeId: 'heavy-tabs',
            xRatio      : 0.999,
            yRatio      : 0.5
        });
        await expect.poll(async () => {
            const document    = await readDocument(app, workspaceId),
                  scaleTabsId = findTabsNode(document, 'scale'),
                  split       = findSplitWithChildren(document, ['heavy-tabs', scaleTabsId], 'horizontal');

            return split?.node.children.indexOf('heavy-tabs') < split?.node.children.indexOf(scaleTabsId) ? split.id : null
        }, {
            message  : 'the first real drop places Matrix right of Heavy',
            timeout  : 15000,
            intervals: [50, 100]
        }).not.toBeNull();
        await expect(page.locator('.workstation-workspace'),
            'the first structural move settles before the second pointer drag')
            .not.toHaveClass(/neo-dashboard-dock-animating/, {timeout: 10000});
        await expect(page.locator('.neo-dock-flip-fixed-stage'),
            'the first structural move leaves no fixed-stage residue').toHaveCount(0);

        await dragTabToPoint(page, {
            placement   : 'edge-top',
            sourceTitle : 'Live Event Stream',
            target      : page.locator(`#${heavyBeforeId}`),
            targetNodeId: 'heavy-tabs',
            xRatio      : 0.5,
            yOffset     : 40
        });

        await page.waitForFunction(() => {
            const
                workspace = document.querySelector('.workstation-workspace'),
                column    = [...document.querySelectorAll('.neo-dashboard-dock-split-vertical')]
                    .find(element => element.querySelector('.workstation-pane-alerts')
                        && element.querySelector('.workstation-pane-feed')),
                outer     = column?.closest('.neo-dashboard-dock-split-horizontal'),
                splitter  = outer && [...outer.children]
                    .find(element => element.classList.contains('neo-dashboard-dock-splitter-horizontal'));

            return Boolean(column && outer && splitter && workspace?.classList.contains('neo-dashboard-dock-animating'))
        }, null, {polling: 5, timeout: 5000});
        await expect(page.locator('.neo-dashboard-dock-drop-indicators')).toHaveClass(/neo-dashboard-dock-drop-indicators-hidden/);

        const ids = await page.evaluate(() => {
            const
                columnRoot = [...document.querySelectorAll('.neo-dashboard-dock-split-vertical')]
                    .find(element => element.querySelector('.workstation-pane-alerts')
                        && element.querySelector('.workstation-pane-feed')),
                outer = columnRoot.closest('.neo-dashboard-dock-split-horizontal');

            let column = columnRoot;

            while (column.parentElement !== outer) column = column.parentElement;

            const
                splitter = [...outer.children]
                    .find(element => element.classList.contains('neo-dashboard-dock-splitter-horizontal')),
                counter = [...outer.children]
                    .find(element => element !== column && element !== splitter),
                feedPane = columnRoot.querySelector('.workstation-pane-feed'),
                heavyPane = columnRoot.querySelector('.workstation-pane-alerts');

            return {
                column   : column.id,
                counter  : counter.id,
                feedPane : feedPane.id,
                feedTabs : feedPane.closest('.neo-dashboard-dock-tabs').id,
                heavyPane: heavyPane.id,
                heavyTabs: heavyPane.closest('.neo-dashboard-dock-tabs').id,
                splitter : splitter.id
            }
        });

        expect(ids, 'the rendered nested column exposes every fast-path geometry participant').toMatchObject({
            column   : expect.any(String),
            counter  : expect.any(String),
            feedPane : expect.any(String),
            feedTabs : expect.any(String),
            heavyPane: expect.any(String),
            heavyTabs: expect.any(String),
            splitter : expect.any(String)
        });

        const
            before      = await readGeometry(page, ids),
            splitterBox = before.splitter,
            sx          = splitterBox.x + splitterBox.width / 2,
            sy          = splitterBox.y + splitterBox.height / 2;

        const
            documentAfterDrop = await readDocument(app, workspaceId),
            nested            = findNestedHeavyFeedColumn(documentAfterDrop),
            scaleTabsId       = findTabsNode(documentAfterDrop, 'scale'),
            outer             = findSplitWithChildren(documentAfterDrop, [nested?.nestedId, scaleTabsId], 'horizontal'),
            beforeBytes       = JSON.stringify(documentAfterDrop);

        expect(nested, 'the second real drop committed Feed above Heavy before splitter motion').not.toBeNull();
        expect(outer, 'the nested column and Matrix share one horizontal outer split').not.toBeNull();

        const nestedSizes = JSON.stringify(documentAfterDrop.nodes[nested.nestedId].sizes);

        await page.mouse.move(sx, sy);
        await page.mouse.down();
        await page.waitForTimeout(105); // measured splitter Mouse-sensor arm, not settlement

        const admission = await page.evaluate(({feedPane, heavyPane}) => ({
            animating: document.querySelector('.workstation-workspace')
                ?.classList.contains('neo-dashboard-dock-animating'),
            panes: [feedPane, heavyPane].map(id => {
                const element = document.getElementById(id),
                      style   = getComputedStyle(element);

                return {
                    fixedStage : element.classList.contains('neo-dock-flip-fixed-stage'),
                    inlineWidth: element.style.width,
                    position   : style.position,
                    width      : element.getBoundingClientRect().width
                }
            })
        }), ids);

        expect(admission.animating, 'MotionSignal is active at the actual splitter admission boundary').toBe(true);
        expect(admission.panes.every(value => value.fixedStage && value.position === 'fixed' && value.inlineWidth),
            `both panes are still fixed-stage immediately before splitter motion: ${JSON.stringify(admission.panes)}`)
            .toBe(true);

        await page.mouse.move(sx + 350, sy, {steps: 4});

        const
            mid            = await readGeometry(page, ids),
            midDocument    = await readDocument(app, workspaceId),
            stageAfterMove = await page.evaluate(({feedPane, heavyPane}) => [feedPane, heavyPane]
                .some(id => document.getElementById(id)?.classList.contains('neo-dock-flip-fixed-stage')), ids);

        expect(stageAfterMove, 'splitter admission lands fixed-stage ownership before live resize').toBe(false);

        await page.mouse.up();

        await expect.poll(async () => {
            const current = await readDocument(app, workspaceId);

            return Math.abs(current.nodes[outer.id].sizes[0] - documentAfterDrop.nodes[outer.id].sizes[0])
        }, {
            message  : `release commits the outer ${outer.id} resize`,
            timeout  : 10000,
            intervals: [50, 100]
        }).toBeGreaterThan(0.02);
        await expect(page.locator('.workstation-workspace')).not.toHaveClass(/neo-dashboard-dock-animating/, {timeout: 10000});
        await expect(page.locator('.neo-dock-flip-fixed-stage'),
            'DockFlip releases every fixed-stage descendant after settlement').toHaveCount(0);

        const
            after         = await readGeometry(page, ids),
            documentAfter = await readDocument(app, workspaceId);

        console.log('[nested-column-diag]', JSON.stringify({after, before, mid}));

        expect(JSON.stringify(midDocument), 'pointer preview keeps the dock document byte-identical').toBe(beforeBytes);
        expect(Math.abs(mid.column.width - before.column.width), 'the real preview changes the nested column width')
            .toBeGreaterThan(100);
        expect(Math.abs(
            (mid.column.width + mid.counter.width) - (before.column.width + before.counter.width)
        ), 'the outer adjacent pair remains conserved during preview').toBeLessThan(1);

        assertColumnWidths(mid,  'mid outer resize');
        assertColumnEdges(after, 'settled outer resize');

        const
            cancelBeforeBytes = JSON.stringify(documentAfter),
            cancelX           = after.splitter.x + after.splitter.width / 2,
            cancelY           = after.splitter.y + after.splitter.height / 2;

        await page.mouse.move(cancelX, cancelY);
        await page.mouse.down();
        await page.waitForTimeout(105); // measured splitter Mouse-sensor arm, not settlement
        await page.mouse.move(cancelX - 180, cancelY, {steps: 4});

        const
            cancelMid         = await readGeometry(page, ids),
            cancelMidDocument = await readDocument(app, workspaceId);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(120); // native cancel delivery before the physical mouseup
        await page.mouse.up();
        await expect.poll(async () => Math.abs((await readGeometry(page, ids)).column.width - after.column.width), {
            message  : 'Escape restores the whole nested column to its committed width',
            timeout  : 5000,
            intervals: [25, 50]
        }).toBeLessThan(1);

        const
            cancelAfter         = await readGeometry(page, ids),
            cancelAfterDocument = await readDocument(app, workspaceId);

        expect(Math.abs(cancelMid.column.width - after.column.width),
            'the reverse-direction cancel arm enters a real live preview').toBeGreaterThan(100);
        assertColumnWidths(cancelMid,   'reverse mid outer resize');
        assertColumnEdges(cancelAfter, 'Escape-restored outer resize');
        expect(JSON.stringify(cancelMidDocument), 'Escape arm mutates no worker document while held').toBe(cancelBeforeBytes);
        expect(JSON.stringify(cancelAfterDocument), 'Escape commits zero operations').toBe(cancelBeforeBytes);

        const
            columnId     = readId(await app.queryComponent({dockNodeId: nested.nestedId, dockNodeType: 'split'}, ['id'])),
            counterId    = readId(await app.queryComponent({dockNodeId: scaleTabsId, ntype: 'tab-container'}, ['id'])),
            feedTabsId   = readId(await app.queryComponent({dockNodeId: nested.feedTabsId, ntype: 'tab-container'}, ['id'])),
            heavyTabsId  = readId(await app.queryComponent({dockNodeId: 'heavy-tabs', ntype: 'tab-container'}, ['id'])),
            splitterId   = readId(await app.queryComponent({dockNodeId: outer.id, ntype: 'dashboard-dock-splitter'}, ['id'])),
            columnState  = await app.getComponent(columnId, ['vdom']),
            counterState = await app.getComponent(counterId, ['vdom']),
            resizeConfig = await app.callMethod(splitterId, 'getResizeConfig');

        expect(heavyTabsId, 'reprojection retains the Heavy tab-container identity').toBe(heavyBeforeId);
        expect(ids.feedPane,  'reprojection retains the live Feed pane identity').toBe(feedPaneBeforeId);
        expect(ids.heavyPane, 'reprojection retains the live Alerts pane identity').toBe(heavyPaneBeforeId);
        expect(feedTabsId, 'the new Feed tabs node remains queryable after settlement').toBeTruthy();
        expect(
            [resizeConfig.targetId, resizeConfig.counterTargetId].sort(),
            'the generic resize descriptor targets the two direct outer layout participants'
        ).toEqual([
            columnState.vdom?.id ?? columnId,
            counterState.vdom?.id ?? counterId
        ].sort());

        expect(JSON.stringify(documentAfter.nodes[nested.nestedId].sizes),
            'resizing the outer split leaves the nested vertical size vector untouched').toBe(nestedSizes);
        expect(documentAfter, 'release changes only the outer split size vector').toEqual({
            ...documentAfterDrop,
            nodes: {
                ...documentAfterDrop.nodes,
                [outer.id]: {...documentAfterDrop.nodes[outer.id], sizes: documentAfter.nodes[outer.id].sizes}
            }
        });
        expect(Math.abs(after.column.width - mid.column.width),
            'semantic settlement preserves the final preview width without a terminal jump').toBeLessThan(1)
    })
});
