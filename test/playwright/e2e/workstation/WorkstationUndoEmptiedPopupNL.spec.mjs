import {test, expect} from '../../fixtures.mjs';
import {popOut}       from '../utils/workstationPopOut.mjs';

/**
 * @summary An undo or redo keeps every popup's window in step with its document, so none stays on screen blank.
 *
 * Undoing a pop-out sends the pane home and empties its popup: the replay closes that window within a bound timed
 * from the Undo click, and the redo shows the same pane in a window again. With two popups open, the undo closes
 * only the one it empties, within the same bound. And after a popup is closed natively, its pane comes home as a
 * history row, so the next undo re-opens that popup with its pane while the other keeps its own.
 */
const
    CLOSE_BOUND = 1000, // ms from the Undo click: the emptied window must not stay visible longer
    TAB         = '.neo-tab-header-button',
    asArray     = value => Array.isArray(value) ? value : value ? [value] : [];

test.describe('Workstation — an undo or redo keeps popup windows in step with their documents', () => {
    test.setTimeout(150000);
    test.use({viewport: {height: 900, width: 1600}});

    /**
     * @param {Object} fixtures `{page, neuralLink}`
     * @returns {Promise<Object>} `{app, page, workspaceId}`, the context the shared `popOut` takes
     */
    async function boot({page, neuralLink}) {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-workspace', {timeout: 30000});

        const app         = await neuralLink.connectToApp('Workstation'),
              workspaceId = asArray(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']))[0]?.id;

        expect(workspaceId, 'the page owns a Workspace').toBeTruthy();
        return {app, page, workspaceId}
    }

    /**
     * @param {Object} context `{app, workspaceId}`
     * @param {String} itemId
     * @returns {Promise<String>} A selector for the item's live pane, which keeps its id across windows
     */
    const pane = async ({app, workspaceId}, itemId) => `#${await app.callMethod(workspaceId, 'getPaneIdentity', [itemId])}`;

    /**
     * @param {Object} context `{app, workspaceId}`
     * @returns {Promise<Number>}
     */
    const historyCount = async ({app, workspaceId}) => (await app.callMethod(workspaceId, 'controller.getTopologyState')).historyCount;

    /**
     * @param {Object} page
     * @param {String} name 'Undo' or 'Redo'
     */
    async function history(page, name) {
        await page.locator('.workstation-topologybar').getByRole('button', {name}).click()
    }

    /**
     * Clicks Undo and waits for the popup it empties to close, no later than CLOSE_BOUND after the click.
     * @param {Object} page
     * @param {Object} popup The popup the undo empties
     * @param {Object} testInfo
     */
    async function undoClosing(page, popup, testInfo) {
        const undoAt = Date.now();
        await history(page, 'Undo');
        await expect.poll(() => popup.isClosed(), {message: 'the emptied popup closes', timeout: 15000, intervals: [25]}).toBe(true);

        const closedIn = Date.now() - undoAt;
        testInfo.annotations.push({type: 'undo-to-close-ms', description: String(closedIn)});
        expect(closedIn, `the emptied popup closes within ${CLOSE_BOUND} ms of the Undo`).toBeLessThanOrEqual(CLOSE_BOUND)
    }

    test('undoing a pop-out closes the emptied window within the bound; the redo shows the pane in a window again', async ({page, neuralLink}, testInfo) => {
        const context = await boot({page, neuralLink}),
              metrics = await pane(context, 'metrics');

        await undoClosing(page, (await popOut({...context, itemId: 'metrics'})).popup, testInfo);
        await expect(page.locator(metrics), 'the pane is home').toHaveCount(1, {timeout: 15000});

        const reopened = page.waitForEvent('popup', {timeout: 30000});
        await history(page, 'Redo');
        await expect((await reopened).locator(metrics), 'the redo shows the same pane in a window again').toBeVisible({timeout: 30000});
        await expect(page.locator(metrics)).toHaveCount(0)
    });

    test('with two popups open, the undo closes only the popup it empties, within the bound; the redo shows its pane in a window again', async ({page, neuralLink}, testInfo) => {
        const context = await boot({page, neuralLink}),
              metrics = await pane(context, 'metrics'),
              audit   = await pane(context, 'audit'),
              first   = (await popOut({...context, itemId: 'metrics'})).popup,
              second  = (await popOut({...context, itemId: 'audit'})).popup;

        await undoClosing(page, second, testInfo);
        await expect(page.locator(audit), 'its pane is home').toHaveCount(1, {timeout: 15000});
        expect(first.isClosed(), 'the other popup stays open').toBe(false);
        await expect(first.locator(metrics), 'and keeps its pane').toBeVisible();

        const reopened = page.waitForEvent('popup', {timeout: 30000});
        await history(page, 'Redo');
        await expect((await reopened).locator(audit), 'the redo shows the emptied popup\'s pane in a window again').toBeVisible({timeout: 30000});
        await expect(first.locator(metrics), 'while the other popup keeps its own').toBeVisible()
    });

    test('after a native close returns its pane, the undo re-opens that popup and the other keeps its pane', async ({page, neuralLink}) => {
        const context = await boot({page, neuralLink}),
              metrics = await pane(context, 'metrics'),
              audit   = await pane(context, 'audit'),
              first   = (await popOut({...context, itemId: 'metrics'})).popup,
              second  = (await popOut({...context, itemId: 'audit'})).popup,
              rows    = await historyCount(context);

        // The close a user makes: it runs beforeunload, which the worker reads as the window's departure
        await first.close({runBeforeUnload: true});
        await expect.poll(() => historyCount(context), {message: 'the native close is one history row', timeout: 15000}).toBe(rows + 1);
        await expect(page.locator(metrics), 'that returns the pane').toHaveCount(1, {timeout: 15000});

        const reopened = page.waitForEvent('popup', {timeout: 30000});
        await history(page, 'Undo');

        await expect((await reopened).locator(metrics), 'the undo re-opens the closed popup with its pane').toBeVisible({timeout: 30000});
        await expect(page.locator(metrics)).toHaveCount(0);
        expect(second.isClosed(), 'the other popup is untouched').toBe(false);
        await expect(second.locator(audit), 'and keeps its pane').toBeVisible();

        for (const popup of page.context().pages().filter(other => other !== page && !other.isClosed())) {
            await expect(popup.locator(TAB), 'no open popup is left without a pane').not.toHaveCount(0)
        }
    })
});
