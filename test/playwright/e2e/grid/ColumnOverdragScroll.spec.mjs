import { test, expect } from '../../fixtures.mjs';

/**
 * Whitebox-e2e for locked-grid column-drag OVERDRAG scrolling and the horizontal scrollbar
 * scrollport — the operator's manual repro, automated:
 *
 *   Drag a centre column right until the pointer crosses the centre region's edge → the grid
 *   auto-scrolls (overdrag). Then, in the SAME gesture, drag back left across the centre region
 *   and hold past its left edge → the grid must auto-scroll back — all the way home — and the
 *   drop must land at centre index 0.
 *
 * Pre-fix failure modes this spec pins (all convicted live via the drag trace):
 *   - Overdrag scrolled the GRID CONTAINER via scrollIntoView (not the scroll pipeline): the
 *     locked regions were dragged off-screen, the body never re-rendered, and the SortZone's
 *     scroll term stayed 0 → switch avalanches.
 *   - The back leg hard-stopped with `gridScrollLeft = lockedStartWidth`: scrollIntoView's
 *     'nearest' was satisfied with centre column 0 flush at the GRID's edge — locked columns
 *     hidden, index 0 unreachable, drops landing at the wrong slot.
 *   - The scrollbar's scrollport spanned the full grid width while its spacer modelled centre
 *     content → max scrollLeft fell short by exactly the locked widths; the last centre columns
 *     were unreachable by ANY scrolling.
 *
 * Post-fix contract (what we assert):
 *   - The dedicated horizontal scrollbar element is the ONLY scroll surface that moves; the
 *     grid container's own scrollLeft stays 0 and the locked-start toolbar's viewport rect is
 *     frozen for the whole gesture.
 *   - The trace's `scrollSync` events show the zone's term tracking the scroll in BOTH
 *     directions, returning to exactly 0 on the back leg.
 *   - The drop resolves `end {from: 2, to: 0}` with a null lock verdict (no spurious re-home),
 *     and nothing switches after `end` (the mid-await drag-end race).
 *   - Worker truth (region column arrays) and the rendered DOM agree on the landing.
 *
 * Gesture notes: page.mouse with `{steps}` arms Neo's Mouse drag sensor (see
 * ColumnCrossBodyDnD.spec.mjs). While the pointer HOLDS past a region edge, the worker-side
 * overdrag loop self-feeds — no further mouse events are needed; the spec polls the scrollbar
 * element until each leg settles instead of sleeping fixed amounts.
 *
 * Run: npx playwright test GridColumnOverdragScroll -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Desktop (1920x1080): lockedColumns Fixture Column Overdrag Scrolling (#12906/#12907)', () => {
    test.setTimeout(120000); // two overdrag legs poll-settle sequentially.
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page, neuralLink }) => {
        void neuralLink;
        await page.goto('/examples/grid/lockedColumns/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(500); // settle render before measuring
    });

    test('overdrag right then back left to index 0 — scrollbar-routed, locked region frozen, exact landing', async ({ page, neuralLink }) => {
        const app    = await neuralLink.connectToApp('Neo.examples.grid.lockedColumns');
        const gridId = await resolveGridId(app);

        // Worker preconditions: pristine layout + the dragged column's identity (centre index 2)
        const preRegion = await regionColumns(app, gridId);
        expect(preRegion.lockedStart).toEqual(['id', 'rank', 'login']);
        const draggedField = preRegion.center[2];
        expect(draggedField).toBeTruthy();

        const centerToolbar = page.locator('.neo-grid-header-toolbar').nth(1);
        const startToolbar  = page.locator('.neo-grid-header-toolbar').nth(0);
        const dragHeader    = centerToolbar.locator('.neo-draggable').nth(2);
        await expect(dragHeader).toBeVisible({ timeout: 5000 });

        const dragBox     = await dragHeader.boundingBox();
        const centerBox   = await centerToolbar.boundingBox();
        const startBoxPre = await startToolbar.boundingBox();
        const y           = dragBox.y + dragBox.height / 2;

        // --- Leg 1: drag right past the centre region's edge; HOLD until the auto-scroll settles
        await page.mouse.move(dragBox.x + dragBox.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(Math.min(centerBox.x + centerBox.width + 40, 1910), y, { steps: 40 });

        const maxScroll = await pollScrollbar(page, sl => sl > 0, 'stable');
        expect(maxScroll, 'overdrag right must scroll the dedicated scrollbar element').toBeGreaterThan(0);

        // Mid-gesture invariants: the scrollbar is the ONLY moving scroll surface
        const midState = await scrollSurfaces(page);
        expect(midState.gridScrollLeft,  'the grid container must never scroll during overdrag').toBe(0);
        const startBoxMid = await startToolbar.boundingBox();
        expect(Math.round(startBoxMid.x), 'the locked-start region must stay frozen during overdrag').toBe(Math.round(startBoxPre.x));

        // --- Leg 2: same gesture, drag back left past the centre region's left edge; HOLD until home
        await page.mouse.move(startBoxPre.x + startBoxPre.width - 40, y, { steps: 40 });
        const homeScroll = await pollScrollbar(page, sl => sl === 0, 'value');
        expect(homeScroll, 'the back leg must scroll all the way home — no hard cut at the locked width').toBe(0);

        // Land just inside the centre region's left edge → centre index 0
        await page.mouse.move(centerBox.x + 30, y, { steps: 5 });
        await page.waitForTimeout(250);
        await page.mouse.up();
        await page.waitForTimeout(700);

        // --- Logic-layer oracle: the drag trace
        const traceData = await app.getDragTrace();
        const traces    = traceData?.traces || traceData?.result?.traces || [];
        const trace     = traces[traces.length - 1];
        expect(trace, 'the SortZone must have recorded a trace for the gesture').toBeTruthy();

        const events      = trace.events;
        const endIndex    = events.findIndex(e => e.t === 'end');
        const endEvent    = events[endIndex];
        const lockVerdict = events.find(e => e.t === 'lockVerdict');
        const scrollSyncs = events.filter(e => e.t === 'scrollSync');

        expect(endEvent, 'the gesture must resolve with an end event').toBeTruthy();
        expect(endEvent.from, 'the drag started at centre index 2').toBe(2);
        expect(endEvent.to,   'the drop must land at centre index 0 — the pre-fix run landed at 3').toBe(0);
        expect(lockVerdict?.next, 'a within-centre drop must not re-home the column').toBeNull();

        expect(scrollSyncs.length, 'the zone term must sync on both legs').toBeGreaterThanOrEqual(5);
        expect(scrollSyncs.some(e => e.sl > 0), 'the term must track the rightward scroll').toBe(true);
        expect(scrollSyncs[scrollSyncs.length - 1].sl, 'the term must return to 0 on the back leg').toBe(0);

        const postEndSwitches = events.slice(endIndex + 1).filter(e => e.t === 'switch');
        expect(postEndSwitches, 'no switch may fire after the end event (mid-await drag-end race)').toEqual([]);

        // --- Worker + DOM oracles: the landing
        const region   = await regionColumns(app, gridId);
        const domOrder = await getColumnOrder(page, 1);
        expect(region.center[0], 'worker truth: the dragged column owns centre index 0').toBe(draggedField);
        expect(region.lockedStart, 'the locked-start region membership must be untouched').toEqual(['id', 'rank', 'login']);
        expect(domOrder[0], 'DOM truth: the dragged column renders first in the centre toolbar').toBe(await headerLabel(page, 1, 0));

        // --- Three-surface consistency: items / vdom / DOM agree, zero duplicates
        const toolbars = await app.findInstances({ ntype: 'grid-header-toolbar' }, ['id', 'layoutLock']);
        const centerTb = (Array.isArray(toolbars) ? toolbars : [toolbars]).find(t => !t.layoutLock && !t.properties?.layoutLock);
        if (centerTb?.id) {
            const consistency = await app.verifyComponentConsistency(centerTb.id);
            const mismatches  = consistency?.mismatches || consistency?.result?.mismatches || [];
            expect(mismatches, 'post-drop items/vdom/DOM surfaces must agree').toEqual([]);
        }

        // --- Clean restore: every scroll surface back at origin
        const endState = await scrollSurfaces(page);
        expect(endState.scrollbarScrollLeft).toBe(0);
        expect(endState.gridScrollLeft).toBe(0);
    });

    test('scrollbar scrollport is scoped to the centre region — full range, margins = locked widths (#12907)', async ({ page, neuralLink }) => {
        await neuralLink.connectToApp('Neo.examples.grid.lockedColumns'); // session-bind keeps the page's worker authoritative

        const result = await page.evaluate(async () => {
            const sleep   = ms => new Promise(r => setTimeout(r, ms));
            const sb      = document.querySelector('.neo-grid-horizontal-scrollbar');
            const tbs     = document.querySelectorAll('.neo-grid-header-toolbar');
            const startTb = tbs[0], centerTb = tbs[1], endTb = tbs[2];
            const cs      = getComputedStyle(sb);

            sb.scrollLeft = 999999;
            await sleep(400);

            const lastBtn = centerTb.children[centerTb.children.length - 1];
            const atMax   = {
                scrollbar   : sb.scrollLeft,
                scrollbarMax: sb.scrollWidth - sb.clientWidth,
                toolbar     : centerTb.scrollLeft,
                lastFlush   : Math.abs(lastBtn.getBoundingClientRect().right - centerTb.getBoundingClientRect().right) < 2
            };

            sb.scrollLeft = 0;
            await sleep(300);

            return {
                marginLeft : cs.marginLeft,
                marginRight: cs.marginRight,
                startWidth : Math.round(startTb.getBoundingClientRect().width),
                endWidth   : Math.round(endTb.getBoundingClientRect().width),
                scrollport : sb.clientWidth,
                centerClip : centerTb.clientWidth,
                atMax,
                reset      : { scrollbar: sb.scrollLeft, toolbar: centerTb.scrollLeft }
            };
        });

        expect(result.marginLeft,  'margin-left must equal the locked-start width').toBe(`${result.startWidth}px`);
        expect(result.marginRight, 'margin-right must equal the locked-end width').toBe(`${result.endWidth}px`);
        expect(result.scrollport,  'the scrollport must equal the centre clip width').toBe(result.centerClip);

        expect(result.atMax.scrollbar, 'the scrollbar must reach its own full scroll range').toBe(result.atMax.scrollbarMax);
        expect(result.atMax.toolbar,   'the center header must track the scrollbar position').toBe(result.atMax.scrollbar);
        expect(result.atMax.lastFlush, 'the last centre column must be flush with the centre region edge at max scroll').toBe(true);

        expect(result.reset.scrollbar).toBe(0);
        expect(result.reset.toolbar).toBe(0);
    });
});

/**
 * Resolves the lockedColumns fixture's grid-container instance id from the App Worker.
 * @returns {Promise<String>}
 */
async function resolveGridId(app) {
    const grids  = await app.findInstances({ ntype: 'grid-container' }, ['id']);
    const gridId = Array.isArray(grids) ? grids[0]?.id : grids?.id;
    expect(gridId, 'a grid-container instance must exist in the bound App Worker').toBeTruthy();
    return gridId;
}

/**
 * Reads the grid's three region-grouped column arrays from the App Worker as ordered dataField
 * lists — the engine's authoritative region+index model (see ColumnCrossBodyDnD.spec.mjs).
 * @returns {Promise<{center: String[], lockedStart: String[], lockedEnd: String[]}>}
 */
async function regionColumns(app, gridId) {
    const props  = await app.getComponent(gridId, ['centerColumns', 'lockedStartColumns', 'lockedEndColumns']);
    const fields = arr => (arr || []).map(col => col.dataField);
    return {
        center     : fields(props.centerColumns),
        lockedStart: fields(props.lockedStartColumns),
        lockedEnd  : fields(props.lockedEndColumns)
    };
}

/**
 * Reads the header column labels in order for a region toolbar (DOM oracle layer).
 * Region order: 0 = locked-start, 1 = centre, 2 = locked-end.
 */
async function getColumnOrder(page, toolbarIndex) {
    return page.evaluate(idx => {
        const tb = document.querySelectorAll('.neo-grid-header-toolbar')[idx];
        if (!tb) return [];
        return Array.from(tb.querySelectorAll('.neo-button-text'))
            .map(el => (el.textContent || '').trim())
            .filter(Boolean);
    }, toolbarIndex);
}

/**
 * Reads a single header label by region toolbar index + button index.
 */
async function headerLabel(page, toolbarIndex, buttonIndex) {
    const order = await getColumnOrder(page, toolbarIndex);
    return order[buttonIndex];
}

/**
 * Snapshot of every horizontal scroll surface the fix routes (or pins).
 */
async function scrollSurfaces(page) {
    return page.evaluate(() => ({
        scrollbarScrollLeft: document.querySelector('.neo-grid-horizontal-scrollbar')?.scrollLeft ?? -1,
        gridScrollLeft     : document.querySelector('.neo-grid-container')?.scrollLeft ?? -1
    }));
}

/**
 * Polls the dedicated horizontal scrollbar element while the mouse HOLDS in an overdrag zone.
 * mode 'stable': resolves once `accept(sl)` holds AND the value stops changing across 3
 * consecutive samples (the overdrag walk settled — e.g. at the content end). mode 'value':
 * resolves as soon as `accept(sl)` holds. Returns the final sampled value; bounded at ~8s.
 */
async function pollScrollbar(page, accept, mode) {
    let last = -1, stable = 0;

    for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(200);

        const sl = await page.evaluate(() =>
            document.querySelector('.neo-grid-horizontal-scrollbar')?.scrollLeft ?? -1);

        if (mode === 'value' && accept(sl)) return sl;

        if (mode === 'stable') {
            stable = (sl === last) ? stable + 1 : 0;
            if (accept(sl) && stable >= 3) return sl;
        }

        last = sl;
    }

    return last;
}

/**
 * @summary Holds the first armed owner-scroll completion after the real method, including its DOM scroll, ran.
 * The routed test-only methods inspect the SortZone but never assign its snapshot, index, map or styles.
 * @param {import('@playwright/test').BrowserContext} context
 * @returns {Promise<{hits: Number, restore: Function}>}
 */
async function holdOwnerScroll(context) {
    const pattern   = '**/src/grid/header/Toolbar.mjs',
          signature = '    async scrollToIndex(index, itemRect) {';
    let   hits    = 0;
    const handler = async route => {
        const response = await route.fetch(), source = await response.text();
        expect(source.split(signature)).toHaveLength(2);
        hits++;
        await route.fulfill({response, body: source.replace(signature, `
    armContinuationScroll() {
        this.continuationScroll = {entered: false, released: false, returned: false};
    }
    releaseContinuationScroll() {
        const hold = this.continuationScroll;
        if (hold) { hold.released = true; hold.release?.() }
    }
    getContinuationSnapshot() {
        const hold = this.continuationScroll, zone = this.sortZone;
        return {marker: 'owner-scroll-completion', hold: hold && {
            entered: hold.entered, released: hold.released, returned: hold.returned,
            index: hold.index, before: hold.before, after: hold.after, componentId: hold.componentId
        }, snapshot: zone && {
            componentId: zone.dragComponent?.id, proxyId: zone.dragProxy?.id || null,
            index: zone.currentIndex, ending: zone.dragEndActive, starting: zone.dragStartPending,
            map: zone.indexMap && {...zone.indexMap},
            rects: zone.itemRects?.map(rect => ({x: rect.x, y: rect.y, width: rect.width, height: rect.height})) || null,
            positions: this.items.map(item => {const style = item.wrapperStyle || {}; return {
                id: item.id, left: style.left || '', top: style.top || '',
                width: style.width || '', height: style.height || '', position: style.position || ''
            }})
        }}
    }
    async scrollToIndex(index, itemRect) {
        const hold = this.continuationScroll, before = this.scrollLeft;
        await this.scrollToIndexUnheld(index, itemRect);
        if (hold && !hold.entered && !hold.released) {
            Object.assign(hold, {entered: true, index, before, after: this.scrollLeft, componentId: this.sortZone.dragComponent.id});
            await new Promise(resolve => {hold.release = resolve});
            hold.returned = true
        }
    }
    async scrollToIndexUnheld(index, itemRect) {`)})
    };
    await context.route(pattern, handler);
    return {get hits() {return hits}, restore: () => context.unroute(pattern, handler)}
}

test.describe('Native overdrag continuation ownership', () => {
    test.use({viewport: {width: 1920, height: 1080}});

    test('a cancelled scroll cannot rearrange the next native header gesture', async ({page, neuralLink}, testInfo) => {
        const intervention = await holdOwnerScroll(page.context());
        let app, toolbarId, held, before, after, nativeBefore, nativeAfter, witnessLoaded = false;
        const read            = () => app.callMethod(toolbarId, 'getContinuationSnapshot', []),
              nativePositions = ids => page.evaluate(ids => ids.map(id => {
                  const node = document.getElementById(id), rect = node.getBoundingClientRect();
                  return {id, left: node.style.left, top: node.style.top, width: node.style.width,
                      height: node.style.height, position: node.style.position, x: rect.x, y: rect.y}
              }), ids),
              visibleHeaders = () => page.evaluate(id => {
                  const toolbar = document.getElementById(id), clip = toolbar.getBoundingClientRect();
                  return [...toolbar.querySelectorAll('.neo-draggable')].map(node => ({id: node.id, rect: node.getBoundingClientRect().toJSON()}))
                      .filter(({rect}) => rect.width > 20 && rect.left >= clip.left + 2 && rect.right <= clip.right - 2)
              }, toolbarId);
        try {
            await page.goto('/examples/grid/lockedColumns/');
            await expect(page.locator('[role="grid"]')).toBeVisible({timeout: 30000});
            app = await neuralLink.connectToApp('Neo.examples.grid.lockedColumns');
            const toolbars = [].concat(await app.findInstances({ntype: 'grid-header-toolbar'}, ['id', 'layoutLock']));
            toolbarId = toolbars.find(item => !(item.layoutLock || item.properties?.layoutLock)).id;
            await expect.poll(async () => (await read()).snapshot?.index).toBe(-1);
            expect((await read()).marker, 'the actual App worker loaded the routed owner').toBe('owner-scroll-completion');
            expect(intervention.hits, 'worker module interception is observed, not assumed').toBeGreaterThan(0);
            witnessLoaded = true;
            const toolbar = page.locator(`[id="${toolbarId}"]`),
                  initial = await read(), initialScroll = await scrollSurfaces(page),
                  headers = await visibleHeaders(), first = headers.at(-1), clip = await toolbar.boundingBox();
            expect(headers.length).toBeGreaterThan(2);
            const x       = first.rect.left + first.rect.width / 2, y = first.rect.top + first.rect.height / 2,
                  outside = Math.min(clip.x + clip.width + 40, 1910);
            expect(outside).toBeGreaterThan(clip.x + clip.width);
            await app.callMethod(toolbarId, 'armContinuationScroll', []);
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x + 8, y, {steps: 4});
            await page.mouse.move(outside, y, {steps: 20});
            await expect.poll(async () => (await read()).hold.entered).toBe(true);
            held = await read();
            expect(held.hold.componentId).toBe(first.id);
            expect(held.hold.after, 'the real owner scroll ran before its completion was held').toBeGreaterThan(held.hold.before);
            expect((await scrollSurfaces(page)).scrollbarScrollLeft).toBeGreaterThan(initialScroll.scrollbarScrollLeft);

            await page.keyboard.press('Escape');
            await page.mouse.up();
            await expect.poll(async () => {
                const {snapshot} = await read();
                return snapshot.index === -1 && snapshot.rects === null && snapshot.proxyId === null && !snapshot.ending
            }).toBe(true);
            await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
            expect((await read()).snapshot.positions.map(item => item.id)).toEqual(initial.snapshot.positions.map(item => item.id));

            const second = (await visibleHeaders()).find(item => item.id !== first.id &&
                initial.snapshot.positions.findIndex(candidate => candidate.id === item.id) !== held.hold.index - 1);
            expect(second, 'another visible header starts a distinct native gesture').toBeTruthy();
            const secondX = second.rect.left + second.rect.width / 2, secondY = second.rect.top + second.rect.height / 2;
            await page.mouse.move(secondX, secondY);
            await page.mouse.down();
            await page.mouse.move(secondX + 8, secondY, {steps: 4});
            await expect.poll(async () => {
                const {snapshot} = await read();
                return snapshot.componentId === second.id && snapshot.rects?.length > 1 && !snapshot.starting
            }).toBe(true);
            before = await read();
            await expect(page.locator(`[id="${before.snapshot.proxyId}"]`)).toBeVisible();
            const ids = before.snapshot.positions.map(item => item.id);
            await expect.poll(() => nativePositions(ids), {message: 'the second gesture pins its actual header DOM'}).toMatchObject(before.snapshot.positions);
            nativeBefore = await nativePositions(ids);
            expect(before.hold.released).toBe(false);
            expect(before.snapshot.index).not.toBe(held.hold.index - 1);

            await app.callMethod(toolbarId, 'releaseContinuationScroll', []);
            await expect.poll(async () => (await read()).hold.returned).toBe(true);
            // No new pointer input: let any deltas produced by the old continuation reach the native surface.
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            after = await read();
            nativeAfter = await nativePositions(ids);
            expect(after.snapshot.componentId).toBe(second.id);
            expect.soft(after.snapshot.index, 'old work leaves the new index intact').toBe(before.snapshot.index);
            expect.soft(after.snapshot.map, 'old work leaves the new mapping intact').toEqual(before.snapshot.map);
            expect.soft(after.snapshot.rects).toEqual(before.snapshot.rects);
            expect.soft(after.snapshot.positions).toEqual(before.snapshot.positions);
            expect(nativeAfter, 'the native header positions remain those of the second gesture').toEqual(nativeBefore)
        } finally {
            try {
                if (witnessLoaded) {
                    // Retain the race before cleanup can change its state, including when an assertion failed.
                    const trace = await app.getDragTrace().catch(error => ({error: error.message}));
                    await testInfo.attach('scroll-continuation', {contentType: 'application/json',
                        body: JSON.stringify({held, before, after, nativeBefore, nativeAfter, trace}, null, 2)});
                    await app.callMethod(toolbarId, 'releaseContinuationScroll', []);
                    await page.keyboard.press('Escape');
                    await page.mouse.up();
                    await expect.poll(async () => {
                        const {snapshot} = await read();
                        return snapshot.index === -1 && snapshot.rects === null && snapshot.proxyId === null && !snapshot.ending
                    }, {message: 'cleanup reaches the ordinary idle snapshot'}).toBe(true);
                    await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
                }
            } finally {
                await intervention.restore()
            }
        }
    })
});
