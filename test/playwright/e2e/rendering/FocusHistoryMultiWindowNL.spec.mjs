import {expect, readWorkerId, test} from '../../fixtures.mjs';

/**
 * @summary Adds a test-owned text field through the public Neural Link instance creation path.
 * @param {Object} app Identity-bound Neural Link fixture
 * @param {import('@playwright/test').Page} page The field's render target
 * @param {String} id Test-owned component id
 * @returns {Promise<Object>} The input locator and its source window id
 */
async function addField(app, page, id) {
    const viewport = page.locator('.workstation-viewport');

    await expect(viewport).toBeVisible({timeout: 60000});

    const parentId            = await viewport.getAttribute('id'),
          {appName, windowId} = await app.getComponent(parentId, ['appName', 'windowId']);

    await app.createInstance({
        className: 'Neo.form.field.Text',
        parentId,
        config   : {appName, windowId, id, flex: 'none', height: 32, labelText: id, value: id}
    });

    const input = page.locator(`#${id} input`);

    await expect(input).toBeVisible();
    expect((await app.getComponent(id, ['windowId'])).windowId).toBe(windowId);

    return {input, windowId}
}

/**
 * @summary Focuses a real DOM input and waits for the App Worker's corresponding focus state.
 * @param {Object} app Identity-bound Neural Link fixture
 * @param {Object} field The result of addField
 * @param {String} id Test-owned component id
 * @returns {Promise<void>}
 */
async function focusField(app, field, id) {
    await field.input.focus();
    await expect(field.input).toBeFocused();
    await expect.poll(() => app.getComponent(id, ['containsFocus', 'windowId']))
        .toMatchObject({containsFocus: true, windowId: field.windowId})
}

/**
 * @summary Two documents sharing an App Worker retain separate focus histories; closing one removes only its state.
 */
test.describe('Per-window focus history', () => {
    test.setTimeout(120000);

    test('keeps each window history and removes the popup history when its final port leaves', async ({page, neuralLink}) => {
        let popup;

        await page.goto('/apps/workstation/index.html');

        const app = await neuralLink.connectToApp('Workstation');

        expect(await page.evaluate(() => Neo.config.useSharedWorkers)).toBe(true);
        expect(app.sessionId).toBe(await readWorkerId(page, 30000));

        const managers = await app.findInstances({className: 'Neo.manager.Focus'}, ['id']);

        expect(managers).toHaveLength(1);

        const focusId    = managers[0].id,
              firstId    = 'focus-history-main-first',
              nextId     = 'focus-history-main-next',
              popupId    = 'focus-history-popup-field',
              first      = await addField(app, page, firstId),
              next       = await addField(app, page, nextId),
              mainHead   = `history.${first.windowId}.0.componentPath`,
              mainLength = `history.${first.windowId}.length`;

        try {
            [popup] = await Promise.all([
                page.waitForEvent('popup'),
                page.evaluate(() => Boolean(window.open('/apps/workstation/index.html?focus-history-popup', 'focus-history-popup')))
            ]);

            await popup.waitForLoadState('domcontentloaded');
            expect(await readWorkerId(popup, 30000), 'both documents use the same App Worker').toBe(app.sessionId);

            const other        = await addField(app, popup, popupId),
                  popupHead    = `history.${other.windowId}.0.componentPath`,
                  popupLength  = `history.${other.windowId}.length`,
                  popupPending = `pendingFocusOut.${other.windowId}.componentPath`;

            expect(other.windowId).not.toBe(first.windowId);

            await focusField(app, first, firstId);
            await expect.poll(async () => (await app.getComponent(focusId, [mainHead]))[mainHead]).toContain(firstId);

            const beforePopup = await app.getComponent(focusId, [mainHead, mainLength]);

            await focusField(app, other, popupId);
            await expect.poll(async () => (await app.getComponent(focusId, [popupHead]))[popupHead]).toContain(popupId);

            const afterPopup = await app.getComponent(focusId, [mainHead, mainLength, popupLength]);

            expect(afterPopup[mainHead]).toEqual(beforePopup[mainHead]);
            expect(afterPopup[mainLength]).toBe(beforePopup[mainLength]);
            expect(afterPopup[popupLength]).toBeGreaterThan(0);

            await focusField(app, next, nextId);
            await expect.poll(async () => (await app.getComponent(focusId, [mainHead]))[mainHead]).toContain(nextId);
            expect((await app.getComponent(focusId, [popupHead]))[popupHead]).toContain(popupId);

            const beforeClose = await app.getComponent(focusId, [mainLength]);

            await popup.close();

            await expect.poll(async () => {
                const state = await app.getComponent(focusId, [popupHead, popupLength, popupPending]);

                return state[popupHead] === undefined && state[popupLength] === undefined && state[popupPending] === undefined
            }, {message: 'the departed popup has no focus history or pending leave'}).toBe(true);

            const retained = await app.getComponent(focusId, [mainHead, mainLength]);

            expect(retained[mainHead]).toContain(nextId);
            expect(retained[mainLength]).toBeGreaterThanOrEqual(beforeClose[mainLength]);

            await focusField(app, first, firstId);
            await expect.poll(async () => (await app.getComponent(focusId, [mainHead]))[mainHead]).toContain(firstId)
        } finally {
            await popup?.close().catch(() => {})
        }
    })
});
