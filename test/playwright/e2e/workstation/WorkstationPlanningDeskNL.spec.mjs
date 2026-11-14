import {test, expect} from '../../fixtures.mjs';
import {popOut}       from '../utils/workstationPopOut.mjs';

/**
 * @summary Whitebox E2E witness for the Workstation's planning arrangement: one record store across two
 * windows, a cascading release plan, and an arrangement that survives reloads.
 *
 * The arrangement is reached the way a viewer reaches it, through the Planning control in the top bar.
 * The claim under test is the engine's, not the panes': the schedule and the board read ONE store
 * instance, so an edit is one record change that every view in every window shows without wiring. The
 * schedule is therefore popped into its own window before it is edited, and every record is read back
 * from the App Worker's store rather than from the DOM of the window that made the edit.
 *
 * The board pane joins this arrangement with `Neo.board`; until then the card's write is the one
 * `record.set()` its move makes, issued through the schedule's single writer.
 *
 * Requires a Neural Link runtime root:
 *
 *      NEO_AGENTOS_RUNTIME_ROOT=<neo-agent-brain> NEO_NL_PORT=<free port> \
 *      npm run test-e2e -- workstation/WorkstationPlanningDeskNL --workers=1
 *
 * Without it `playwright.config.e2e.mjs` EXCLUDES every neuralLink-fixture spec from selection, so
 * the command selects zero tests and reports success.
 */
const
    CARRIER   = 'neo-topology-identity',
    DAY       = 86_400_000,
    VIEWPORT  = {height: 1000, width: 1600},
    WORKSPACE = 'Workstation.view.Workspace';

/** The Workstation's root Workspace id. */
const workspaceId = async app => {
    const found = await app.findInstances({className: WORKSPACE}, ['id', 'windowId']);

    return (Array.isArray(found) ? found : [found]).map(entry => entry?.id ?? entry?.properties?.id).find(Boolean)
};

/** One record's fields, read from the store instance in the App Worker. */
const readRecord = async (app, storeId, key) => {
    const response = await app.getRecord(key, storeId);

    return response?.record?.data ?? response?.record ?? response?.data ?? response
};

/** A record date as epoch milliseconds, whatever the transport made of the `Date`. */
const time = value => new Date(value).getTime();

/** Boots the Workstation and switches to the planning arrangement through its own control. */
const openPlanningDesk = async (page, neuralLink) => {
    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.workstation-arrangement-switch', {timeout: 60000});

    const app = await neuralLink.connectToApp('Workstation'),
          id  = await workspaceId(app);

    expect(id, 'the Workstation Workspace exists in the App Worker').toBeTruthy();

    await page.getByRole('button', {name: 'Planning'}).click();

    await expect.poll(async () => (await app.getComponent(id, ['activePerspective'])).activePerspective,
        {message: 'the Planning control selects the declared arrangement', timeout: 15000}).toBe('planning');
    await expect.poll(async () => Object.keys((await app.getComponent(id, ['dockModel'])).dockModel.items).sort(),
        {message: 'main shows the planning panes', timeout: 15000}).toEqual(['gantt', 'scheduler']);
    await expect(page.locator('.workstation-pane-scheduler .neo-timeline-bar').first()).toBeVisible({timeout: 30000});
    await expect(page.locator('.workstation-pane-gantt .neo-timeline-bar').first()).toBeVisible({timeout: 30000});

    return {app, id}
};

test.describe('Workstation planning desk (Neural Link)', () => {
    test.setTimeout(180000);
    test.use({viewport: VIEWPORT});

    test('one store across two windows: a card write repaints the popped-out bar, a bar moved there is one record change', async ({page, neuralLink}) => {
        const {app, id} = await openPlanningDesk(page, neuralLink),
              paneId    = await app.callMethod(id, 'getPaneIdentity', ['scheduler']),
              storeId   = (await app.getComponent(id, ['stateProvider.stores.workItems.id']))['stateProvider.stores.workItems.id'];

        expect(storeId, 'the root provider owns the work-item store').toBeTruthy();
        expect((await app.getComponent(paneId, ['eventStore.id']))['eventStore.id'], 'the schedule binds that instance').toBe(storeId);

        const {popup} = await popOut({app, page, workspaceId: id, itemId: 'scheduler'});

        try {
            expect((await app.getComponent(paneId, ['eventStore.id']))['eventStore.id'],
                'the popped-out schedule still reads the same store instance').toBe(storeId);

            // The write a board makes when a card lands in the Done column: one record change
            expect(await app.callMethod(paneId, 'moveEvent', ['wi-9', {fields: {order: 4000, status: 'done'}}])).toBeTruthy();

            const bar = popup.locator('.neo-timeline-bar[data-event-id="wi-9"]');

            await expect(bar, 'the bar in the other window shows the card\'s new column').toHaveAttribute('data-status', 'done', {timeout: 15000});
            await expect(bar).toHaveClass(/neo-scheduler-bar-emerald/);
            expect((await readRecord(app, storeId, 'wi-9')).status).toBe('done');

            // A bar moved in the popped-out schedule, by keyboard: one day later
            const before = await readRecord(app, storeId, 'wi-6');

            await popup.locator('.neo-timeline-bar[data-event-id="wi-6"]').focus();
            await popup.keyboard.press('ArrowRight');

            await expect.poll(async () => time((await readRecord(app, storeId, 'wi-6')).startDate),
                {message: 'the shared record holds the new start', timeout: 15000}).toBe(time(before.startDate) + DAY);
            expect(time((await readRecord(app, storeId, 'wi-6')).endDate), 'and the new end').toBe(time(before.endDate) + DAY);

            // The arrangement survives a reload of either window; the SharedWorker keeps the records.
            // The popup first: an opener reload drops the native handle, and a popup reloaded after it
            // waits for its reconnect lease (README, "Layout controls and persistence").
            await popup.reload();
            await expect(popup.locator(`#${paneId}`), 'the reloaded popup re-adopts the same schedule pane').toBeVisible({timeout: 30000});
            await expect(popup.locator('.neo-timeline-bar[data-event-id="wi-9"]')).toHaveAttribute('data-status', 'done', {timeout: 15000});

            await page.reload();
            await page.waitForSelector('.workstation-arrangement-switch', {timeout: 60000});
            await expect(page.locator('.workstation-pane-gantt .neo-timeline-bar').first()).toBeVisible({timeout: 30000});

            const reloaded = await neuralLink.connectToApp('Workstation'),
                  rootId   = await workspaceId(reloaded);

            expect((await reloaded.getComponent(rootId, ['activePerspective'])).activePerspective).toBe('planning');
            expect(Object.keys((await reloaded.getComponent(rootId, ['dockModel'])).dockModel.items), 'main keeps the plan; the schedule stays out').toEqual(['gantt']);
            await expect(page.getByRole('button', {name: 'Planning'})).toHaveClass(/pressed/);
            await expect(popup.locator(`#${paneId}`), 'the popup keeps the schedule through the opener\'s reload').toBeVisible();
            expect(time((await readRecord(reloaded, storeId, 'wi-6')).startDate), 'the moved bar kept its date').toBe(time(before.startDate) + DAY)
        } finally {
            !popup.isClosed() && await popup.close()
        }
    });

    test('the schedule and the plan share one calendar: weeks line up, no title is cut, a person is one lane', async ({page, neuralLink}) => {
        await openPlanningDesk(page, neuralLink);

        const desk = await page.evaluate(() => Object.fromEntries(['scheduler', 'gantt'].map(itemId => {
            const pane = document.querySelector(`.workstation-pane-${itemId}`);

            return [itemId, {
                // A milestone's bar label has no room by design; every other bar and every tree row shows its whole title
                cut    : [...pane.querySelectorAll('.neo-timeline-bar-label, .neo-tree-content')]
                    .filter(label => label.clientWidth > 0 && label.scrollWidth > label.clientWidth + 1).map(label => label.textContent),
                heights: [...new Set([...pane.querySelectorAll('.neo-timeline-bar')].map(bar => Math.round(bar.getBoundingClientRect().height)))],
                weeks  : [...pane.querySelectorAll('.neo-timeline-header-major > *')].map(tick => {
                    const {left, width} = tick.getBoundingClientRect();
                    return [tick.textContent, Math.round(left), Math.round(width)]
                })
            }]
        })));

        expect(desk.scheduler.weeks.length, 'the schedule shows its weeks').toBeGreaterThan(3);
        expect(desk.scheduler.weeks, 'every week of the schedule stands over the same week of the plan').toEqual(desk.gantt.weeks);
        expect(desk.scheduler.cut, 'no work item\'s title is cut').toEqual([]);
        expect(desk.gantt.cut, 'no task\'s title is cut').toEqual([]);
        expect(desk.scheduler.heights, 'each person\'s row is one lane').toHaveLength(1)
    });

    test('a task moved in the release plan cascades to its linked successor', async ({page, neuralLink}) => {
        const {app, id} = await openPlanningDesk(page, neuralLink),
              storeId   = (await app.getComponent(id, ['stateProvider.stores.planTasks.id']))['stateProvider.stores.planTasks.id'],
              before    = {
                  flow     : await readRecord(app, storeId, 'flow-design'),
                  successor: await readRecord(app, storeId, 'account-design')
              };

        await page.locator('.workstation-pane-gantt .neo-timeline-bar[data-event-id="flow-design"]').focus();
        await page.keyboard.press('ArrowRight');

        await expect.poll(async () => time((await readRecord(app, storeId, 'flow-design')).startDate),
            {message: 'the moved task starts a day later', timeout: 15000}).toBe(time(before.flow.startDate) + DAY);
        await expect.poll(async () => time((await readRecord(app, storeId, 'account-design')).startDate),
            {message: 'its linked successor follows', timeout: 15000}).toBe(time(before.successor.startDate) + DAY)
    });

    test('a cold boot restores the planning arrangement with its popped-out schedule', async ({page, context, baseURL, neuralLink}) => {
        const {app, id} = await openPlanningDesk(page, neuralLink),
              {popup}   = await popOut({app, page, workspaceId: id, itemId: 'scheduler'});

        let cold = null;

        try {
            await expect.poll(async () => (await app.getComponent(id, ['topologyLibrary.dirty']))['topologyLibrary.dirty'],
                {message: 'the auto-save settles', timeout: 15000}).toBe(false);

            // Each reload below is a cold boot: a new context restored from the storage the auto-save wrote,
            // which `page.reload()` cannot show while the SharedWorker keeps the live Workspace
            const carrier      = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || 'null'), CARRIER),
                  storageState = await context.storageState({indexedDB: true});

            cold = await neuralLink.newContext({baseURL, storageState, viewport: VIEWPORT});

            const next = await cold.newPage();

            await next.addInitScript(({key, identity}) => {
                if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(identity))
            }, {key: CARRIER, identity: carrier});
            await next.goto('/apps/workstation/index.html');
            await next.waitForSelector('.workstation-dock-host', {timeout: 60000});

            let workerId;

            await expect.poll(async () => {
                const reply = await next.evaluate(async () => {
                    const appWorker = window.Neo?.worker?.App;
                    return appWorker?.getWorkerId ? await appWorker.getWorkerId() : null
                });
                workerId = typeof reply === 'string' ? reply : reply?.data;
                return typeof workerId === 'string' && workerId.length > 0
            }, {message: 'the cold page\'s App Worker is ready', timeout: 30000}).toBe(true);

            const coldApp = await neuralLink.connectToApp(workerId);

            let coldId;

            await expect.poll(async () => (coldId = await workspaceId(coldApp)) ?? null, {timeout: 15000}).toBeTruthy();
            await expect.poll(async () => (await coldApp.getComponent(coldId, ['activePerspective'])).activePerspective,
                {message: 'the saved arrangement comes back by name', timeout: 15000}).toBe('planning');

            const workspaces = await coldApp.callMethod(coldId, 'getDockTopologyWorkspaces'),
                  owners     = Object.entries(workspaces).filter(([, document]) => document.items?.scheduler).map(([key]) => key);

            expect(Object.keys(workspaces['workstation-main'].items), 'main holds the plan').toEqual(['gantt']);
            expect(owners, 'the schedule is still owned by one window of its own').toHaveLength(1);
            expect(owners[0]).not.toBe('workstation-main')
        } finally {
            await cold?.close();
            !popup.isClosed() && await popup.close()
        }
    })
});
