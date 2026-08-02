import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness for text-selection suppression across dock splitter drags.
 *
 * A splitter drag is a mousedown + move gesture that crosses card content. Without a
 * gesture-scoped selection guard, the native selection machinery claims the pre-threshold
 * window before the drag officially starts — a near-handle miss or a fast sweep paints card
 * text as a selection. The guard under test: the draggable Mouse sensor applies a
 * document-level drag-active class from mousedown on a drag target until the PHYSICAL gesture
 * ends, and the dock splitter's hit target expands past its thin visual rail so near-handle
 * starts become drags, not sweeps.
 *
 * Terminal contract (code/prose/test must agree):
 * - Ordinary release: mouseup retires the class.
 * - Escape-cancel retires the LOGICAL drag, but the physical bracket still owns suppression
 *   while the button is down — releasing earlier would re-open the sweep window mid-gesture.
 * - Lost release: a release off-document never reaches mouseup, so the gesture's own move
 *   stream is the independent terminal witness — the first move reporting the primary button
 *   gone terminates the gesture exactly as that release would have.
 * The DragDrop addon's resetDragState() is an idempotent second release site reached only
 * downstream of `drag:end`, never an off-document fallback.
 *
 * CDP page.mouse is REQUIRED for this witness: the app-side synthetic event path does not
 * create text selections at all (measured), so only the trusted-input path exercises the class.
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test workstation/WorkstationDragTextSelectionNL -c test/playwright/playwright.config.e2e.mjs --workers=1 --headed
 */
test.describe('Workstation — text selection is suppressed during splitter drags', () => {
    test.setTimeout(60000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 900, width: 1440}
    });

    async function getSplitterCenter(app) {
        const splitterResult = await app.queryVdom({cls: 'neo-dashboard-dock-splitter-horizontal'}),
              splitterNode   = Array.isArray(splitterResult) ? splitterResult[0] : (splitterResult?.vdom ?? splitterResult),
              splitterDomId  = splitterNode?.id;

        expect(splitterDomId, 'the horizontal splitter must exist in the vdom').toBeTruthy();

        const [rect] = await app.getDomRect(splitterDomId);

        return {cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2}
    }

    async function readGestureState(page) {
        return page.evaluate(() => ({
            dragActiveCls: document.body.classList.contains('neo-drag-active'),
            selection    : document.getSelection().toString()
        }))
    }

    async function expectGuarded(page, phase) {
        const state = await readGestureState(page);

        console.log(`[selection-diag] ${phase}:`, JSON.stringify(state));

        expect(state.dragActiveCls, `${phase}: the document must carry the drag-active suppression class`).toBe(true);
        expect(state.selection,     `${phase}: a drag across card text must leave NO text selection`).toBe('')
    }

    async function assertSelectionRestored(page) {
        // Semantic settlement before the release control: the projection/FLIP lifecycle must
        // retire first — its transient state carries its own select guard, so "selection works
        // again" is only meaningful once the gesture's visual machinery has fully stood down.
        await expect.poll(
            async () => page.locator('.neo-dashboard-dock-animating').count(),
            {message: 'projection animation must settle before the release control', timeout: 8000, intervals: [100]}
        ).toBe(0);
        await expect.poll(
            async () => page.locator('.neo-dock-flip-fixed-stage').count(),
            {message: 'the FLIP staging frame must be fully retired before the release control', timeout: 8000, intervals: [100]}
        ).toBe(0);

        const postRelease = await page.evaluate(() => {
            const released  = !document.body.classList.contains('neo-drag-active'),
                  selection = document.getSelection();

            selection.selectAllChildren(document.body);
            const bodySelLen = selection.toString().length;

            selection.removeAllRanges();

            const card = [...document.querySelectorAll('.workstation-resident-card')]
                .find(element => element.getClientRects().length > 0);

            let cardSelLen = -1, cardUS = 'n/a';

            if (card) {
                cardUS = globalThis.getComputedStyle(card).userSelect;
                selection.selectAllChildren(card);
                cardSelLen = selection.toString().length;
                selection.removeAllRanges()
            }

            return {
                bodyClass : document.body.className,
                bodySelLen,
                cardSelLen,
                cardUS,
                released,
                selectable: bodySelLen > 0
            }
        });

        console.log('[selection-diag] post-release state:', JSON.stringify(postRelease));

        expect(postRelease.released,   'post-release: the suppression class must be removed').toBe(true);
        expect(postRelease.selectable, 'post-release: ordinary text selection must work again').toBe(true)
    }

    test('a splitter drag suppresses text selection mid-gesture and releases it fully afterward', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 30000});

        const app      = await neuralLink.connectToApp('Workstation'),
              {cx, cy} = await getSplitterCenter(app);

        // Interference canary: in a headed run the virtual gesture shares the window with the
        // physical input stack — a real OS-level move (buttons=0) interleaving with the virtual
        // button-held gesture is a genuine lost-release terminal by design. The log makes any
        // such environmental interference self-diagnosing instead of a mystery flake.
        await page.evaluate(() => {
            globalThis.__mmLog = [];
            ['mousedown', 'mousemove', 'mouseup'].forEach(t =>
                document.addEventListener(t, e => globalThis.__mmLog.push(`${t}:${e.buttons}`), true))
        });

        // drag across the card surface: down on the splitter, sweep right over the heavy-tabs
        // cards. CDP page.mouse is REQUIRED here — the app-side synthetic event path does not
        // create text selections at all (measured: selection stays empty even without the fix),
        // so only the trusted-input path can witness this defect class.
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 40, cy, {steps: 4});
        await page.mouse.move(cx + 120, cy + 30, {steps: 6});

        console.log('[selection-diag] event log:', JSON.stringify(await page.evaluate(() => globalThis.__mmLog)));

        await expectGuarded(page, 'mid-gesture');

        await page.mouse.up();

        await assertSelectionRestored(page)
    })

    test('Escape-cancel retires the logical drag while the physical bracket keeps suppression until release', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 30000});

        const app      = await neuralLink.connectToApp('Workstation'),
              {cx, cy} = await getSplitterCenter(app);

        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 40, cy, {steps: 4});
        await page.mouse.move(cx + 120, cy + 30, {steps: 6});

        // The logical drag must be ENGAGED before Escape, or the gesture owner has no zone to cancel.
        await expect.poll(
            async () => page.evaluate(() => Neo.main.addon.DragDrop?.dragZoneId ?? null),
            {message: 'the drag must be engaged (dragZoneId assigned) before the Escape terminal', timeout: 5000, intervals: [50]}
        ).not.toBe(null);

        await expectGuarded(page, 'mid-gesture');

        await page.keyboard.press('Escape');

        await expect.poll(
            async () => page.evaluate(() => Neo.main.addon.DragDrop?.dragCancelled ?? false),
            {message: 'Escape must mark the logical drag cancelled at the gesture owner', timeout: 5000, intervals: [50]}
        ).toBe(true);

        // Keep sweeping over card content with the button STILL down: the physical bracket owns
        // suppression — retiring it at Escape would re-open the selection-sweep window mid-gesture.
        await page.mouse.move(cx + 180, cy + 50, {steps: 3});

        await expectGuarded(page, 'post-Escape, still holding');

        await page.mouse.up();

        await assertSelectionRestored(page)
    })

    test('a release lost off-document is recovered by the gesture\'s own move stream', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 30000});

        const app      = await neuralLink.connectToApp('Workstation'),
              {cx, cy} = await getSplitterCenter(app),
              cdp      = await page.context().newCDPSession(page);

        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 40, cy, {steps: 4});
        await page.mouse.move(cx + 120, cy + 30, {steps: 6});

        await expectGuarded(page, 'mid-gesture');

        // The release happens off-document: no mouseReleased is ever dispatched. The next
        // observed move reports the primary button gone — the sensor must treat it as the lost
        // release and retire the guard exactly as that release would have.
        await cdp.send('Input.dispatchMouseEvent', {
            button : 'none',
            buttons: 0,
            type   : 'mouseMoved',
            x      : Math.round(cx + 160),
            y      : Math.round(cy + 40)
        });

        await expect.poll(
            async () => page.evaluate(() => document.body.classList.contains('neo-drag-active')),
            {message: 'the lost release must be recovered on the first observed move', timeout: 5000, intervals: [50]}
        ).toBe(false);

        // The full owner chain stood down: the addon reset its between-gestures baseline.
        await expect.poll(
            async () => page.evaluate(() => Neo.main.addon.DragDrop?.dragZoneId ?? null),
            {message: 'the gesture owner must reset after the recovered drag:end', timeout: 5000, intervals: [50]}
        ).toBe(null);

        await cdp.detach();

        await assertSelectionRestored(page)
    })
})
