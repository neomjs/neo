import {test, expect}              from '../../fixtures.mjs';
import {daysLabel}                 from '../../../../apps/workstation/view/planningCalendar.mjs';
import {popOut}                    from '../utils/workstationPopOut.mjs';
import {attachPageSharedAppWorker} from '../../sharedWorkerAppWorker.mjs';

/**
 * @summary Whitebox E2E witness for the Workstation's planning arrangement: one record store across two
 * windows, a cascading release plan, an arrangement that survives reloads, and windows that close when
 * a switch or a reset empties them.
 *
 * The arrangement is reached the way a viewer reaches it, through the Planning control in the top bar.
 * The claim under test is the engine's, not the panes': the board and the schedule read ONE store
 * instance, so an edit is one record change that every view in every window shows without wiring. Each
 * edit is a viewer's gesture, a card dragged or moved by keyboard and a bar moved by keyboard, and every
 * record is read back from the App Worker's store rather than from the DOM of the window that made the edit.
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

/** The workspace keys whose document lists a pane, main's or a window's. */
const holdersOf = async (app, id, itemId) => Object.entries(await app.callMethod(id, 'getDockTopologyWorkspaces'))
    .filter(([, document]) => document?.items?.[itemId]).map(([key]) => key);

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
        {message: 'main shows the planning panes', timeout: 15000}).toEqual(['board', 'gantt', 'scheduler']);
    await expect(page.locator('.workstation-pane-board .neo-board-card').first()).toBeVisible({timeout: 30000});
    await expect(page.locator('.workstation-pane-scheduler .neo-timeline-bar').first()).toBeVisible({timeout: 30000});

    return {app, boardId: await app.callMethod(id, 'getPaneIdentity', ['board']), id}
};

/**
 * Shows the release plan, the board's neighbour tab, above the schedule. The switch is a dock commit whose
 * projection animates the panes it reflows, so this waits until no pane is in motion.
 */
const showPlan = async page => {
    await page.getByRole('tab', {name: 'Release plan'}).click();
    await expect(page.locator('.workstation-pane-gantt .neo-timeline-bar').first()).toBeVisible({timeout: 30000});
    await expect.poll(() => page.evaluate(() => document.getAnimations()
        .filter(animation => animation.playState === 'running' && animation.effect?.target?.closest?.('.workstation-dock-host')).length),
        {message: 'the desk comes to rest after the switch', timeout: 10000}).toBe(0)
};

/** The days a card names for a record, in the calendar's own words. */
const cardDays = record => daysLabel(new Date(record.startDate), new Date(record.endDate));

test.describe('Workstation planning desk (Neural Link)', () => {
    test.setTimeout(180000);
    test.use({viewport: VIEWPORT});

    test('renaming a person updates the painted Board avatar without editing the work item', async ({browser, page, neuralLink}) => {
        const {app, boardId, id} = await openPlanningDesk(page, neuralLink),
              stores             = await app.getComponent(id, ['stateProvider.stores.people.id', 'stateProvider.stores.workItems.id']),
              peopleId           = stores['stateProvider.stores.people.id'],
              workItemsId        = stores['stateProvider.stores.workItems.id'],
              maya               = page.locator(`[id="${boardId}__card__wi-1"] .neo-board-card-avatar`),
              jonas              = page.locator(`[id="${boardId}__card__wi-3"] .neo-board-card-avatar`),
              before             = await readRecord(app, workItemsId, 'wi-1');

        expect((await app.getComponent(boardId, ['people.id']))['people.id']).toBe(peopleId);
        await expect(maya).toHaveAttribute('title', 'Maya Chen');
        await expect(maya).toHaveText('MC');

        const observer = await attachPageSharedAppWorker({browser, page});

        try {
            await observer.evaluate(boardId => {
                Neo.getComponent(boardId).people.get('maya').name = 'Zara Vale'
            }, boardId);
            await expect(maya).toHaveAttribute('title', 'Zara Vale');
            await expect(maya).toHaveText('ZV');

            await observer.evaluate(boardId => {
                Neo.getComponent(boardId).people.updateRows([{key: 'maya', values: {name: 'Avery Stone'}}])
            }, boardId);
            await expect(maya).toHaveAttribute('title', 'Avery Stone');
            await expect(maya).toHaveText('AS');
            await expect(jonas).toHaveAttribute('title', 'Jonas Berg');
            await expect(jonas).toHaveText('JB');
            expect(await readRecord(app, workItemsId, 'wi-1')).toEqual(before)
        } finally {
            await observer.close()
        }
    });

    test('a card released over the schedule stays put; returning to a collapsed board column commits once', async ({browser, page, neuralLink}) => {
        const {app, boardId, id} = await openPlanningDesk(page, neuralLink),
              storeId            = (await app.getComponent(id, ['stateProvider.stores.workItems.id']))['stateProvider.stores.workItems.id'],
              card               = page.locator(`[id="${boardId}__card__wi-9"]`),
              done               = page.locator(`[id="${boardId}__col__done"]`),
              schedule           = page.locator('.workstation-pane-scheduler'),
              bar                = schedule.locator('.neo-timeline-bar[data-event-id="wi-9"]'),
              before             = await readRecord(app, storeId, 'wi-9'),
              observer           = await attachPageSharedAppWorker({browser, page});

        try {
            await observer.evaluate(boardId => {
                const board = Neo.getComponent(boardId), events = globalThis.planningBoardDropEvents = [];
                board.on('cardMove', ({record, to}) => events.push(`${record.id}:${to.status}`));
                board.sortZone.on('dragEnd', () => events.push('end'))
            }, boardId);
            const events = () => observer.evaluate(() => globalThis.planningBoardDropEvents);

            // Cross columns only after leaving the Board. The Scheduler remains under the pointer until
            // the second gesture deliberately re-enters the Done header.
            const drag = async returnToBoard => {
                const from   = await card.boundingBox(),
                      header = await done.locator('.neo-board-column-header').boundingBox(),
                      track  = await bar.boundingBox(),
                      startX = from.x + from.width / 2, startY = from.y + from.height / 2,
                      endX   = header.x + header.width / 2, outsideY = track.y + track.height / 2;

                expect(await schedule.evaluate((node, {x, y}) => node.contains(document.elementFromPoint(x, y)),
                    {x: endX, y: outsideY}), 'released at a Scheduler point beneath Done').toBe(true);
                await page.mouse.move(startX, startY);
                await page.mouse.down();
                await page.mouse.move(startX + 16, startY, {steps: 4});
                await expect(page.locator('.neo-dragproxy')).toBeVisible();
                await page.mouse.move(startX + 16, outsideY, {steps: 16});
                await page.mouse.move(endX, outsideY, {steps: 16});
                if (returnToBoard) await page.mouse.move(endX, header.y + header.height / 2, {steps: 12});
                await page.mouse.up()
            };

            await drag(false);
            await expect.poll(events).toContain('end');
            expect(await events(), 'the Board completed the rejected drop without moving a card').toEqual(['end']);
            expect(await readRecord(app, storeId, 'wi-9'), 'status, order, resource and dates stayed with the original booking').toEqual(before);
            await expect(bar).toHaveAttribute('data-status', 'ready');

            await done.locator('.neo-board-column-collapse').click();
            await expect(done).toHaveClass(/neo-board-column-collapsed/);
            await drag(true);
            await expect.poll(events).toEqual(['end', 'wi-9:done', 'end']);
            expect(await readRecord(app, storeId, 'wi-9')).toMatchObject({
                status: 'done', resourceId: before.resourceId, startDate: before.startDate, endDate: before.endDate
            });
            await expect(bar).toHaveAttribute('data-status', 'done')
        } finally {
            await observer.close()
        }
    });

    test('in one window: a card dragged to another column is one record change its bar shows, a bar moved is one its card shows', async ({page, neuralLink}) => {
        const {app, boardId, id} = await openPlanningDesk(page, neuralLink),
              paneId             = await app.callMethod(id, 'getPaneIdentity', ['scheduler']),
              storeId            = (await app.getComponent(id, ['stateProvider.stores.workItems.id']))['stateProvider.stores.workItems.id'],
              cardId             = `${boardId}__card__wi-9`;

        expect(storeId, 'the root provider owns the work-item store').toBeTruthy();
        expect((await app.getComponent(boardId, ['store.id']))['store.id'], 'the board binds that instance').toBe(storeId);
        expect((await app.getComponent(paneId, ['eventStore.id']))['eventStore.id'], 'and so does the schedule').toBe(storeId);

        // Enter Done, then release in the gutter. The preview is the slot the board commits.
        const from = await page.locator(`[id="${cardId}"]`).boundingBox(),
              done = page.locator(`[id="${boardId}__col__done"]`),
              to   = await done.boundingBox(),
              bar  = page.locator('.workstation-pane-scheduler .neo-timeline-bar[data-event-id="wi-9"]');

        await expect(bar).toHaveAttribute('data-status', 'ready');

        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, {steps: 4});
        await page.mouse.move(to.x + to.width / 2, to.y + 60, {steps: 16});
        await expect(done.locator('.neo-board-card-slot')).toHaveCount(1);
        const adjacent = await page.locator(`[id="${boardId}__col__review"]`).boundingBox(),
              current  = await done.boundingBox(),
              gapX     = (adjacent.x + adjacent.width + current.x) / 2;
        expect(gapX).toBeGreaterThan(adjacent.x + adjacent.width);
        expect(gapX).toBeLessThan(current.x);
        await page.mouse.move(gapX, current.y + 60);
        await expect(done.locator('.neo-board-card-slot')).toHaveCount(1);
        await page.mouse.up();

        await expect.poll(async () => (await readRecord(app, storeId, 'wi-9')).status,
            {message: 'the drop is the record\'s new status', timeout: 15000}).toBe('done');
        await expect(page.locator(`[id="${boardId}__col__done"] [id="${cardId}"]`), 'the card sits in Done').toBeVisible();
        await expect(bar, 'the schedule\'s bar for that record shows it').toHaveAttribute('data-status', 'done', {timeout: 15000});
        await expect(bar).toHaveClass(/neo-scheduler-bar-emerald/);

        // A bar moved in the schedule, by keyboard: one day later
        const before = await readRecord(app, storeId, 'wi-9');

        await expect(page.locator(`[id="${cardId}"] .workstation-card-days`)).toHaveText(cardDays(before));

        await bar.focus();
        await page.keyboard.press('ArrowRight');

        await expect.poll(async () => time((await readRecord(app, storeId, 'wi-9')).startDate),
            {message: 'the record holds the new start', timeout: 15000}).toBe(time(before.startDate) + DAY);
        await expect(page.locator(`[id="${cardId}"] .workstation-card-days`), 'the card shows the new days')
            .toHaveText(cardDays(await readRecord(app, storeId, 'wi-9')));
        await expect(page.locator(`[id="${boardId}__col__done"] [id="${cardId}"]`), 'and stays in its column').toBeVisible()
    });

    test('one store across two windows: a card moved on the board repaints its bar in the schedule\'s window, a bar moved there changes the card\'s days', async ({page, neuralLink}) => {
        const {app, boardId, id} = await openPlanningDesk(page, neuralLink),
              paneId             = await app.callMethod(id, 'getPaneIdentity', ['scheduler']),
              storeId            = (await app.getComponent(id, ['stateProvider.stores.workItems.id']))['stateProvider.stores.workItems.id'],
              {popup}            = await popOut({app, page, workspaceId: id, itemId: 'scheduler'});

        try {
            expect((await app.getComponent(paneId, ['eventStore.id']))['eventStore.id'],
                'the popped-out schedule still reads the board\'s store instance').toBe(storeId);

            // A Ready card moved by keyboard in the main window, one column to the right
            await page.locator(`[id="${boardId}__card__wi-9"]`).click();
            await page.keyboard.press('Control+ArrowRight');

            await expect.poll(async () => (await readRecord(app, storeId, 'wi-9')).status,
                {message: 'the card move is the record\'s new status', timeout: 15000}).toBe('in-progress');

            const bar = popup.locator('.neo-timeline-bar[data-event-id="wi-9"]');

            await expect(bar, 'the bar in the other window shows the card\'s new column').toHaveAttribute('data-status', 'in-progress', {timeout: 15000});
            await expect(bar).toHaveClass(/neo-scheduler-bar-amber/);

            // A bar moved in the popped-out schedule, by keyboard: one day later
            const before = await readRecord(app, storeId, 'wi-6'),
                  days   = page.locator(`[id="${boardId}__card__wi-6"] .workstation-card-days`);

            await expect(days).toHaveText(cardDays(before));

            await popup.locator('.neo-timeline-bar[data-event-id="wi-6"]').focus();
            await popup.keyboard.press('ArrowRight');

            await expect.poll(async () => time((await readRecord(app, storeId, 'wi-6')).startDate),
                {message: 'the shared record holds the new start', timeout: 15000}).toBe(time(before.startDate) + DAY);
            expect(time((await readRecord(app, storeId, 'wi-6')).endDate), 'and the new end').toBe(time(before.endDate) + DAY);
            await expect(days, 'the card in the main window shows the new days').toHaveText(cardDays(await readRecord(app, storeId, 'wi-6')));

            // The arrangement survives a reload of either window; the SharedWorker keeps the records.
            // The popup first: an opener reload drops the native handle, and a popup reloaded after it
            // waits for its reconnect lease (README, "Layout controls and persistence").
            await popup.reload();
            await expect(popup.locator(`#${paneId}`), 'the reloaded popup re-adopts the same schedule pane').toBeVisible({timeout: 30000});
            await expect(popup.locator('.neo-timeline-bar[data-event-id="wi-9"]')).toHaveAttribute('data-status', 'in-progress', {timeout: 15000});

            await page.reload();
            await page.waitForSelector('.workstation-arrangement-switch', {timeout: 60000});
            await expect(page.locator(`[id="${boardId}__col__in-progress"] [id="${boardId}__card__wi-9"]`),
                'the reloaded main window shows the moved card in its new column').toBeVisible({timeout: 30000});

            const reloaded = await neuralLink.connectToApp('Workstation'),
                  rootId   = await workspaceId(reloaded);

            expect((await reloaded.getComponent(rootId, ['activePerspective'])).activePerspective).toBe('planning');
            expect(Object.keys((await reloaded.getComponent(rootId, ['dockModel'])).dockModel.items).sort(),
                'main keeps the board and the plan; the schedule stays out').toEqual(['board', 'gantt']);
            await expect(page.getByRole('button', {name: 'Planning'})).toHaveClass(/pressed/);
            await expect(popup.locator(`#${paneId}`), 'the popup keeps the schedule through the opener\'s reload').toBeVisible();
            await expect(days, 'the card kept the moved bar\'s days').toHaveText(cardDays(await readRecord(reloaded, storeId, 'wi-6')));
            expect(time((await readRecord(reloaded, storeId, 'wi-6')).startDate), 'the moved bar kept its date').toBe(time(before.startDate) + DAY)
        } finally {
            !popup.isClosed() && await popup.close()
        }
    });

    test('the schedule and the plan share one calendar: weeks line up, no title is cut, a person is one lane', async ({page, neuralLink}) => {
        await openPlanningDesk(page, neuralLink);
        await showPlan(page);

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

        await showPlan(page);
        await page.locator('.workstation-pane-gantt .neo-timeline-bar[data-event-id="flow-design"]').focus();
        await page.keyboard.press('ArrowRight');

        await expect.poll(async () => time((await readRecord(app, storeId, 'flow-design')).startDate),
            {message: 'the moved task starts a day later', timeout: 15000}).toBe(time(before.flow.startDate) + DAY);
        await expect.poll(async () => time((await readRecord(app, storeId, 'account-design')).startDate),
            {message: 'its linked successor follows', timeout: 15000}).toBe(time(before.successor.startDate) + DAY)
    });

    test('a switch closes the windows of the arrangement it leaves: none stays blank, none docks into the next', async ({page, neuralLink}) => {
        const {app, id}   = await openPlanningDesk(page, neuralLink),
              {popup}     = await popOut({app, page, workspaceId: id, itemId: 'scheduler'}),
              [vesselKey] = await holdersOf(app, id, 'scheduler');

        let again = null, reopened = null;

        /** Switches to the operations room and waits for the window the switch empties to close. */
        const showOperations = async vessel => {
            await page.getByRole('button', {name: 'Operations'}).click();

            await expect.poll(() => vessel.isClosed(), {message: 'the schedule\'s window closes with the planning desk', timeout: 15000}).toBe(true);
            await expect.poll(async () => (await app.getComponent(id, ['activePerspective'])).activePerspective,
                {message: 'the operations room is up', timeout: 15000}).toBe('shipped');
            expect(await holdersOf(app, id, 'scheduler'), 'no room and no window holds the schedule').toEqual([]);
        };

        try {
            await showOperations(popup);

            // Undo brings the planning desk back, its window included
            const reborn = page.waitForEvent('popup', {timeout: 30000});

            await page.locator('.workstation-topologybar').getByRole('button', {name: 'Undo'}).click();
            reopened = await reborn;

            await expect(reopened.locator('.workstation-pane-scheduler .neo-timeline-bar').first(), 'undo re-opens the schedule\'s window')
                .toBeVisible({timeout: 30000});
            expect(await holdersOf(app, id, 'scheduler')).toEqual([vesselKey]);

            await showOperations(reopened);

            // Back on the planning desk, the schedule is in main and pops out into a window of its own again
            await page.getByRole('button', {name: 'Planning'}).click();

            await expect.poll(() => holdersOf(app, id, 'scheduler'), {message: 'the planning desk lists the schedule in main', timeout: 15000})
                .toEqual(['workstation-main']);
            await expect(page.locator('.workstation-pane-scheduler .neo-timeline-bar').first()).toBeVisible({timeout: 30000});

            again = (await popOut({app, page, workspaceId: id, itemId: 'scheduler'})).popup;

            await expect(again.locator('.workstation-pane-scheduler .neo-timeline-bar').first(), 'the new window shows the schedule')
                .toBeVisible({timeout: 30000});
            expect(await holdersOf(app, id, 'scheduler'), 'in the workspace its first window had').toEqual([vesselKey]);
            expect(Object.keys(await app.callMethod(id, 'getDockTopologyWorkspaces')), 'so no emptied workspace piles up beside it')
                .toHaveLength(2)
        } finally {
            for (const vessel of [popup, reopened, again]) vessel && !vessel.isClosed() && await vessel.close()
        }
    });

    test('Reset to default closes the window it empties, and undo re-opens one around the same pane', async ({page, neuralLink}) => {
        const {app, id}   = await openPlanningDesk(page, neuralLink),
              paneId      = await app.callMethod(id, 'getPaneIdentity', ['scheduler']),
              {popup}     = await popOut({app, page, workspaceId: id, itemId: 'scheduler'}),
              [vesselKey] = await holdersOf(app, id, 'scheduler');

        let reopened = null;

        try {
            await page.getByRole('button', {name: 'Reset to default', exact: true}).click();

            await expect.poll(() => popup.isClosed(), {message: 'the window the reset emptied closes', timeout: 15000}).toBe(true);
            await expect(page.locator(`#${paneId}`), 'the same schedule pane is home in main').toBeVisible({timeout: 15000});
            expect(await holdersOf(app, id, 'scheduler')).toEqual(['workstation-main']);

            const reborn = page.waitForEvent('popup', {timeout: 30000});

            await page.locator('.workstation-topologybar').getByRole('button', {name: 'Undo'}).click();
            reopened = await reborn;

            await expect(reopened.locator(`#${paneId}`), 'undo re-opens a window around the same pane').toBeVisible({timeout: 30000});
            await expect(page.locator(`#${paneId}`)).toHaveCount(0);
            expect(await holdersOf(app, id, 'scheduler'), 'and the schedule is its window\'s again').toEqual([vesselKey])
        } finally {
            !popup.isClosed() && await popup.close();
            reopened && !reopened.isClosed() && await reopened.close()
        }
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

            expect(Object.keys(workspaces['workstation-main'].items).sort(), 'main holds the board and the plan').toEqual(['board', 'gantt']);
            expect(owners, 'the schedule is still owned by one window of its own').toHaveLength(1);
            expect(owners[0]).not.toBe('workstation-main')
        } finally {
            await cold?.close();
            !popup.isClosed() && await popup.close()
        }
    })
});
