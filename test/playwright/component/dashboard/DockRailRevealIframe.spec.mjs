import {test, expect} from '@playwright/test';

/**
 * A click into an iframe is "moving on" like any other outside click, and a click into the
 * revealed pane's own iframe is not.
 *
 * An iframe is a second document: nothing that happens inside it reaches the parent's event
 * surfaces — no `mousedown`, no `click`, no `focusin`. What the parent can see is at most a focus
 * crossing (when the frame's document takes focus) and the pointer crossing the frame ELEMENT. A
 * nested document that cancels the `mousedown` default — an editor managing its own caret — takes no
 * focus at all, so the parent sees nothing. The two frames of this fixture are those two shapes.
 *
 * The first arm is a MEASUREMENT before it is an assertion: it records which parent signals a click
 * into each frame produces, so the mechanism is chosen on evidence rather than on the event model's
 * reputation. The dismissal arms are the regression; the inside-frame arm is the control that keeps
 * the focus-hold contract for the revealed pane's own frame.
 */

const WORKSPACE_ID = 'dock-rail-iframe-workspace';

const overlaySel = '.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)';

const readInstance = async (page, id, keys) => {
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id, keys});

    return reply?.data ?? reply
};

/** Reveals the rail item by a real click on its rail tab, and waits for the focused reveal. */
const reveal = async page => {
    await page.locator('.neo-dashboard-dock-edge-rail').getByText('Railed').click();

    const overlay = page.locator(overlaySel);

    await expect(overlay).toHaveCount(1);
    await expect(overlay).toBeVisible();

    const overlayId = await overlay.getAttribute('id');

    await expect.poll(async () => (await readInstance(page, overlayId, ['revealState']))[0],
        {message: 'a click-born reveal holds focus'}).toBe('revealed-focused');

    return overlayId
};

/** The reveal machine's state as the overlay mirrors it. */
const stateOf = async (page, overlayId) => (await readInstance(page, overlayId, ['revealState']))[0];

/**
 * Installs main-document listeners for every signal the parent could receive when a click lands in
 * a frame, BEFORE the click, and returns a reader for what arrived.
 */
const traceParentSignals = page => page.evaluate(() => {
    const trace = window.__railIframeTrace = {focusin: [], focusout: [], windowBlur: 0, mousedown: []};

    const label = node => node === window ? 'window' : node === document ? 'document'
        : `${node.tagName?.toLowerCase()}#${node.id || ''}.${[...(node.classList || [])].slice(0, 2).join('.')}`;

    document.addEventListener('focusin',   event => trace.focusin.push(label(event.target)),  true);
    document.addEventListener('focusout',  event => trace.focusout.push({from: label(event.target), to: event.relatedTarget ? label(event.relatedTarget) : null}), true);
    document.addEventListener('mousedown', event => trace.mousedown.push(label(event.target)), true);
    window.addEventListener('blur', () => trace.windowBlur++)
});

const readTrace = page => page.evaluate(() => ({
    ...window.__railIframeTrace,
    activeElement: document.activeElement === document.body ? 'body'
        : `${document.activeElement?.tagName?.toLowerCase()}#${document.activeElement?.id || ''}`
}));

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-rail-iframe/index.html');
    await page.waitForSelector(`#${WORKSPACE_ID}`, {state: 'attached'});
    await expect(page.locator('.neo-dashboard-dock-edge-rail')).toBeVisible({timeout: 10000});
    await expect(page.locator('#dock-rail-iframe-pane-plain')).toBeVisible();
    await expect(page.locator('#dock-rail-iframe-pane-cancel')).toBeVisible()
});

test.describe('Neo.dashboard.dock.interaction.Rail — a reveal and the frame boundary', () => {
    for (const frame of ['plain', 'cancel']) {
        test(`a click into the "${frame}" iframe pane dismisses a focused reveal`, async ({page}, testInfo) => {
            const overlayId = await reveal(page),
                  pane      = page.locator(`#dock-rail-iframe-pane-${frame}`),
                  pointer   = () => pane.evaluate(node => getComputedStyle(node).pointerEvents);

            // While the reveal is open, a frame outside it is shielded from the pointer, so the click
            // below reaches the parent document; the reveal's own frame is not (see the inside arm).
            expect(await pointer(), `[${frame}] an outside frame is shielded while the reveal is open`).toBe('none');

            await traceParentSignals(page);

            // The user's gesture: a click at the frame's position on screen. Not a frame-locator
            // click — Playwright would wait for the frame to become a pointer target, which is the
            // very thing the shield denies while the reveal is open.
            const box = await pane.boundingBox();

            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

            // Let the focus manager's leave window elapse before reading anything, so a dismissal
            // that arrives through the focus path is not missed by reading too early.
            await page.waitForTimeout(400);

            const trace = await readTrace(page),
                  state = await stateOf(page, overlayId);

            // AC-1: the measurement is the receipt, whatever the verdict below says.
            testInfo.annotations.push({type: `parent-signals-${frame}`, description: JSON.stringify({...trace, revealState: state})});
            console.log(`[#18067 ${frame}]`, JSON.stringify({...trace, revealState: state}));

            await expect.poll(() => stateOf(page, overlayId), {message: `[${frame}] the reveal is dismissed`}).toBe('idle');
            await expect(page.locator(overlaySel)).toHaveCount(0);

            // The shield lifts with the reveal: the frame is a pointer target again.
            await expect.poll(pointer, {message: `[${frame}] the shield lifts once the reveal is gone`}).toBe('auto')
        })
    }

    test('a click into the revealed pane\'s own iframe keeps the reveal open (focus-hold)', async ({page}) => {
        const overlayId = await reveal(page),
              railed    = page.locator('#dock-rail-iframe-pane-railed');

        // The revealed pane's own frame keeps its pointer events — the shield is for frames OUTSIDE
        // the overlay — so a frame-locator click on a real element inside it is the honest gesture.
        expect(await railed.evaluate(node => getComputedStyle(node).pointerEvents), 'an inside frame takes the pointer').toBe('auto');

        await page.frameLocator('#dock-rail-iframe-pane-railed').locator('#railed-target').click();
        await page.waitForTimeout(400);

        // Focus moved into the nested document, and the parent's focus manager was told which
        // element holds it — a frame inside the overlay's subtree, so nothing left.
        expect(await page.evaluate(() => document.activeElement?.id), 'focus is in the inside frame').toBe('dock-rail-iframe-pane-railed');
        expect(await stateOf(page, overlayId), 'an inside frame is inside').toBe('revealed-focused');
        await expect(page.locator(overlaySel)).toHaveCount(1)
    });

    test('control: a click on another pane\'s tab header dismisses the reveal on the existing focus path', async ({page}) => {
        const overlayId = await reveal(page);

        await page.locator('.neo-dashboard-dock-tabs', {has: page.locator('.neo-tab-header-button:has-text("Plain")')})
            .locator('.neo-tab-header-button', {hasText: 'Plain'}).click();

        await expect.poll(() => stateOf(page, overlayId), {message: 'the control dismisses'}).toBe('idle');
        await expect(page.locator(overlaySel)).toHaveCount(0)
    })
});

/**
 * The shield that routes an outside click to the dismissal also removes an outside frame as a
 * NATIVE drop target: one hit test governs pointer, dragover and drop, which is the side effect the
 * drag shield's comment in `Global.scss` calls load-bearing. A row native-dragged from the main
 * document into an outside editor frame while a reveal is open therefore races the dismissal: the
 * press fires the rail's outside listener, but the overlay hides one vdom round trip later, and
 * `dragstart` / `dragover` do not wait for that.
 *
 * The control proves the instrument with no reveal open. The reveal arm records the ORDER of the
 * parent's signals — press, drag start, the frame's pointer state at that instant, the overlay
 * hiding — beside what the frame document received, so the verdict below rests on a measured
 * sequence rather than on the event model's reputation. Measured at the shield as first written,
 * the overlay hid AFTER `dragend`, with the frame still shielded at `dragstart` and the drop lost to
 * the parent; the shield now lifts for a native drag's lifetime (`body.neo-native-drag-active`,
 * stamped by the `NativeDragSource` addon), which the receipt's `framePointer` at `dragstart` shows.
 */
test.describe('Neo.dashboard.dock.interaction.Rail — a native drag across the frame boundary', () => {
    const
        SOURCE_SEL = '#dock-rail-iframe-pane-source .dock-rail-iframe-entity',
        TARGET_SEL = '#dock-rail-iframe-pane-plain',
        HIDDEN_CLS = 'neo-dashboard-dock-reveal-overlay-hidden';

    /**
     * Installs the parent-side clocks BEFORE the gesture: the capture-phase drag lifecycle with the
     * outside frame's computed pointer state at each event, a `drop` reaching the parent (the sign a
     * shielded frame was hit-tested away), and the overlay's hidden class landing in the DOM.
     */
    const traceDrag = (page, overlayId) => page.evaluate(({overlayId, targetSel, hiddenCls}) => {
        const trace  = window.__railDragTrace = {events: []},
              target = document.querySelector(targetSel),
              stamp  = (type, extra={}) => trace.events.push({type, at: Date.now(), framePointer: getComputedStyle(target).pointerEvents, ...extra}),
              label  = node => `${node.tagName?.toLowerCase()}#${node.id || ''}`;

        ['mousedown', 'dragstart', 'dragend', 'drop'].forEach(type =>
            document.addEventListener(type, event => stamp(type, {target: label(event.target)}), true));

        const overlay = overlayId && document.getElementById(overlayId);

        if (overlay) {
            const observer = new MutationObserver(() => {
                if (!document.contains(overlay) || overlay.classList.contains(hiddenCls)) {
                    stamp('overlay-hidden');
                    observer.disconnect()
                }
            });

            observer.observe(overlay, {attributes: true, attributeFilter: ['class']});
            observer.observe(overlay.parentNode, {childList: true})
        }
    }, {overlayId, targetSel: TARGET_SEL, hiddenCls: HIDDEN_CLS});

    /**
     * A real browser drag from the source row to the centre of the plain frame, driven as raw pointer
     * input: Chromium starts the native drag on the first move after the press and delivers
     * dragover / drop by hit-testing the target point, exactly as a user's gesture would. A locator
     * drag would first wait for the frame to become a pointer target, which is the very thing the
     * shield denies while a reveal is open.
     */
    const dragRowIntoPlainFrame = async page => {
        const source = await page.locator(SOURCE_SEL).boundingBox(),
              target = await page.locator(TARGET_SEL).boundingBox();

        await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
        await page.mouse.down();
        await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {steps: 4});
        await page.mouse.up()
    };

    /** What the plain frame's own document recorded from the live drag store. */
    const readFrameDrop = page => page.frameLocator(TARGET_SEL).locator('body').evaluate(() => window.__nativeDrop || null);

    /** The lift is a body class for the drag's lifetime; a stuck one would keep the reveal shield down. */
    const liftResidue = page => page.evaluate(() => document.body.classList.contains('neo-native-drag-active'));

    test('control: with no reveal open, the row drops into the plain frame', async ({page}) => {
        await traceDrag(page, null);
        await dragRowIntoPlainFrame(page);

        await expect.poll(() => readFrameDrop(page), {message: 'the frame document received the drop'}).toMatchObject({plain: 'entity:row-7'});
        expect(await liftResidue(page), 'the drag lift leaves no residue').toBe(false)
    });

    test('a native drag into an outside frame while a reveal is open: the drop lands, and the press still dismisses', async ({page}, testInfo) => {
        const overlayId = await reveal(page);

        expect(await page.locator(TARGET_SEL).evaluate(node => getComputedStyle(node).pointerEvents), 'the outside frame is shielded before the press').toBe('none');

        await traceDrag(page, overlayId);
        await dragRowIntoPlainFrame(page);
        await page.waitForTimeout(400);

        const trace = await page.evaluate(() => window.__railDragTrace),
              drop  = await readFrameDrop(page),
              state = await stateOf(page, overlayId),
              order = {...trace, frameDrop: drop, revealState: state};

        // The measurement is the receipt, whatever the verdict below says.
        testInfo.annotations.push({type: 'native-drag-order', description: JSON.stringify(order)});
        console.log('[#18087 native drag]', JSON.stringify(order));

        expect(drop, 'the frame document received the drop').toMatchObject({plain: 'entity:row-7'});
        expect(trace.events.find(event => event.type === 'dragstart')?.framePointer, 'the shield had lifted by dragstart').toBe('auto');
        expect(await liftResidue(page), 'the drag lift leaves no residue').toBe(false);

        await expect.poll(() => stateOf(page, overlayId), {message: 'the press outside the reveal still dismisses it'}).toBe('idle');
        await expect(page.locator(overlaySel)).toHaveCount(0);

        // The shield is back once the drag is over and the reveal gone: a fresh reveal shields again.
        await reveal(page);
        expect(await page.locator(TARGET_SEL).evaluate(node => getComputedStyle(node).pointerEvents), 'the next reveal shields the frame again').toBe('none')
    })
});
