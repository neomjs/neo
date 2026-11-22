import {test, expect}              from '../../fixtures.mjs';
import {attachPageSharedAppWorker} from '../../sharedWorkerAppWorker.mjs';

const URL = '/examples/dashboard/planning/index.html',
      DAY = 86_400_000;

/** @summary Uses the actual tab action to move a resident pane into its default tear-out window. */
async function popOut(page, context, title, key, selector) {
    const header = page.locator('.neo-tab-header-toolbar').filter({
        has: page.getByRole('tab', {name: title, exact: true})
    });
    await header.getByRole('tab', {name: title, exact: true}).click();
    const action = header.locator('.neo-toolbar-action:has(.fa-window-restore)').filter({visible: true});
    await expect(action).toHaveCount(1);
    const [popup] = await Promise.all([context.waitForEvent('page'), action.click()]);
    await popup.waitForURL(new RegExp(`[?&]tearout=${key}(?:&|$)`));
    await expect(popup.locator(selector)).toBeVisible();
    return popup
}

test.describe('One plan in three windows', () => {
    test.setTimeout(120000);

    test('a physical schedule drag updates the same task, successor and card across three windows and returns their panes', async ({page, context, browser}) => {
        await page.setViewportSize({width: 1600, height: 1000});
        await page.goto(`${URL}?theme=neo-theme-neo-dark`);
        await expect(page.locator('.planning-workspace')).toBeVisible();
        await expect(page.locator('.planning-board .planning-card-dates').first()).toHaveCount(1);
        const worker = await attachPageSharedAppWorker({browser, page});
        expect(worker).toBeTruthy();
        let schedule, gantt, scheduleWorker, ganttWorker;
        try {
            const initial = await worker.evaluate(() => {
                const ws       = Neo.manager.Instance.find({className: 'Neo.examples.dashboard.planning.Workspace'})[0],
                      provider = ws.getStateProvider(),
                      tasks    = provider.getStore('tasks'),
                      booking  = tasks.getBookingStore(),
                      panes    = Object.fromEntries(['scheduler', 'gantt', 'board'].map(key => [key, ws.getPlanPane(key)])),
                      lighting = tasks.get('lighting'),
                      sound    = tasks.get('sound'),
                      labels   = tasks.get('labels'),
                      witness  = {ws, tasks, booking, panes, lighting, sound, labels, lightingChanges: 0, soundChanges: 0, events: 0};
                witness.dates = record => ({
                    start   : record.startDate.getTime(),
                    end     : record.endDate.getTime(),
                    resource: record.resourceId
                });
                witness.onRecordChange = ({record}) => {
                    if (record === lighting) witness.lightingChanges++;
                    if (record === sound) witness.soundChanges++
                };
                witness.onEventChange = () => witness.events++;
                tasks.on('recordChange', witness.onRecordChange);
                panes.scheduler.on('eventChange', witness.onEventChange);
                globalThis.__planningWitness = witness;
                return {
                    paneIds: Object.fromEntries(Object.entries(panes).map(([key, pane]) => [key, pane.id])),
                    same   : booking.get('lighting') === lighting && panes.gantt.store === tasks &&
                        panes.scheduler.eventStore === booking && panes.board.store === booking,
                    lighting: witness.dates(lighting),
                    sound   : witness.dates(sound),
                    labels  : witness.dates(labels)
                }
            });
            expect(initial.same).toBe(true);
            expect(initial.lighting).toEqual({start:Date.parse('2026-11-11T00:00:00Z'),end:Date.parse('2026-11-13T00:00:00Z'),resource:'mara'});
            expect(initial.sound).toEqual({start:Date.parse('2026-11-13T00:00:00Z'),end:Date.parse('2026-11-16T00:00:00Z'),resource:'noor'});

            schedule = await popOut(page, context, 'Scheduler', 'scheduler', '.planning-scheduler');
            gantt = await popOut(page, context, 'Gantt', 'gantt', '.planning-gantt');
            scheduleWorker = await attachPageSharedAppWorker({browser, page: schedule});
            ganttWorker = await attachPageSharedAppWorker({browser, page: gantt});
            expect([scheduleWorker?.targetId, ganttWorker?.targetId]).toEqual([worker.targetId, worker.targetId]);
            const windows = await Promise.all([page, schedule, gantt].map(async view => {
                const cdp = await context.newCDPSession(view);
                try {
                    return (await cdp.send('Browser.getWindowForTarget')).windowId
                } finally {
                    await cdp.detach()
                }
            }));
            expect(new Set(windows).size).toBe(3);
            const windowIds = await Promise.all([page, schedule, gantt].map(view =>
                view.evaluate(() => Neo.worker.Manager.windowId)));
            const paneWindows = await worker.evaluate(() => {
                const {panes} = globalThis.__planningWitness;
                return [panes.board.windowId, panes.scheduler.windowId, panes.gantt.windowId]
            });
            expect(paneWindows).toEqual(windowIds);

            const scheduleBar = schedule.locator('.planning-scheduler .neo-timeline-bar[data-event-id="lighting"]'),
                  ganttBar    = gantt.locator('.planning-gantt .neo-timeline-bar[data-event-id="lighting"]'),
                  boardCard   = page.locator('.planning-board .neo-board-card').filter({hasText:'Focus lighting'}),
                  cardDates   = boardCard.locator('.planning-card-dates');
            await expect(scheduleBar).toHaveAttribute('data-resource-id','mara');
            await expect(schedule.locator('.planning-scheduler .neo-timeline-bar[data-event-id="sound"]')).toHaveAttribute('data-resource-id','noor');
            await expect(ganttBar).toBeVisible();
            const beforeBox = await ganttBar.boundingBox(), beforeText = await cardDates.textContent(),
                  box       = await scheduleBar.boundingBox(),
                  dayWidth  = (await schedule.locator('.neo-timeline-tick-minor[data-date^="2026-11-11"]').boundingBox()).width;
            expect(dayWidth).toBeGreaterThan(0);
            await schedule.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await schedule.mouse.down();
            await schedule.mouse.move(box.x + box.width / 2 + dayWidth, box.y + box.height / 2, {steps: 20});
            await schedule.mouse.up();
            const snapshot = () => worker.evaluate(() => {
                const witness = globalThis.__planningWitness;
                return {
                    lighting       : witness.dates(witness.lighting),
                    sound          : witness.dates(witness.sound),
                    labels         : witness.dates(witness.labels),
                    lightingChanges: witness.lightingChanges,
                    soundChanges   : witness.soundChanges,
                    events         : witness.events,
                    stable         : witness.tasks.get('lighting') === witness.lighting &&
                        witness.booking.get('lighting') === witness.lighting
                }
            });
            await expect.poll(async () => (await snapshot()).lighting.start).toBe(initial.lighting.start + DAY);
            const moved = await snapshot();
            expect(moved.lighting.end).toBe(initial.lighting.end + DAY);
            expect(moved.sound.start).toBe(initial.sound.start + DAY);
            expect(moved.sound.end).toBe(initial.sound.end + DAY);
            expect(moved.labels).toEqual(initial.labels);
            expect(moved.stable).toBe(true);
            expect(moved.lightingChanges).toBe(1);
            expect(moved.soundChanges).toBe(1);
            expect(moved.events).toBe(1);
            await expect.poll(() => cardDates.textContent()).not.toBe(beforeText);
            await expect.poll(async () => (await ganttBar.boundingBox()).x).toBeGreaterThan(beforeBox.x);

            const movedBox  = await scheduleBar.boundingBox();
            const targetRow = schedule.locator('.neo-grid-row').filter({hasText: 'Noor'}).first();
            const targetBox = await targetRow.boundingBox();
            await schedule.mouse.move(movedBox.x + movedBox.width / 2, movedBox.y + movedBox.height / 2);
            await schedule.mouse.down();
            await schedule.mouse.move(movedBox.x + movedBox.width / 2, targetBox.y + targetBox.height / 2, {steps: 20});
            await schedule.mouse.up();
            await expect(scheduleBar).toHaveAttribute('data-resource-id', 'noor');
            await expect(schedule.locator('.planning-scheduler .neo-timeline-bar[data-event-id="lighting"][data-resource-id="mara"]')).toHaveCount(0);
            await expect(boardCard).toContainText('Noor');
            const reassigned = await snapshot();
            expect(reassigned.lighting).toEqual({...moved.lighting, resource: 'noor'});
            expect(reassigned.sound).toEqual(moved.sound);
            expect(reassigned.labels).toEqual(initial.labels);
            expect(reassigned.stable).toBe(true);
            expect(reassigned.lightingChanges).toBe(2);
            expect(reassigned.soundChanges).toBe(1);
            expect(reassigned.events).toBe(2);

            const phase = gantt.locator('.planning-gantt .neo-grid-row').filter({hasText:'Install the show'}).first();
            await phase.locator('.neo-tree-toggle').click();
            await expect(ganttBar).toHaveCount(0);
            await expect(gantt.locator('.planning-gantt .neo-grid-row').filter({hasText: 'Sound check'})).toHaveCount(0);
            await expect(scheduleBar).toBeVisible();
            await expect(boardCard).toBeVisible();
            await phase.locator('.neo-tree-toggle').click();
            await expect(ganttBar).toBeVisible();
            expect((await snapshot()).stable).toBe(true);

            await ganttWorker.close();
            ganttWorker = null;
            await gantt.close({runBeforeUnload: true});
            gantt = null;
            await scheduleWorker.close();
            scheduleWorker = null;
            await schedule.close({runBeforeUnload: true});
            schedule = null;
            await expect(page.locator('.planning-scheduler')).toBeVisible();
            await expect(page.locator('.planning-gantt')).toBeVisible();
            const retained = await worker.evaluate(() => {
                const witness = globalThis.__planningWitness;
                return {
                    same  : ['scheduler', 'gantt', 'board'].every(key => witness.ws.getPlanPane(key) === witness.panes[key]),
                    ids   : Object.fromEntries(Object.entries(witness.panes).map(([key, pane]) => [key, pane.id])),
                    record: witness.tasks.get('lighting') === witness.lighting &&
                        witness.booking.get('lighting') === witness.lighting
                }
            });
            expect(retained).toEqual({same: true, ids: initial.paneIds, record: true})
        } finally {
            await worker.evaluate(() => {
                const witness = globalThis.__planningWitness;
                if (witness) {
                    witness.tasks.un('recordChange', witness.onRecordChange);
                    witness.panes.scheduler.un('eventChange', witness.onEventChange);
                    delete globalThis.__planningWitness
                }
            });
            await ganttWorker?.close();
            await scheduleWorker?.close();
            if (gantt && !gantt.isClosed()) await gantt.close();
            if (schedule && !schedule.isClosed()) await schedule.close();
            await worker.close()
        }
    });

    for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
        test(`phone uses three tabs and no popup in ${theme}`, async ({page}) => {
            await page.setViewportSize({width: 390, height: 844});
            await page.goto(`${URL}?theme=${theme}`);
            await expect(page.locator(`.planning-viewport.${theme}`)).toBeVisible();
            await expect(page.locator('.planning-hint')).toContainText('Switch tabs');
            await expect(page.getByRole('tab', {name: 'Task Board', exact: true})).toHaveAttribute('aria-selected', 'true');
            await expect(page.locator('.planning-board .neo-board-card').filter({hasText: 'Focus lighting'}))
                .toHaveAttribute('aria-selected', 'true');
            for (const [title, selector] of [['Scheduler', '.planning-scheduler'], ['Gantt', '.planning-gantt'], ['Task Board', '.planning-board']]) {
                await page.getByRole('tab', {name: title, exact: true}).click();
                await expect(page.locator(selector)).toBeVisible();
                if (title !== 'Task Board') {
                    await expect(page.locator(`${selector} .neo-timeline-bar[data-event-id="lighting"]`))
                        .toHaveClass(/neo-timeline-bar-highlighted/)
                }
            }
            await expect(page.locator('.neo-toolbar-action:has(.fa-window-restore):visible')).toHaveCount(0)
        })
    }
});
