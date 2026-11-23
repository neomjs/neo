import {expect, test}              from '../../fixtures.mjs';
import {attachPageSharedAppWorker} from '../../sharedWorkerAppWorker.mjs';

const EXAMPLE = '/examples/tooltip/index.html',
      THEMES  = ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-dark', 'neo-theme-light'];

for (const theme of THEMES) {
    test(`${theme}: the second-window board shows its own pointer and keyboard tooltips`, async ({browser, context, page}) => {
        const errors  = [],
              observe = view => {
                  view.on('console', message => {
                      if (message.type() === 'error') errors.push(`${message.location().url}: ${message.text()}`)
                  });
                  view.on('pageerror', error => errors.push(error.message))
              };

        observe(page);
        context.on('page', observe);

        let popup, worker;

        try {
            await page.goto(`${EXAMPLE}?theme=${theme}`);
            await expect(page.locator(`.neo-tooltip-example.${theme}`)).toBeVisible();

            const launcher = page.getByRole('button', {name: 'Open second window'});
            [popup] = await Promise.all([page.waitForEvent('popup'), launcher.click()]);
            await expect(popup.getByText('Sprint 14 · Second window', {exact: true})).toBeVisible();
            await expect(popup.locator(`.neo-tooltip-example.${theme}`)).toBeVisible();
            await expect(popup.getByRole('button', {name: 'Open second window'})).toHaveCount(0);

            const [openerId, popupId] = await Promise.all([page, popup].map(view =>
                view.evaluate(() => Neo.worker.Manager.windowId)));
            expect(popupId).not.toBe(openerId);
            worker = await attachPageSharedAppWorker({browser, page});
            expect(worker).toBeTruthy();
            expect(await worker.evaluate(ids => ids.map(id => Neo.apps[id]?.mainView?.windowId), [openerId, popupId]))
                .toEqual([openerId, popupId]);

            const newTicket = popup.getByRole('button', {name: 'New ticket'}),
                  pointer   = popup.locator('.neo-tooltip').filter({hasText: 'Create a ticket in this sprint'}),
                  keyboard  = popup.locator('.neo-tooltip').filter({hasText: 'Assign the selected ticket to a teammate'});

            await newTicket.hover();
            await expect(pointer).toBeVisible();
            await expect(page.getByText('Create a ticket in this sprint', {exact: true})).toHaveCount(0);

            await newTicket.focus();
            await popup.keyboard.press('Tab');
            const assign = popup.getByRole('button', {name: 'Assign'});
            await expect(assign).toBeFocused();
            await expect(keyboard).toBeVisible();
            await expect(page.getByText('Assign the selected ticket to a teammate', {exact: true})).toHaveCount(0);

            const tooltipId = await keyboard.getAttribute('id'),
                  targetId  = await assign.getAttribute('id');
            expect(await worker.evaluate(id => {
                const tooltip = Neo.get(id);
                return {targetId: tooltip.activeTargetId, windowId: tooltip.windowId, shared: tooltip.isShared}
            }, tooltipId)).toEqual({targetId, windowId: popupId, shared: true});

            await popup.keyboard.press('Escape');
            await expect(keyboard).toBeHidden();

            const closed = popup.waitForEvent('close');
            await popup.close({runBeforeUnload: true});
            await closed;
            await expect.poll(() => worker.evaluate(id => Boolean(Neo.apps[id]), popupId)).toBe(false);

            await page.getByRole('button', {name: 'New ticket'}).hover();
            await expect(page.locator('.neo-tooltip').filter({hasText: 'Create a ticket in this sprint'})).toBeVisible();
            expect(errors).toEqual([])
        } finally {
            context.off('page', observe);
            await worker?.close();
            await popup?.close().catch(() => {})
        }
    })
}
