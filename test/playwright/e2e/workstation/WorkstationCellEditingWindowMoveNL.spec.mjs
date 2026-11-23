import {expect, test} from '../../fixtures.mjs';

/**
 * @summary An open cell edit — valid or invalid, focused or unfocused — survives its grid's move to another window.
 *
 * Opens a live cell edit on the 100k Matrix (`scale`) grid in `apps/workstation`, moves the pane into a popup window
 * via `HeaderActions#popOutDockItem` so focus is not blurred away by a UI button click beforehand, and verifies
 * record isolation, session retention, draft preservation, matching `editor.windowId`, pre-move focus inheritance,
 * keyboard terminals (`Enter`, `Escape`, `Tab`), and cell-click commit terminals before and after the transfer.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> NEO_NL_PORT=<free port> \
 *      npx playwright test workstation/WorkstationCellEditingWindowMoveNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
const
    ITEM    = 'scale',
    asArray = value => Array.isArray(value) ? value : (value?.instances ?? value?.items ?? []),
    flatten = entries => asArray(entries).map(entry => ({id: entry.id, ...(entry.properties ?? entry)}));

/**
 * Finds a visible `name` cell near the vertical midpoint of the grid viewport, excluding one record id if provided.
 * @param {import('@playwright/test').Page} target
 * @param {String} gridId
 * @param {String|null} [excludeRecordId=null]
 * @returns {Promise<{id: String, recordId: String}|null>}
 */
async function findVisibleNameCell(target, gridId, excludeRecordId=null) {
    return target.evaluate(({excludeRecordId, gridId}) => {
        const grid = document.getElementById(gridId);

        if (!grid) {
            return null
        }

        const view     = grid.querySelector('.neo-grid-view') || grid,
              viewRect = view.getBoundingClientRect(),
              midY     = viewRect.top + viewRect.height / 2,
              rows     = [...grid.querySelectorAll('[role="row"]')].filter(row => {
                  const b = row.getBoundingClientRect();

                  return b.width > 0 && b.height > 0 && b.top >= viewRect.top + 8 && b.bottom <= viewRect.bottom - 8 &&
                      row.dataset.recordId && row.dataset.recordId !== excludeRecordId &&
                      row.querySelector('[role="gridcell"][data-field="name"]')
              });

        rows.sort((a, b) => {
            const ba = a.getBoundingClientRect(), bb = b.getBoundingClientRect();

            return Math.abs((ba.top + ba.bottom) / 2 - midY) - Math.abs((bb.top + bb.bottom) / 2 - midY)
        });

        const cell = rows[0]?.querySelector('[role="gridcell"][data-field="name"]');

        return cell ? {id: cell.id, recordId: rows[0].dataset.recordId} : null
    }, {excludeRecordId, gridId})
}

/**
 * Finds another visible grid cell (`status`) on a different row so clicking it blurs the active editor naturally.
 * @param {import('@playwright/test').Page} target
 * @param {String} gridId
 * @param {String} excludeRecordId
 * @returns {Promise<{id: String, recordId: String}|null>}
 */
async function findAnotherVisibleCell(target, gridId, excludeRecordId) {
    return target.evaluate(({excludeRecordId, gridId}) => {
        const grid = document.getElementById(gridId);

        if (!grid) {
            return null
        }

        const view     = grid.querySelector('.neo-grid-view') || grid,
              viewRect = view.getBoundingClientRect(),
              row      = [...grid.querySelectorAll('[role="row"]')].find(r => {
                  const b = r.getBoundingClientRect();

                  return b.width > 0 && b.height > 0 && b.top >= viewRect.top + 8 && b.bottom <= viewRect.bottom - 8 &&
                      r.dataset.recordId && r.dataset.recordId !== excludeRecordId &&
                      r.querySelector('[role="gridcell"][data-field="status"]')
              }),
              cell     = row?.querySelector('[role="gridcell"][data-field="status"]');

        return cell ? {id: cell.id, recordId: row.dataset.recordId} : null
    }, {excludeRecordId, gridId})
}

/**
 * @summary Polls a one-shot cell finder until it returns a cell.
 * After a scroll or a window move, the pooled rows render a few frames after `scrollTop` settles,
 * so a single read can land in frames that hold no row.
 * @param {Function} find Returns a cell, or null while no row qualifies
 * @param {String} message Failure message when no cell appears in time
 * @returns {Promise<{id: String, recordId: String}>}
 */
async function waitForCell(find, message) {
    let cell = null;

    await expect.poll(async () => {
        cell = await find();

        return cell
    }, {message, timeout: 10000}).toBeTruthy();

    return cell
}

/**
 * Reads DOM editor inputs inside a grid in a target window and whether DOM focus sits inside each input.
 * @param {import('@playwright/test').Page} target
 * @param {String} gridId
 * @returns {Promise<{editors: Object[], gridInDom: Boolean}>}
 */
async function readDomEditors(target, gridId) {
    return target.evaluate(id => {
        const grid = document.getElementById(id);

        return {
            gridInDom: !!grid,
            editors  : grid ? [...grid.querySelectorAll('.neo-grid-editor input')].map(input => ({
                focused: document.activeElement === input,
                id     : input.id,
                value  : input.value
            })) : []
        }
    }, gridId)
}

/**
 * Reads active cell-editing session configs and its editor component state from the App Worker.
 * @param {Object} app
 * @param {String} pluginId
 * @returns {Promise<{editor: Object|null, session: Object}>}
 */
async function readSessionState(app, pluginId) {
    const session  = await app.getComponent(pluginId, ['session.dataField', 'session.recordId', 'session.editor.id']),
          editorId = session?.['session.editor.id'] ?? null,
          editor   = editorId
              ? await app.getComponent(editorId, ['containsFocus', 'mounted', 'value', 'windowId'])
              : null;

    return {
        editor,
        session: {
            dataField: session?.['session.dataField'] ?? null,
            editorId,
            recordId : session?.['session.recordId'] ?? null
        }
    }
}

/**
 * Boots Workstation, activates `scale`, enables cell editing on `name`, and scrolls down inside the 100k dataset.
 * @param {import('@playwright/test').Page} page
 * @param {Object} neuralLink
 * @param {Object} [options={}]
 * @param {Object|null} [options.editor=null] Optional column editor override
 * @param {String[]} options.consoleErrors Collector for console/page errors
 * @returns {Promise<Object>}
 */
async function setupEditableScaleGrid(page, neuralLink, {consoleErrors, editor=null}) {
    page.on('console', msg => msg.type() === 'error' && consoleErrors.push(`opener: ${msg.text().slice(0, 300)}`));
    page.on('pageerror', err => consoleErrors.push(`opener pageerror: ${String(err).slice(0, 300)}`));

    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.workstation-workspace', {timeout: 60000});
    await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});

    const app         = await neuralLink.connectToApp('Workstation'),
          workspaceId = flatten(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']))[0]?.id,
          focusId     = flatten(await app.findInstances({className: 'Neo.manager.Focus'}, ['id']))[0]?.id,
          {dockModel} = await app.getComponent(workspaceId, ['dockModel']),
          nodeId      = Object.entries(dockModel.nodes || {}).find(([, node]) => node.type === 'tabs' && node.items?.includes(ITEM))?.[0],
          gridId      = await app.callMethod(workspaceId, 'getPaneIdentity', [ITEM]),
          chrome      = await app.callMethod(workspaceId, 'getTabChromeIdentity', [nodeId]);

    expect(workspaceId && focusId && nodeId && gridId && chrome?.buttons?.[ITEM], 'Workstation grid and Focus manager resolve').toBeTruthy();

    await page.locator(`#${chrome.buttons[ITEM]}`).click();
    await expect(page.locator(`#${gridId}`)).toBeVisible({timeout: 15000});
    await page.waitForSelector(`#${gridId} .neo-grid-cell`, {timeout: 30000});

    await app.setProperties(gridId, {cellEditing: true});

    const columnId = (await app.callMethod(gridId, 'columns.get', ['name']))?.id;

    expect(columnId, 'name column resolves').toBeTruthy();
    await app.setProperties(columnId, {editable: true, ...(editor ? {editor} : {})});

    let pluginId = null;

    await expect.poll(async () => {
        pluginId = (await app.callMethod(gridId, 'getPlugin', ['grid-cell-editing']))?.id ?? null;

        return pluginId
    }, {message: 'cell-editing plugin installs', timeout: 15000}).toBeTruthy();

    const {['view.id']: viewId} = await app.getComponent(gridId, ['view.id']),
          openerWindowId        = await page.evaluate(() => Neo.worker.Manager.windowId),
          box                   = await page.locator(`#${gridId}`).boundingBox();

    expect(viewId && openerWindowId && box, 'grid view and windowId resolve').toBeTruthy();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 6000);

    await expect.poll(async () => {
        const engine = await app.getComponent(gridId, ['scrollManager.scrollTop']),
              dom    = await page.evaluate(id => document.getElementById(id)?.scrollTop ?? 0, viewId);

        return engine['scrollManager.scrollTop'] > 1000 && dom > 1000
    }, {message: 'scroll position settles in engine and DOM', timeout: 15000}).toBe(true);

    return {app, chrome, consoleErrors, focusId, gridId, openerWindowId, pluginId, viewId}
}

/**
 * Starts editing a visible `name` cell, types a draft (optional clearing when empty), and asserts active opener session.
 * @param {import('@playwright/test').Page} page
 * @param {Object} ctx
 * @param {String} draft
 * @returns {Promise<{input: import('@playwright/test').Locator, originalName: String, recordId: String}>}
 */
async function startCellDraft(page, {app, gridId, openerWindowId, pluginId}, draft) {
    const targetCell = await waitForCell(() => findVisibleNameCell(page, gridId), 'a visible name cell is found');

    const originalName = (await app.callMethod(gridId, 'store.get', [targetCell.recordId]))?.name ?? null;

    expect(originalName, 'record holds an initial name').toBeTruthy();

    await page.locator(`[id="${targetCell.id}"]`).dblclick();

    const input = page.locator(`#${gridId} .neo-grid-editor input`).first();

    await expect(input, 'editor opens in opener').toBeVisible({timeout: 10000});
    await expect(input, 'editor input is focused before draft entry').toBeFocused();
    await input.fill(draft);
    await expect(input).toHaveValue(draft);

    await expect.poll(() => readSessionState(app, pluginId), {message: 'session and editor focus align in opener'}).toMatchObject({
        editor : {containsFocus: true, mounted: true, value: draft === '' ? null : draft, windowId: openerWindowId},
        session: {dataField: 'name', recordId: targetCell.recordId}
    });

    return {input, originalName, recordId: targetCell.recordId}
}

/**
 * Pops `scale` out programmatically via HeaderActions without stealing editor focus beforehand, then waits for
 * full mount transfer, `FocusManager.pendingFocusOut` expiry on the opener, and scroll retention in the popup.
 * @param {import('@playwright/test').Page} page
 * @param {Object} ctx
 * @returns {Promise<{popup: import('@playwright/test').Page, popupWindowId: String}>}
 */
async function popOutAndSettle(page, {app, consoleErrors, focusId, gridId, openerWindowId, viewId}) {
    const actionsId = flatten(await app.findInstances({className: 'Neo.dashboard.dock.plugin.HeaderActions'}, ['id']))[0]?.id;

    expect(actionsId, 'HeaderActions plugin resolves').toBeTruthy();

    const [popup, popOutResult] = await Promise.all([
        page.waitForEvent('popup', {timeout: 30000}),
        app.callMethod(actionsId, 'popOutDockItem', [{itemId: ITEM, pane: null}])
    ]);

    expect(popOutResult?.errors ?? [], 'popOutDockItem returns no errors').toEqual([]);

    popup.on('console', msg => msg.type() === 'error' && consoleErrors.push(`popup: ${msg.text().slice(0, 300)}`));
    popup.on('pageerror', err => consoleErrors.push(`popup pageerror: ${String(err).slice(0, 300)}`));

    await popup.waitForSelector('.workstation-viewport', {timeout: 30000});
    await expect(page.locator(`#${gridId}`), 'opener releases grid pane').toHaveCount(0, {timeout: 20000});
    await expect(popup.locator(`#${gridId}`), 'popup adopts live grid pane').toBeVisible({timeout: 20000});
    await expect(page.locator('.neo-dashboard-dock-vessel-placeholder'), 'vessel placeholder retires').toHaveCount(0, {timeout: 15000});

    const popupWindowId = await popup.evaluate(() => Neo.worker.Manager.windowId);

    expect(popupWindowId && popupWindowId !== openerWindowId, 'popup windowId differs from opener windowId').toBe(true);

    await expect.poll(() => app.getComponent(gridId, ['windowId', 'mounted']), {
        message: 'grid reports mounted in popup window', timeout: 15000
    }).toEqual({mounted: true, windowId: popupWindowId});

    await expect.poll(async () => {
        const key     = `pendingFocusOut.${openerWindowId}`,
              pending = await app.getComponent(focusId, [key]);

        return pending?.[key] ?? null
    }, {message: 'delayed focusout timer from opener settles', timeout: 10000}).toBe(null);

    await expect.poll(async () => {
        const engine = await app.getComponent(gridId, ['scrollManager.scrollTop']),
              dom    = await popup.evaluate(id => document.getElementById(id)?.scrollTop ?? 0, viewId);

        return engine['scrollManager.scrollTop'] > 1000 && dom > 1000
    }, {message: 'scroll position holds in popup DOM and engine', timeout: 15000}).toBe(true);

    return {popup, popupWindowId}
}

test.describe('Workstation — open cell edit across window move', () => {
    test.setTimeout(180000);
    test.use({viewport: {width: 1600, height: 900}});

    test('valid draft survives move, keeps focus and windowId, commits on Enter, and cell-click commits work before and after', async ({page, neuralLink}) => {
        const consoleErrors           = [],
              ctx                     = await setupEditableScaleGrid(page, neuralLink, {consoleErrors}),
              {app, gridId, pluginId} = ctx;

        // Before the move: clicking another cell still commits a valid draft
        const preCell  = await startCellDraft(page, ctx, 'PRE-MOVE-CLICK'),
              preOther = await waitForCell(() => findAnotherVisibleCell(page, gridId, preCell.recordId), 'another visible cell exists in opener');

        await page.locator(`[id="${preOther.id}"]`).click();

        await expect(page.locator(`#${gridId} .neo-grid-editor`)).toHaveCount(0, {timeout: 10000});
        await expect.poll(async () => (await app.callMethod(gridId, 'store.get', [preCell.recordId]))?.name)
            .toBe('PRE-MOVE-CLICK');

        // Start a valid draft and move the grid to a popup window without clicking away first
        const draft                    = 'VALID-ACROSS-MOVE',
              {originalName, recordId} = await startCellDraft(page, ctx, draft),
              {popup, popupWindowId}   = await popOutAndSettle(page, ctx),
              popupInput               = popup.locator(`#${gridId} .neo-grid-editor input`).first();

        expect((await app.callMethod(gridId, 'store.get', [recordId]))?.name, 'record keeps old value across move').toBe(originalName);

        await expect.poll(() => readSessionState(app, pluginId), {
            message: 'session survives move with matching windowId and focus', timeout: 10000
        }).toMatchObject({
            editor : {containsFocus: true, mounted: true, value: draft, windowId: popupWindowId},
            session: {dataField: 'name', recordId}
        });

        await expect(popupInput).toHaveValue(draft);
        await expect(popupInput, 'moved editor holds DOM focus without clicking').toBeFocused();

        // Enter in the new window commits directly through the existing focus
        await popup.keyboard.press('Enter');

        await expect(popup.locator(`#${gridId} .neo-grid-editor`)).toHaveCount(0, {timeout: 10000});
        await expect.poll(() => readSessionState(app, pluginId)).toMatchObject({session: {recordId: null}});
        await expect.poll(async () => (await app.callMethod(gridId, 'store.get', [recordId]))?.name)
            .toBe(draft);

        // After the move: clicking another cell still commits a valid draft in the popup
        const postCell  = await waitForCell(() => findVisibleNameCell(popup, gridId), 'a visible name cell is found in popup'),
              postOther = await waitForCell(() => findAnotherVisibleCell(popup, gridId, postCell.recordId), 'another visible cell exists in popup');

        await popup.locator(`[id="${postCell.id}"]`).dblclick();

        const postInput = popup.locator(`#${gridId} .neo-grid-editor input`).first();

        await expect(postInput).toBeFocused({timeout: 10000});
        await postInput.fill('POST-MOVE-CLICK');
        await popup.locator(`[id="${postOther.id}"]`).click();

        await expect(popup.locator(`#${gridId} .neo-grid-editor`)).toHaveCount(0, {timeout: 10000});
        await expect.poll(async () => (await app.callMethod(gridId, 'store.get', [postCell.recordId]))?.name)
            .toBe('POST-MOVE-CLICK');

        expect(consoleErrors).toEqual([])
    });

    test('valid draft survives move, keeps focus, and Tab commits and edits next editable cell in the popup', async ({page, neuralLink}) => {
        const consoleErrors            = [],
              ctx                      = await setupEditableScaleGrid(page, neuralLink, {consoleErrors}),
              {app, gridId, pluginId}  = ctx,
              draft                    = 'TAB-ACROSS-MOVE',
              {originalName, recordId} = await startCellDraft(page, ctx, draft),
              {popup, popupWindowId}   = await popOutAndSettle(page, ctx),
              popupInput               = popup.locator(`#${gridId} .neo-grid-editor input`).first();

        expect((await app.callMethod(gridId, 'store.get', [recordId]))?.name).toBe(originalName);
        await expect(popupInput).toHaveValue(draft);
        await expect(popupInput).toBeFocused();

        await popup.keyboard.press('Tab');

        await expect.poll(async () => (await app.callMethod(gridId, 'store.get', [recordId]))?.name, {
            message: 'Tab commits the draft on the original record', timeout: 10000
        }).toBe(draft);

        await expect.poll(() => readSessionState(app, pluginId), {
            message: 'Tab opens next editable cell in popup window with focus', timeout: 10000
        }).toMatchObject({
            editor : {containsFocus: true, mounted: true, windowId: popupWindowId},
            session: {dataField: 'name'}
        });

        const nextSession = await readSessionState(app, pluginId);

        expect(nextSession.session.recordId, 'Tab moved edit session to next record').not.toBe(recordId);
        await expect(popup.locator(`#${gridId} .neo-grid-editor input`).first()).toBeFocused();

        expect(consoleErrors).toEqual([])
    });

    test('valid draft survives move, keeps focus, and Escape cancels without writing to the record', async ({page, neuralLink}) => {
        const consoleErrors            = [],
              ctx                      = await setupEditableScaleGrid(page, neuralLink, {consoleErrors}),
              {app, gridId, pluginId}  = ctx,
              draft                    = 'ESCAPE-ACROSS-MOVE',
              {originalName, recordId} = await startCellDraft(page, ctx, draft),
              {popup}                  = await popOutAndSettle(page, ctx),
              popupInput               = popup.locator(`#${gridId} .neo-grid-editor input`).first();

        await expect(popupInput).toHaveValue(draft);
        await expect(popupInput).toBeFocused();

        await popup.keyboard.press('Escape');

        await expect(popup.locator(`#${gridId} .neo-grid-editor`)).toHaveCount(0, {timeout: 10000});
        await expect.poll(() => readSessionState(app, pluginId)).toMatchObject({session: {recordId: null}});
        expect((await app.callMethod(gridId, 'store.get', [recordId]))?.name).toBe(originalName);

        expect(consoleErrors).toEqual([])
    });

    test('focused invalid draft survives move with focus and windowId, blocks Enter/Tab, and commits once valid', async ({page, neuralLink}) => {
        const consoleErrors            = [],
              ctx                      = await setupEditableScaleGrid(page, neuralLink, {consoleErrors, editor: {required: true}}),
              {app, gridId, pluginId}  = ctx,
              {originalName, recordId} = await startCellDraft(page, ctx, ''),
              {popup, popupWindowId}   = await popOutAndSettle(page, ctx),
              popupInput               = popup.locator(`#${gridId} .neo-grid-editor input`).first();

        expect((await app.callMethod(gridId, 'store.get', [recordId]))?.name).toBe(originalName);

        await expect.poll(() => readSessionState(app, pluginId), {
            message: 'invalid draft survives with matching windowId and focus', timeout: 10000
        }).toMatchObject({
            editor : {containsFocus: true, mounted: true, value: null, windowId: popupWindowId},
            session: {dataField: 'name', recordId}
        });

        await expect(popupInput).toHaveValue('');
        await expect(popupInput).toBeFocused();

        // Invalid draft blocks both Enter and Tab without closing the session
        await popup.keyboard.press('Enter');
        await popup.keyboard.press('Tab');

        await expect(popup.locator(`#${gridId} .neo-grid-editor`)).toHaveCount(1);
        await expect(popupInput).toBeFocused();
        expect((await app.callMethod(gridId, 'store.get', [recordId]))?.name).toBe(originalName);

        // Typing straight into the retained focus recovers and commits via Enter
        await popup.keyboard.type('RECOVERED-REQUIRED');
        await expect(popupInput).toHaveValue('RECOVERED-REQUIRED');
        await popup.keyboard.press('Enter');

        await expect(popup.locator(`#${gridId} .neo-grid-editor`)).toHaveCount(0, {timeout: 10000});
        await expect.poll(async () => (await app.callMethod(gridId, 'store.get', [recordId]))?.name)
            .toBe('RECOVERED-REQUIRED');

        expect(consoleErrors).toEqual([])
    });

    test('unfocused invalid draft survives move with matching windowId without stealing focus', async ({page, neuralLink}) => {
        const consoleErrors                   = [],
              ctx                             = await setupEditableScaleGrid(page, neuralLink, {consoleErrors, editor: {required: true}}),
              {app, chrome, gridId, pluginId} = ctx,
              {originalName, recordId}        = await startCellDraft(page, ctx, '');

        // Move focus out of the grid onto its already-active tab button so the invalid draft stays open without focus
        await page.locator(`#${chrome.buttons[ITEM]}`).click();

        await expect.poll(async () => {
            const state = await readSessionState(app, pluginId),
                  dom   = await readDomEditors(page, gridId);

            return {
                containsFocus: state.editor?.containsFocus,
                domFocused   : dom.editors[0]?.focused ?? null,
                recordId     : state.session.recordId
            }
        }, {message: 'invalid edit loses focus cleanly in opener before move', timeout: 10000}).toEqual({
            containsFocus: false,
            domFocused   : false,
            recordId
        });

        const {popup, popupWindowId} = await popOutAndSettle(page, ctx),
              popupInput             = popup.locator(`#${gridId} .neo-grid-editor input`).first();

        expect((await app.callMethod(gridId, 'store.get', [recordId]))?.name).toBe(originalName);
        await expect(popupInput).toHaveValue('');
        await expect(popupInput, 'unfocused editor stays unfocused in popup').not.toBeFocused();

        await expect.poll(() => readSessionState(app, pluginId), {
            message: 'unfocused invalid draft keeps matching windowId and containsFocus: false', timeout: 10000
        }).toMatchObject({
            editor : {containsFocus: false, mounted: true, windowId: popupWindowId},
            session: {dataField: 'name', recordId}
        });

        expect(consoleErrors).toEqual([])
    })
});
