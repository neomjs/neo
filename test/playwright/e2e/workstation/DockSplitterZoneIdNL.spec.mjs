import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Witness for the cold-start dragZoneId registry repair (ticket-ref-ok: the spec
 * pins the ticket's AC2/AC3 witnesses — the ref binds the witness to its acceptance criteria).
 *
 * Pre-repair, EVERY drag:start forwarded with `dragZoneId: null` — the app-side handshake
 * (draggable/DragZone.mjs dragStart → setConfigs) was the only writer, so the gesture-opening
 * window (measured 6–12ms) forwarded moves/ends/cancels zoneless, and the Escape guard
 * (main/addon/DragDrop.mjs onKeyDown) keyed on the still-null id: an Escape in the window
 * cancelled nothing while the user believed it had.
 *
 * The repair: zones register EAGERLY at construction (registerZone RPC, refreshed on every
 * setConfigs handshake), and the addon's onDragStart resolves the owning zone synchronously
 * from the event path against that registry. DockSplitter creates its DragZone at construct
 * instead of lazily on first drag.
 *
 * Witnesses:
 *   AC3 — the FIRST drag:start of a boot carries its dragZoneId, across 3 consecutive boots.
 *   AC2 — a mid-gesture Escape forwards drag:cancel with the zone id, the logical gesture is
 *         suppressed (no drag:end follows), and nothing commits (splitter rect unchanged).
 *
 * Run: NEO_E2E_PORT=8119 npx playwright test workstation/DockSplitterZoneIdNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('DockSplitter cold-start zone id — the registry repair (#16758)', () => {
    test.setTimeout(180000);

    async function boot(page, neuralLink) {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 30000});

        const app = await neuralLink.connectToApp('Workstation');

        await page.evaluate(() => {
            window.__stream = [];

            const sendOrig = Neo.main.DomEvents.sendMessageToApp.bind(Neo.main.DomEvents);

            Neo.main.DomEvents.sendMessageToApp = data => {
                if (typeof data?.type === 'string' && data.type.startsWith('drag:')) {
                    window.__stream.push({type: data.type, dragZoneId: data.dragZoneId ?? null})
                }

                return sendOrig(data)
            };
        });

        const splitterResult = await app.queryVdom({cls: 'neo-dashboard-dock-splitter-horizontal'}),
              splitterNode   = Array.isArray(splitterResult) ? splitterResult[0] : (splitterResult?.vdom ?? splitterResult);

        return {app, splitterDomId: splitterNode?.id}
    }

    test('AC3: the first drag:start of a boot carries its dragZoneId — 3 consecutive boots', async ({page, neuralLink}) => {
        for (let cycle = 1; cycle <= 3; cycle++) {
            const {app, splitterDomId} = await boot(page, neuralLink);

            expect(splitterDomId, `boot ${cycle}: the horizontal splitter must exist`).toBeTruthy();

            const [rect] = await app.getDomRect(splitterDomId),
                  x      = rect.x + rect.width / 2,
                  y      = rect.y + rect.height / 2;

            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.waitForTimeout(150);
            await page.mouse.move(x + 30, y, {steps: 4});
            await page.mouse.up();

            const stream = await page.evaluate(() => window.__stream);

            expect(stream[0]?.type, `boot ${cycle}: first forwarded event is drag:start`).toBe('drag:start');
            expect(stream[0]?.dragZoneId, `boot ${cycle}: the FIRST drag:start carries the zone id (pre-repair: null)`).toBeTruthy()
        }
    });

    test('AC2: a mid-gesture Escape cancels with the zone id, suppresses the end, and commits nothing', async ({page, neuralLink}) => {
        const {app, splitterDomId} = await boot(page, neuralLink);

        expect(splitterDomId, 'the horizontal splitter must exist').toBeTruthy();

        const [before] = await app.getDomRect(splitterDomId),
              x        = before.x + before.width / 2,
              y        = before.y + before.height / 2;

        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.waitForTimeout(150);
        await page.mouse.move(x + 30, y, {steps: 4});
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        await page.mouse.move(x + 120, y, {steps: 8});
        await page.mouse.up();
        await page.waitForTimeout(400);

        const stream = await page.evaluate(() => window.__stream),
              cancel = stream.find(entry => entry.type === 'drag:cancel');

        expect(cancel, 'the mid-gesture Escape forwards drag:cancel').toBeTruthy();
        expect(cancel.dragZoneId, 'the cancel carries the zone id (routes to the zone, never the floor)').toBeTruthy();

        const cancelIndex    = stream.indexOf(cancel),
              endAfterCancel = stream.slice(cancelIndex + 1).find(entry => entry.type === 'drag:end');

        expect(endAfterCancel, 'a cancelled gesture never forwards drag:end — nothing can commit').toBeFalsy();

        const [after] = await app.getDomRect(splitterDomId);

        expect(Math.abs(after.x - before.x), 'the cancelled gesture leaves the splitter uncommitted').toBeLessThanOrEqual(2)
    });
})
