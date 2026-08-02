import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness for text-selection suppression during dock splitter drags.
 *
 * A splitter drag is a mousedown + move gesture that crosses card content. Without a
 * gesture-scoped selection guard, the native selection machinery claims the pre-threshold
 * window before the drag officially starts — a near-handle miss or a fast sweep paints card
 * text as a selection. The guard under test: the draggable Mouse sensor applies a
 * document-level drag-active class from mousedown on a drag target until pointer release
 * (with a defensive release in the DragDrop addon's reset), and the dock splitter's hit
 * target expands past its thin visual rail so near-handle starts become drags, not sweeps.
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

    test('a splitter drag suppresses text selection mid-gesture and releases it fully afterward', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 30000});

        const app            = await neuralLink.connectToApp('Workstation'),
              windowId       = await page.evaluate(() => Neo.worker.Manager.windowId),
              splitterResult = await app.queryVdom({cls: 'neo-dashboard-dock-splitter-horizontal'}),
              splitterNode   = Array.isArray(splitterResult) ? splitterResult[0] : (splitterResult?.vdom ?? splitterResult),
              splitterDomId  = splitterNode?.id,
              [rect]         = await app.getDomRect(splitterDomId),
              cx             = rect.x + rect.width / 2,
              cy             = rect.y + rect.height / 2;

        expect(splitterDomId, 'the horizontal splitter must exist in the vdom').toBeTruthy();

        // drag across the card surface: down on the splitter, sweep right over the heavy-tabs
        // cards. CDP page.mouse is REQUIRED here — the app-side synthetic event path does not
        // create text selections at all (measured: selection stays empty even without the fix),
        // so only the trusted-input path can witness this defect class.
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + 40, cy, {steps: 4});
        await page.mouse.move(cx + 120, cy + 30, {steps: 6});

        const midGesture = await page.evaluate(() => ({
            dragActiveCls: document.body.classList.contains('neo-drag-active'),
            selection    : document.getSelection().toString()
        }));

        console.log('[selection-diag] mid-gesture state:', JSON.stringify(midGesture));

        expect(
            midGesture.dragActiveCls,
            'mid-gesture: the document must carry the drag-active suppression class'
        ).toBe(true);
        expect(
            midGesture.selection,
            'mid-gesture: a drag across card text must leave NO text selection'
        ).toBe('');

        await page.mouse.up();

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

        expect(postRelease.released, 'post-release: the suppression class must be removed').toBe(true);
        expect(postRelease.selectable, 'post-release: ordinary text selection must work again').toBe(true)
    })

})
