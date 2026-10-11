import {test, expect}              from '../../fixtures.mjs';
import {countPixelsUnlikeDominant} from '../utils/pngPixels.mjs';
import {callWorkstationTour}       from '../utils/workstationTour.mjs';
import {fiveBeatFilmScript}        from '../../../../apps/workstation/tour/fiveBeatFilm.mjs';

/**
 * @summary Whitebox E2E witness: the sparkline cells of a popped-out grid follow the grid into the
 * popup window and draw there.
 *
 * Measured against the running Workstation before the fix: the Feed pane — a `grid.Container` with a
 * `sparkline` column — moved into a real popup as the same instance, every descendant in the items
 * tree took the popup's `windowId`, and every sparkline canvas that travelled with the grid went
 * blank. A grid row is a component, not a container, so the `windowId` cascade never reached the
 * cell components a row pools; the travelled canvases kept the opener's id, re-transferred their
 * nodes to the opener's main thread on remount, and never registered again. The cells the grid
 * created after the hop were stamped with the popup's id at creation and drew at once — which is why
 * this arm reads the cells that existed BEFORE the gesture, not only the ones present after it.
 *
 * Two boundaries, read separately. Ownership is read through the Neural Link: `offscreenRegistered`
 * is the App Worker's own record that the canvas worker owns the node in the window the component
 * believes it is in. Drawing is read from the popup page as an element screenshot of each travelled
 * canvas, decoded and counted as pixels unlike the cell's background — a canvas whose control lives
 * in a worker reads as blank from page script, a blank canvas and a drawn one are the same element
 * to a locator, and the renderer records nothing the App Worker can be asked about.
 *
 * Runs in Playwright's default headless mode of the local Chrome channel the e2e config selects; no
 * `--headed` is passed. The popup is a real second window either way.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> NEO_E2E_PORT=8152 \
 *      npx playwright test workstation/WorkstationPopOutSparklinesNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * The runtime root is not optional: `playwright.config.e2e.mjs` ignores every neuralLink-fixture
 * spec without it, so the command selects ZERO tests and reports success.
 */
const
    ACTION     = '.neo-toolbar-action',
    FEED_TITLE = 'Live Event Stream', // the Feed pane's tab title in the Workstation's boot document
    HEADER     = '.neo-tab-header-toolbar',
    // A sparkline's polyline crosses a ~139px-wide cell; a blank canvas counts zero. Well below
    // any drawn count, well above a stray border pixel.
    MIN_DRAWN_PIXELS = 40,
    POP_OUT          = 'window-restore',
    SPARKLINE        = 'Neo.component.Sparkline',
    TAB              = '.neo-tab-header-button';

/** One record per live sparkline, in the shape the fixture returns for either wrapper. */
const readSparklines = async app => {
    const records = await app.findInstances({className: SPARKLINE}, ['id', 'windowId', 'offscreenRegistered', 'mounted', 'record.id']);

    return (Array.isArray(records) ? records : [records]).filter(Boolean).map(record => {
        const properties = record.properties ?? record;

        return {...properties, id: record.id ?? properties.id}
    })
};

/**
 * Clicks a pane's tab by its title, which is how a user gives that pane focus, and returns the tab
 * header toolbar that carries it — the surface the focus-gated action set renders into.
 */
const focusPane = async (page, title) => {
    const header = page.locator(HEADER).filter({has: page.locator(TAB, {hasText: title})}).first();

    await expect(header, `${title} must have a projected tab header`).toBeVisible({timeout: 30000});
    await header.locator(TAB, {hasText: title}).first().click();

    return header
};

test.describe('Workstation pop-out — sparkline cells follow the grid into the popup (Neural Link)', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1600, height: 900}});

    test('every sparkline that travelled with the Feed pane registers under the popup windowId and draws', async ({page, context, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host',            {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});

        // A window's id lives on the main thread's worker manager, the same place `Main.mjs` reads
        // it from when it hands a popup its native route.
        const app      = await neuralLink.connectToApp('Workstation'),
              openerId = await page.evaluate(() => Neo.worker.Manager.windowId);

        expect(openerId, 'the opener knows its own window id').toBeTruthy();

        // The cells that exist BEFORE the gesture are the ones the defect blanked; record them.
        const header = await focusPane(page, FEED_TITLE);

        await expect.poll(async () => (await readSparklines(app)).filter(cell => cell.windowId === openerId && cell.offscreenRegistered).length,
            {message: 'the Feed pane draws its sparklines in the opener before the gesture', timeout: 15000}).toBeGreaterThan(0);

        const travelling = (await readSparklines(app)).filter(cell => cell.windowId === openerId).map(cell => cell.id),
              popOut     = header.locator(`${ACTION}:has(span[class*="${POP_OUT}"])`).first();

        // The drawing instrument, validated on cells the opener visibly draws before the gesture: if
        // the screenshot read cannot see a drawn sparkline here, it cannot certify one in the popup.
        const drawnInOpener = countPixelsUnlikeDominant(await page.locator(`#${travelling[0]}`).screenshot());

        expect(drawnInOpener.unlike, `the screenshot read sees a drawn sparkline in the opener (${drawnInOpener.width}×${drawnInOpener.height})`)
            .toBeGreaterThanOrEqual(MIN_DRAWN_PIXELS);

        await expect(popOut, 'the Feed pane offers the pop-out action').toBeVisible({timeout: 10000});

        // Subscribed before the click: the vessel can open faster than the next await.
        const vesselPromise = context.waitForEvent('page', {timeout: 45000});

        await popOut.click();

        const vessel = await vesselPromise;

        await vessel.waitForLoadState('domcontentloaded');
        await vessel.waitForSelector('canvas', {state: 'attached', timeout: 45000});
        await vessel.setViewportSize({width: 1200, height: 800});

        const popupId   = await vessel.evaluate(() => Neo.worker.Manager.windowId),
              inVessel  = new Set(await vessel.evaluate(() => [...document.querySelectorAll('canvas')].map(canvas => canvas.id))),
              travelled = travelling.filter(id => inVessel.has(id));

        expect(popupId, 'the vessel is its own window').not.toBe(openerId);
        expect(travelled.length, 'at least one pre-existing sparkline cell travelled into the vessel').toBeGreaterThan(0);

        // The witness: a canvas that travelled belongs to the popup's window in the App Worker's
        // own record and has re-registered there. Before the fix every travelled cell kept the
        // opener's id and `offscreenRegistered` stayed false for good.
        await expect.poll(async () => {
            const cells = (await readSparklines(app)).filter(cell => travelled.includes(cell.id));

            return cells.length === travelled.length && cells.every(cell => cell.windowId === popupId && cell.offscreenRegistered === true && cell.mounted === true)
        }, {message: 'every travelled sparkline carries the popup windowId, is mounted and registered', timeout: 10000}).toBe(true);

        // And every canvas the vessel shows, travelled or created after the hop, belongs to it.
        const strangers = (await readSparklines(app)).filter(cell => inVessel.has(cell.id) && cell.windowId !== popupId);

        expect(strangers, 'no canvas in the vessel still believes it is in the opener').toEqual([]);

        // Registration is ownership, not drawing: the renderer's register/updateData/updateSize run
        // in the Canvas worker afterwards and record nothing the App Worker can be asked about. The
        // drawn result is observed where it lands — the pixels the popup DISPLAYS for each travelled
        // canvas, read from an element screenshot, because a canvas whose control lives in a worker
        // reads as blank from page script. Drawn = pixels unlike the cell's background.
        await expect.poll(async () => {
            const blank = [];

            for (const id of travelled) {
                const {unlike} = countPixelsUnlikeDominant(await vessel.locator(`#${id}`).screenshot());

                unlike < MIN_DRAWN_PIXELS && blank.push(`${id}:${unlike}`)
            }

            return blank
        }, {
            message: 'every travelled sparkline is drawn in the popup — the Live column is not blank',
            timeout: 15000
        }).toEqual([]);

        await vessel.close({runBeforeUnload: true})
    });

    test('pre-existing ScalePane canvases keep drawing as the popup recycles matrix rows', async ({page, context, neuralLink}) => {
        test.setTimeout(180000);

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-scale-pane .neo-grid-row', {timeout: 60000});

        const
            app        = await neuralLink.connectToApp('Workstation'),
            found      = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
            workspaces = Array.isArray(found) ? found : found ? [found] : [],
            wsId       = workspaces[0]?.id,
            openerId   = await page.evaluate(() => Neo.worker.Manager.windowId),
            scalePanes = await app.findInstances({className: 'Workstation.view.ScalePane'}, ['id', 'windowId']),
            scalePane  = (Array.isArray(scalePanes) ? scalePanes : [scalePanes]).find(Boolean);

        expect(workspaces, 'the opener owns one current Workstation').toHaveLength(1);
        expect(scalePane?.id, 'the 100k ScalePane is live').toBeTruthy();
        await expect(page.locator('.workstation-scale-pane')).toBeVisible();

        const sourceCanvasIds = new Set(await page.locator('.workstation-scale-pane canvas').evaluateAll(canvases => canvases.map(canvas => canvas.id)));

        await expect.poll(async () => (await readSparklines(app)).filter(cell =>
            sourceCanvasIds.has(cell.id) && cell.windowId === openerId && cell.mounted && cell.offscreenRegistered
        ).length, {message: 'ScalePane canvas ownership has settled in the opener before the census', timeout: 15000}).toBeGreaterThan(0);

        const
            before        = (await readSparklines(app)).filter(cell => sourceCanvasIds.has(cell.id) && cell.windowId === openerId && cell.mounted && cell.offscreenRegistered),
            beforeRecords = new Map(before.map(cell => [cell.id, cell['record.id']]));

        expect(before.length, 'pre-existing, registered Sparkline cells occupy the ScalePane').toBeGreaterThan(0);

        const header = await focusPane(page, '100k Matrix'),
              popOut = header.locator(`${ACTION}:has(span[class*="${POP_OUT}"])`).first();

        await expect(popOut).toBeVisible();
        await popOut.click();

        const scalePopouts = () => context.pages().filter(candidate => {
            if (candidate === page || candidate.isClosed()) return false;
            try { return new URL(candidate.url()).searchParams.get('popout') === 'scale' } catch { return false }
        });

        await expect.poll(() => scalePopouts().length, {message: 'the surviving popout=scale page is resolved after transient births', timeout: 30000}).toBe(1);

        const popup = scalePopouts()[0];
        await popup.waitForLoadState('domcontentloaded');
        await expect(popup.locator('.workstation-scale-pane')).toBeVisible({timeout: 30000});

        const
            popupId         = await popup.evaluate(() => Neo.worker.Manager.windowId),
            popupCanvasIds  = new Set(await popup.locator('.workstation-scale-pane canvas').evaluateAll(canvases => canvases.map(canvas => canvas.id))),
            travelled       = before.map(cell => cell.id).filter(id => popupCanvasIds.has(id)),
            transferredPane = await app.getComponent(scalePane.id, ['windowId']);

        expect(popupId, 'the surviving vessel has its own window id').not.toBe(openerId);
        expect(transferredPane.windowId, 'the original ScalePane instance follows the surviving vessel').toBe(popupId);
        expect(travelled.length, 'pre-existing Sparkline instances, not only newly created cells, travelled').toBeGreaterThan(0);

        await expect.poll(async () => {
            const cells = new Map((await readSparklines(app)).map(cell => [cell.id, cell]));
            return travelled.every(id => cells.get(id)?.windowId === popupId && cells.get(id)?.mounted === true && cells.get(id)?.offscreenRegistered === true)
        }, {message: 'every pre-existing ScalePane canvas re-registers in the popup', timeout: 15000}).toBe(true);

        const cues       = fiveBeatFilmScript.scenes.flatMap(scene => scene.steps).map(step => step.cue).filter(Boolean),
              midpoint   = cues.find(cue => cue.type === 'scroll' && cue.index === 50000),
              dragScroll = cues.find(cue => cue.type === 'grid-drag-scroll' && cue.paneId === 'scale');

        expect(midpoint, 'the shipped midpoint scroll cue exists').toBeTruthy();
        expect(dragScroll, 'the shipped ScalePane grid-drag-scroll cue exists').toBeTruthy();
        expect(await callWorkstationTour(app, wsId, 'executeCue', [midpoint]), 'the original 100k grid scrolls to its midpoint').toBe(true);

        const atMidpoint = new Map((await readSparklines(app)).map(cell => [cell.id, cell]));
        expect(travelled.filter(id => atMidpoint.has(id) && atMidpoint.get(id)['record.id'] !== beforeRecords.get(id)).length,
            'the same pre-existing Sparkline instances are now bound to recycled records').toBeGreaterThan(0);

        const dragReceipt = await callWorkstationTour(app, wsId, 'executeCue', [{...dragScroll, options: {...dragScroll.options, showCursor: false}}]);
        expect(dragReceipt?.applied, `the diagonal grid drag exposes the canvas column: ${JSON.stringify(dragReceipt)}`).toBe(true);
        expect(dragReceipt.proof.travel.met.x && dragReceipt.proof.travel.met.y, 'the grid follows the real two-axis drag').toBe(true);

        const
            afterCells = new Map((await readSparklines(app)).map(cell => [cell.id, cell])),
            recycled   = travelled.filter(id => afterCells.has(id) && afterCells.get(id)['record.id'] !== beforeRecords.get(id)),
            visibleIds = new Set(await popup.locator('.workstation-scale-pane canvas').evaluateAll(canvases => canvases.map(canvas => canvas.id)));

        expect(travelled.every(id => afterCells.has(id)), 'row recycling preserves the original cell component instances').toBe(true);
        expect(recycled.length, 'the midpoint and drag bound those same instances to other rows').toBeGreaterThan(0);
        expect(recycled.every(id => afterCells.get(id).windowId === popupId && afterCells.get(id).offscreenRegistered === true),
            'recycled cells remain registered to the popup Canvas Worker').toBe(true);

        // Page screenshots do not scroll elements into view. Intersect the canvas with the viewport
        // and each clipping ancestor first; only wholly visible canvases at least 20px high are paint
        // evidence, since a legitimate 1px edge sliver can contain no line pixels.
        const visibleBounds = async id => popup.locator(`#${id}`).evaluate(canvas => {
            if (!canvas?.isConnected) return null;
            for (let node = canvas; node; node = node.parentElement) {
                const style = getComputedStyle(node);
                if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return null
            }

            const r    = canvas.getBoundingClientRect();
            let   left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);

            for (let node = canvas.parentElement; node; node = node.parentElement) {
                const style = getComputedStyle(node), clip = node.getBoundingClientRect();
                if (style.overflowX !== 'visible') { left = Math.max(left, clip.left); right = Math.min(right, clip.right) }
                if (style.overflowY !== 'visible') { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom) }
            }

            return {fullyVisible: left >= r.left - 0.5 && right <= r.right + 0.5 && top >= r.top - 0.5 && bottom <= r.bottom + 0.5 &&
                    Math.abs((right - left) - r.width) < 0.5 && Math.abs((bottom - top) - r.height) < 0.5,
                height: r.height, x: r.left, y: r.top, width: r.width}
        });

        const candidates = [];
        for (const id of recycled) {
            if (!visibleIds.has(id)) continue;
            const rect = await visibleBounds(id);
            rect?.fullyVisible && rect.height >= 20 && candidates.push({id, rect})
        }

        expect(candidates.length, 'the cue exposes fully visible recycled Sparkline canvases').toBeGreaterThan(0);

        const scrollBefore = await popup.evaluate(() => ({x: scrollX, y: scrollY})), blanks = [];
        for (const {id, rect} of candidates) {
            const pixels = countPixelsUnlikeDominant(await popup.screenshot({clip: {x: rect.x, y: rect.y, width: rect.width, height: rect.height}}));
            pixels.unlike < MIN_DRAWN_PIXELS && blanks.push({id, recordId: afterCells.get(id)['record.id'], unlike: pixels.unlike});
        }

        expect(await popup.evaluate(() => ({x: scrollX, y: scrollY})), 'pixel reads do not auto-scroll the popup').toEqual(scrollBefore);
        expect(blanks, 'fully visible recycled canvases paint the Living signal line').toEqual([]);
        await popup.close({runBeforeUnload: true})
    })
});
