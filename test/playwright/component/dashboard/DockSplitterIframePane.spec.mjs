import {test, expect} from '@playwright/test';

/**
 * A splitter drag whose path crosses an iframe (ticket-ref-ok: the spec pins #17883's enforcement
 * AC — the gesture must complete and terminate when the pointer passes over a nested browsing
 * context).
 *
 * **Why this arm is hit-tested and cannot be an EventSimulator one.** The defect is a hit-testing
 * outcome: once the cursor is over an iframe, `mousemove`/`mouseup` are delivered to the CHILD
 * document, so the parent's sensor never observes the release and the gesture never ends. Events
 * dispatched onto an element perform no hit-testing, so a simulated drag completes identically with
 * and without the fix — it is structurally incapable of failing here, which is precisely why the
 * defect reached a consumer with the suite green. `page.mouse` drives the real input pipeline.
 *
 * The fix is a CSS shield scoped to the gesture class, so the assertions are the gesture's
 * observable ends: the splitter commits its travel, and the body class does not outlive the drag.
 */

const IFRAME_ID = 'dock-splitter-iframe-pane';

let dashboardId, iframeId, splitterId;

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-splitter/index.html');
    await page.waitForSelector('#dock-splitter-test-viewport', {state: 'attached'});

    const ids = await page.evaluate(async iframeIdArg => {
        const dashboard = await Neo.worker.App.createNeoInstance({
            importPath: '../dashboard/Container.mjs',
            ntype     : 'dashboard',
            parentId  : 'dock-splitter-test-viewport'
        });

        if (!dashboard.success) throw new Error(`dashboard: ${dashboard.error.message}`);

        const splitter = await Neo.worker.App.createNeoInstance({
            importPath : '../dashboard/dock/interaction/DockSplitter.mjs',
            ntype      : 'dashboard-dock-splitter',
            orientation: 'horizontal',
            parentId   : dashboard.id
        });

        if (!splitter.success) throw new Error(`splitter: ${splitter.error.message}`);

        // A real nested browsing context. `about:blank` is enough: the defect is the child document
        // claiming the pointer stream, which any iframe does regardless of what it loads.
        const iframe = await Neo.worker.App.createNeoInstance({
            importPath: '../component/Base.mjs',
            ntype     : 'component',
            id        : iframeIdArg,
            parentId  : dashboard.id,
            tag       : 'iframe',
            vdom      : {tag: 'iframe', src: 'about:blank'},
            // Placed to straddle the horizontal drag path while leaving the splitter's grab point
            // clear: the gesture must START on the splitter and only then cross the iframe. An
            // iframe covering the grab point would prevent the mousedown from ever reaching the
            // splitter, and the spec would pass by never starting a gesture at all.
            style     : {position: 'absolute', top: '320px', left: '24px', width: '400px', height: '120px'}
        });

        if (!iframe.success) throw new Error(`iframe: ${iframe.error.message}`);

        return {dashboardId: dashboard.id, iframeId: iframe.id, splitterId: splitter.id}
    }, IFRAME_ID);

    ({dashboardId, iframeId, splitterId} = ids);

    await page.waitForSelector('.neo-dashboard-dock-splitter', {state: 'attached'});
    await page.waitForSelector(`#${IFRAME_ID}`,                {state: 'attached'})
});

test.afterEach(async ({page}) => {
    await page.evaluate(async ids => {
        for (const id of ids) id && await Neo.worker.App.destroyNeoInstance(id)
    }, [splitterId, iframeId, dashboardId])
});

test.describe('DockSplitter — a drag whose path crosses an iframe', () => {
    test('the shield is scoped to the gesture, not applied globally', async ({page}) => {
        // Before any gesture the iframe must remain interactive: a permanently shielded iframe would
        // pass the drag assertions below while breaking every iframe in the product.
        const idle = await page.evaluate(id => getComputedStyle(document.getElementById(id)).pointerEvents, IFRAME_ID);

        expect(idle).not.toBe('none')
    });

    test('the gesture completes and terminates when the pointer passes over the iframe', async ({page}) => {
        const splitter = page.locator('.neo-dashboard-dock-splitter').first(),
              box      = await splitter.boundingBox();

        expect(box).not.toBeNull();

        const startX = box.x + box.width / 2,
              startY = 380,                      // inside the iframe's vertical band, below its top edge
              endX   = startX + 120;             // far enough right to be well inside the iframe

        // NON-VACUITY PRECONDITION. Everything below only tests the defect if the pointer genuinely
        // enters the iframe while the button is down. An earlier revision of this spec dragged along
        // a path that missed the iframe entirely: it passed with the fix reverted, asserting only
        // that a stylesheet rule existed. Assert the intersection rather than trusting the layout.
        const frame = await page.locator(`#${IFRAME_ID}`).boundingBox();

        expect(frame, 'the iframe must be laid out').not.toBeNull();
        expect(startY, 'drag path must run through the iframe vertically').toBeGreaterThan(frame.y);
        expect(startY).toBeLessThan(frame.y + frame.height);
        expect(startX, 'the grab point must be OUTSIDE the iframe').toBeLessThan(frame.x);
        expect(endX,   'the drag must END inside the iframe').toBeGreaterThan(frame.x);

        await page.mouse.move(startX, startY);
        await page.mouse.down();

        // Cross the iframe mid-gesture. Without the shield the child document swallows this move and
        // the release below, and the sensor never reaches endGesture.
        await page.mouse.move(endX, startY, {steps: 10});

        const activeDuringDrag = await page.evaluate(() => document.body.classList.contains('neo-drag-active'));

        // The shield only matters if the gesture actually started; assert that rather than assume it.
        expect(activeDuringDrag).toBe(true);

        await page.mouse.up();

        // The terminal: a release that reached the parent clears the gesture class. A stuck class is
        // the observable of a session whose pointerup was lost to the child document.
        await expect.poll(
            () => page.evaluate(() => document.body.classList.contains('neo-drag-active')),
            {message: 'neo-drag-active outlived the gesture — the release never reached the sensor'}
        ).toBe(false);

        // And the app-side zone class must not leak either; it is removed on the drag-end the lost
        // release would have prevented.
        const stuckZone = await page.evaluate(() => document.querySelectorAll('.neo-is-dragging').length);

        expect(stuckZone).toBe(0)
    })
});
