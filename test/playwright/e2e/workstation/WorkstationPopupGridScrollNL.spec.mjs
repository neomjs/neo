import {test, expect} from '../../fixtures.mjs';
import {popOut}       from '../utils/workstationPopOut.mjs';

/**
 * @summary A grid that a dock gesture hides or moves keeps the scroll position its user left.
 *
 * A browser resets the offsets of a scroll container that stops being laid out (the inactive card of a tab stack)
 * or moves in the DOM, and fires no scroll event. The 100k Matrix grid in a popup kept its engine position while
 * its DOM went back to the origin: its bodies rendered the rows and columns of that position into a viewport that
 * showed the origin, so the grid read as empty. Each arm scrolls the popped-out grid down and to the far right,
 * re-projects the popup, and waits for the DOM to hold the engine's position again with cells painted inside the
 * viewport.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> NEO_NL_PORT=<free port> \
 *      npx playwright test WorkstationPopupGridScrollNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation — a grid in a popup across dock gestures', () => {
    test.setTimeout(180000);

    test('the Matrix grid keeps its scroll position through a tab switch and a split in its popup', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-workspace', {timeout: 60000});

        const app     = await neuralLink.connectToApp('Workstation'),
              found   = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              wsId    = (Array.isArray(found) ? found[0] : found)?.id ?? found?.[0]?.properties?.id,
              gridId  = await app.callMethod(wsId, 'getPaneIdentity', ['scale']),
              {popup} = await popOut({app, page, workspaceId: wsId, itemId: 'scale'}),
              ids     = await app.getComponent(gridId, ['horizontalScrollbar.id', 'view.id']),
              barId   = ids['horizontalScrollbar.id'],
              viewId  = ids['view.id'],
              // The engine's position, the DOM's, and whether any cell is painted inside the popup's viewport
              readPair = async () => {
                  const engine = await app.getComponent(gridId, ['scrollManager.scrollLeft', 'scrollManager.scrollTop']),
                        dom    = await popup.evaluate(({barId, viewId}) => {
                            const inside = [...document.querySelectorAll('.neo-grid-cell')].some(cell => {
                                const rect = cell.getBoundingClientRect();

                                return getComputedStyle(cell).display !== 'none' && rect.width > 0 &&
                                    rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight
                            });

                            return {cells: inside, left: document.getElementById(barId)?.scrollLeft, top: document.getElementById(viewId)?.scrollTop}
                        }, {barId, viewId});

                  return {cells: dom.cells, dom: [dom.left, dom.top], engine: [engine['scrollManager.scrollLeft'], engine['scrollManager.scrollTop']]}
              },
              popupKey = (await app.findInstances({className: 'Neo.dashboard.dock.window.Participation'}, ['workspaceId']))
                  .map(entry => (entry.properties ?? entry).workspaceId).find(id => id && id !== 'workstation-main'),
              document = await app.callMethod(wsId, 'getWorkspaceDocument', [popupKey]),
              stackId  = Object.entries(document.nodes).find(([, node]) => node.type === 'tabs' && node.items?.includes('scale'))?.[0],
              transfer = (itemId, target) => app.callMethod(wsId, 'commitCrossWindowTransfer', [{
                  sourceWorkspaceId: 'workstation-main', targetWorkspaceId: popupKey,
                  descriptor       : {operation: 'transferItem', itemId, sourceWorkspaceId: 'workstation-main', targetWorkspaceId: popupKey, target}
              }]);

        expect(barId && viewId && stackId, 'the popped-out grid and its stack resolve').toBeTruthy();
        await popup.waitForSelector('.neo-grid-cell', {timeout: 30000});

        // Down and to the far right, through the DOM elements the bodies follow
        const far = await popup.evaluate(({barId, viewId}) => {
            const bar = document.getElementById(barId), view = document.getElementById(viewId);

            bar.scrollLeft = bar.scrollWidth;
            view.scrollTop = 5000;

            return [bar.scrollLeft, view.scrollTop]
        }, {barId, viewId});

        expect(far[0], 'the popup is narrower than the grid').toBeGreaterThan(0);
        await expect.poll(readPair, {message: 'the scroll reaches the engine', timeout: 15000}).toEqual({cells: true, dom: far, engine: far});

        // A second tab joins the stack, then the Matrix tab is clicked: its card is hidden and shown again
        expect(await transfer('metrics', {operation: 'addTab', tabsNodeId: stackId}), 'Metrics joins the stack').toBe(true);
        await expect(popup.locator('.neo-tab-header-button', {hasText: 'Metrics'})).toHaveCount(1, {timeout: 15000});
        await popup.locator('.neo-tab-header-button', {hasText: '100k Matrix'}).click();

        await expect.poll(readPair, {message: 'the shown-again grid holds its position, with cells in sight', timeout: 15000})
            .toEqual({cells: true, dom: far, engine: far});

        // A split beside the stack moves the grid in the DOM
        expect(await transfer('audit', {operation: 'splitNode', itemId: 'audit', targetNodeId: stackId, orientation: 'horizontal', position: 'after', sizes: [0.5, 0.5]}),
            'Audit splits in beside it').toBe(true);
        await expect(popup.locator('.neo-tab-header-button', {hasText: 'Audit'})).toHaveCount(1, {timeout: 15000});

        await expect.poll(async () => {
            const pair = await readPair();

            return {agree: pair.dom[0] === pair.engine[0] && pair.dom[1] === pair.engine[1], cells: pair.cells, moved: pair.engine[0] > 0 && pair.engine[1] > 0}
        }, {message: 'the moved grid holds its position, with cells in sight', timeout: 15000}).toEqual({agree: true, cells: true, moved: true})
    })
});
