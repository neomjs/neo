import { test, expect } from '../../fixtures.mjs';

/**
 * Whitebox-e2e: repeated committed splitter drags keep worker, header, and cell geometry aligned.
 *
 * After committed DockSplitter resizes, the 100k Matrix grid could keep painting while
 * its geometry generations drifted apart — header labels narrower than their cells, the last
 * body column clipped at the shared right edge, phantom mounted columns. Two stacked mechanisms:
 * a first-resize-after-mount skip flag could consume a REAL resize whose register-time echo lost
 * its routing race (freezing worker geometry at the mount value), and the grid's resize
 * measurement ran `getBoundingClientRect()` through async worker→main round-trips that could
 * land inside DockFlip's inverse-transform presentation window, persisting transform-scaled
 * VISUAL rects as `containerWidth` / `availableWidth` / `columnPositions` (witnessed live:
 * containerWidth 476.77 and availableWidth 1328.72 at a settled 388px rest). The repair: every
 * delivery re-derives geometry (no skip), through layout-box metrics (`getLayoutRect()`), which
 * transforms never affect.
 *
 * The drag guard drives the ticket's own recipe — a bounded series of real committed drags,
 * BOTH directions, repeated cycles — and after every settled commit asserts the attribution
 * matrix in three coordinate spaces, each surface keyed by `aria-colindex` (the grid's own
 * accessibility contract, present on header buttons and body cells alike):
 *   1. key-set identity: the visible header and cell key sets are EQUAL (cardinality + identity
 *      — a missing or shifted column on either surface fails here, not in a truncated zip);
 *   2. visual space: per-key header↔cell `getBoundingClientRect` left/width agreement (±1px) —
 *      the ticket's user-visible symptom;
 *   3. content space (scroll-invariant by construction): worker `columnPositions` width/x per
 *      dataField against the cell's `style.left`/layout width AND the header button's
 *      `offsetLeft`/layout width — plus worker `containerWidth`/`availableWidth` against the
 *      container/button layout truth.
 *
 * Settlement is event/state-based only, with a POSITIVE motion-entry barrier: a MutationObserver
 * must first witness the dock-motion lifecycle class ENTER (guarding against asserting before
 * the deferred projection even starts), then release (class absent, zero fixed-stage residue,
 * transform-free grid). No fixed-delay sleeps, per the ticket's walls.
 *
 * The race itself is pinned RACE-FREE by the first test: it freezes a "mid-motion" frame (a
 * static ancestor scale transform), triggers the measurement through the projection's own
 * mutation class (the normalized flex pair written to both pane tab containers), and asserts
 * the worker persists the LAYOUT box. Pre-fix that fails deterministically on every run — no
 * lucky timing can green-wash it. The same test binds the measurement primitive's no-box
 * contract: a `display: none` node resolves to the zero shape, never phantom specified sizes.
 *
 * Run: npx playwright test WorkstationSplitterGridGeometryNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation splitter drags: grid geometry stays attributable (#16375)', () => {
    test.setTimeout(180000);
    test.use({ viewport: { width: 1280, height: 720 } });

    const GRID_ID = 'neo-grid-container-1',
          BODY_ID = 'neo-grid-body-1';

    /**
     * Page-side geometry matrix for the Matrix grid. Headers and cells are keyed by
     * `aria-colindex`; sizes are layout-truth (computed used values), positions carry BOTH
     * spaces: visual (`getBoundingClientRect`) and content (`offsetLeft` for header buttons,
     * `style.left` for absolutely positioned cells — both scroll- and transform-invariant).
     */
    const readMatrix = page => page.evaluate(gridId => {
        const grid    = document.getElementById(gridId),
              header  = grid.querySelector('.neo-grid-header-toolbar'),
              body    = grid.querySelector('.neo-grid-body'),
              clip    = body.getBoundingClientRect(),
              inClip  = r => r.width > 0 && r.right > clip.left + 1 && r.left < clip.right - 1,
              row     = body.querySelector('[role="row"]'),
              headers = {},
              cells   = {};

        // Collect RAW rows first (duplicate keys must stay countable — an object write would
        // collapse a duplicated column silently before any cardinality assert), then key.
        const headerRows = [],
              cellRows   = [];

        [...header.children].forEach(b => {
            const key = b.getAttribute('aria-colindex'),
                  r   = b.getBoundingClientRect();

            if (key && inClip(r)) {
                headerRows.push({
                    key,
                    visualX : r.left,
                    visualW : r.width,
                    contentX: b.offsetLeft,
                    layoutW : parseFloat(getComputedStyle(b).width)
                })
            }
        });

        row && [...row.children].forEach(c => {
            const key = c.getAttribute('aria-colindex'),
                  r   = c.getBoundingClientRect();

            if (key && inClip(r)) {
                cellRows.push({
                    key,
                    dataField: c.getAttribute('data-field'),
                    visualX  : r.left,
                    visualW  : r.width,
                    contentX : parseFloat(c.style.left),
                    layoutW  : parseFloat(getComputedStyle(c).width)
                })
            }
        });

        headerRows.forEach(h => { headers[h.key] = h });
        cellRows.forEach(c => { cells[c.key] = c });

        return {
            headerRowCount: headerRows.length,
            cellRowCount  : cellRows.length,
            layoutWidth   : parseFloat(getComputedStyle(grid).width),
            transform     : getComputedStyle(grid).transform,
            buttonWidthSum: [...header.children]
                .filter(b => b.getClientRects().length > 0)
                .reduce((sum, b) => sum + parseFloat(getComputedStyle(b).width), 0),
            scrollLeft    : header.scrollLeft,
            headers,
            cells
        };
    }, GRID_ID);

    /** Worker-truth read: containerWidth, availableWidth, scroll state, and the keyed columnPositions. */
    async function readWorker(app) {
        const props = await app.getComponent(BODY_ID, ['containerWidth', 'availableWidth', 'scrollLeft', 'columnPositions.items']);

        return {
            containerWidth : props.containerWidth,
            availableWidth : props.availableWidth,
            scrollLeft     : props.scrollLeft,
            columnPositions: props['columnPositions.items'] || []
        };
    }

    test('measurement stays layout-true while an ancestor transform holds (deterministic reproducer)', async ({ page, neuralLink }) => {
        const SCALE_X = 0.6,
              SCALE_Y = 0.85;

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-tour-play', {timeout: 30000});
        await page.waitForSelector(`#${GRID_ID}`, {timeout: 30000});

        const app = await neuralLink.connectToApp('Workstation');

        // boot settlement: the worker knows the real grid width
        await expect.poll(async () => (await readWorker(app)).containerWidth,
            {timeout: 15000, intervals: [100, 250]}).toBeGreaterThan(0);

        const boot = await readMatrix(page);

        // ARM THE TRAP: freeze a "mid-motion" frame — a static ancestor scale transform —
        // and plant the primitive's contract fixtures inside it.
        await page.evaluate(([sx, sy]) => {
            document.body.style.transformOrigin = 'left top';
            document.body.style.transform       = `scale(${sx}, ${sy})`;

            const visible = document.createElement('div');
            visible.id = 'probe-16375-visible';
            visible.style.cssText = 'position:absolute;left:0;top:0;width:333.5px;height:41.5px;pointer-events:none;opacity:0;';
            document.body.appendChild(visible);

            const hidden = document.createElement('div');
            hidden.id = 'probe-16375-hidden';
            hidden.style.cssText = 'display:none;width:222px;height:33px;';
            document.body.appendChild(hidden);

            // non-replaced inline: computed width/height resolve to 'auto' (the unresolved-size
            // class) — the primitive's documented fallback is integer offset metrics. The fixed
            // off-viewport wrapper keeps document flow untouched; the span inside stays inline.
            const inlineHost = document.createElement('div');
            inlineHost.id = 'probe-16375-inline-host';
            inlineHost.style.cssText = 'position:fixed;left:-500px;top:0;pointer-events:none;opacity:0;';
            const inline = document.createElement('span');
            inline.id = 'probe-16375-inline';
            inline.textContent = 'unresolved-size probe';
            inlineHost.appendChild(inline);
            document.body.appendChild(inlineHost);
            globalThis.__probe16375InlineOffset = {w: inline.offsetWidth, h: inline.offsetHeight}
        }, [SCALE_X, SCALE_Y]);

        // trap premises: the visual box IS scaled; the layout box is NOT
        const armed = await page.evaluate(gridId => {
            const grid = document.getElementById(gridId);
            return {
                visualWidth: grid.getBoundingClientRect().width,
                layoutWidth: parseFloat(getComputedStyle(grid).width)
            };
        }, GRID_ID);

        expect(Math.abs(armed.visualWidth - boot.layoutWidth * SCALE_X),
            'trap premise: getBoundingClientRect reports the scaled visual box').toBeLessThan(2);
        expect(Math.abs(armed.layoutWidth - boot.layoutWidth),
            'trap premise: the layout box ignores the ancestor transform').toBeLessThan(1);

        // PRIMITIVE CONTRACT, through the full worker→main path, under the held transform:
        // a visible box reports fractional LAYOUT truth; a no-box node reports the zero shape;
        // an unresolved-size node (inline: computed 'auto') reports its integer offset metrics.
        const [visibleRect, hiddenRect, inlineRect] = await app.callMethod(
            GRID_ID, 'getLayoutRect', [['probe-16375-visible', 'probe-16375-hidden', 'probe-16375-inline']]);

        expect(Math.abs(visibleRect.width - 333.5),
            'primitive contract: a transformed visible box reports its fractional layout width').toBeLessThan(0.1);
        expect(Math.abs(visibleRect.height - 41.5),
            'primitive contract: a transformed visible box reports its fractional layout height').toBeLessThan(0.1);
        expect(hiddenRect.width, 'primitive contract: a display:none node reports zero width, not its specified size').toBe(0);
        expect(hiddenRect.height, 'primitive contract: a display:none node reports zero height, not its specified size').toBe(0);

        const inlineOffset = await page.evaluate(() => globalThis.__probe16375InlineOffset);

        expect(inlineRect.width, 'primitive contract: an unresolved-size node falls back to its integer offset width')
            .toBe(inlineOffset.w);
        expect(inlineRect.height, 'primitive contract: an unresolved-size node falls back to its integer offset height')
            .toBe(inlineOffset.h);
        expect(inlineRect.width, 'the unresolved-size probe is actually rendered').toBeGreaterThan(0);

        // TRIGGER: the deferred projection's own mutation class — the normalized flex pair the
        // projection writes on both pane tab containers — changes the grid layout box while the
        // transform holds, so the resize measurement pipeline runs against the frozen mid-motion frame.
        const originalFlex = await page.evaluate(() => {
            const paneA = document.getElementById('neo-tab-container-2'),
                  paneB = document.getElementById('neo-tab-container-3'),
                  flex  = [paneA.style.flex, paneB.style.flex];

            paneA.style.flex = '0.85 1 0%';
            paneB.style.flex = '0.15 1 0%';
            return flex;
        });

        // the flex write re-laid-out the grid
        await expect.poll(async () => (await readMatrix(page)).layoutWidth, {
            message  : 'the flex mutation grows the grid layout box',
            timeout  : 5000,
            intervals: [50, 100]
        }).toBeGreaterThan(boot.layoutWidth + 50);

        // THE SEAM ASSERTIONS: the worker persists LAYOUT truth, not visual fiction.
        // Pre-fix, containerWidth lands at ~SCALE_X * layoutWidth and availableWidth at
        // ~SCALE_X * buttonWidthSum (the gBCR samples), so these polls time out red.
        await expect.poll(async () => {
            const {containerWidth} = await readWorker(app),
                  current          = await readMatrix(page);
            return Math.abs(containerWidth - current.layoutWidth)
        }, {
            message  : 'worker containerWidth equals the grid layout width (not the transform-scaled visual width)',
            timeout  : 10000,
            intervals: [100, 250]
        }).toBeLessThan(1);

        await expect.poll(async () => {
            const {availableWidth} = await readWorker(app),
                  current          = await readMatrix(page);
            return Math.abs(availableWidth - current.buttonWidthSum)
        }, {
            message  : 'worker availableWidth equals the summed header-button layout widths (not their scaled visual widths)',
            timeout  : 10000,
            intervals: [100, 250]
        }).toBeLessThan(1.5);

        // DISARM + coherence: restore fixtures, pane flex pair, and the transform.
        await page.evaluate(flex => {
            document.getElementById('probe-16375-visible').remove();
            document.getElementById('probe-16375-hidden').remove();
            document.getElementById('probe-16375-inline-host').remove();
            delete globalThis.__probe16375InlineOffset;
            document.getElementById('neo-tab-container-2').style.flex = flex[0];
            document.getElementById('neo-tab-container-3').style.flex = flex[1];
            document.body.style.transform       = '';
            document.body.style.transformOrigin = ''
        }, originalFlex);

        await expect.poll(async () => {
            const {containerWidth} = await readWorker(app),
                  current          = await readMatrix(page);
            return Math.abs(containerWidth - current.layoutWidth)
        }, {
            message  : 'worker containerWidth re-converges on the layout box after the transform clears',
            timeout  : 10000,
            intervals: [100, 250]
        }).toBeLessThan(1);

        // SUB-PIXEL DELIVERY IS PROCESSED: a fractional flex nudge moves the grid layout box by
        // well under one CSS pixel; the worker must track it. This binds the size-equivalence
        // class — any <1px "same size" predicate swallows exactly this delivery (witnessed on
        // real Chromium: 123.4375 → 123.9375). The retired FIRST-delivery skip is bound
        // separately: the large flex trigger above and the drag test's first commit are first
        // post-registration deliveries, both red under the skip in the pre-fix stash round.
        const settled = await readMatrix(page);

        await page.evaluate(() => {
            document.getElementById('neo-tab-container-2').style.flex = '0.6005 1 0%';
            document.getElementById('neo-tab-container-3').style.flex = '0.3995 1 0%'
        });

        await expect.poll(async () => (await readMatrix(page)).layoutWidth, {
            message  : 'the fractional flex nudge moves the layout box sub-pixel',
            timeout  : 5000,
            intervals: [50, 100]
        }).toBeGreaterThan(settled.layoutWidth + 0.2);

        const nudged = await readMatrix(page);

        expect(nudged.layoutWidth - settled.layoutWidth,
            'the nudge stays sub-pixel (the swallowed class)').toBeLessThan(1);

        await expect.poll(async () => {
            const {containerWidth} = await readWorker(app),
                  current          = await readMatrix(page);
            return Math.abs(containerWidth - current.layoutWidth)
        }, {
            message  : 'worker containerWidth tracks a sub-pixel resize delivery (processed, never swallowed)',
            timeout  : 10000,
            intervals: [100, 250]
        }).toBeLessThan(0.25);

        // restore the original flex pair; geometry re-converges once more
        await page.evaluate(flex => {
            document.getElementById('neo-tab-container-2').style.flex = flex[0];
            document.getElementById('neo-tab-container-3').style.flex = flex[1]
        }, originalFlex);

        await expect.poll(async () => {
            const {containerWidth} = await readWorker(app),
                  current          = await readMatrix(page);
            return Math.abs(containerWidth - current.layoutWidth)
        }, {
            message  : 'worker containerWidth re-converges after the nudge restores',
            timeout  : 10000,
            intervals: [100, 250]
        }).toBeLessThan(1)
    });

    test('worker, header, and cells agree after every settled committed drag, both directions', async ({ page, neuralLink }) => {
        const pageErrors = [];

        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-tour-play', {timeout: 30000});
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 30000});
        await page.waitForSelector(`#${GRID_ID}`, {timeout: 30000});

        const app         = await neuralLink.connectToApp('Workstation'),
              root        = page.locator('.workstation-workspace'),
              workspaces  = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              workspaceId = (Array.isArray(workspaces) ? workspaces : [workspaces])[0]?.id;

        expect(workspaceId, 'the page owns a Workstation workspace').toBeTruthy();

        // boot settlement: worker knows the grid width before the first drag
        await expect.poll(async () => (await readWorker(app)).containerWidth,
            {timeout: 15000, intervals: [100, 250]}).toBeGreaterThan(0);

        const boot = await readMatrix(page);

        /** One committed drag + positive-entry settlement + the keyed attribution matrix. */
        async function dragAndVerify(deltaX, tag) {
            // resizable edge zones share the orientation class — only the SPLIT container's own
            // child is the resizeSplit affordance this journey commits through
            const splitter                 = page.locator('.neo-dashboard-dock-split-horizontal > .neo-dashboard-dock-splitter-horizontal'),
                  box                      = await splitter.boundingBox(),
                  sx                       = box.x + box.width / 2,
                  sy                       = box.y + box.height / 2,
                  before                   = await readMatrix(page),
                  {dockModel: modelBefore} = await app.getComponent(workspaceId, ['dockModel']);

            // positive motion-entry barrier: witness the lifecycle ENTER, not just its absence later
            await page.evaluate(() => {
                const el = document.querySelector('.workstation-workspace');
                globalThis.__motion16375?.observer.disconnect();
                globalThis.__motion16375 = {
                    seen    : el.classList.contains('neo-dashboard-dock-animating'),
                    observer: new MutationObserver(() => {
                        el.classList.contains('neo-dashboard-dock-animating') && (globalThis.__motion16375.seen = true)
                    })
                };
                globalThis.__motion16375.observer.observe(el, {attributes: true, attributeFilter: ['class']})
            });

            await page.mouse.move(sx, sy);
            await page.mouse.down();
            // the Mouse sensor arms once delay AND minDistance are both satisfied — at a move
            // event, or when the delay timer re-enters with the latest coords. Arming here,
            // BEFORE the travel, keeps every travel move inside the live drag session (moves
            // fired pre-arm carry no drag:move and leave the preview at its start size)
            await page.waitForTimeout(130);
            await page.mouse.move(sx + Math.sign(deltaX) * 12, sy, {steps: 4});
            await page.mouse.move(sx + deltaX, sy, {steps: 15});
            await page.waitForTimeout(400); // gesture hold before release (drag realism, not settlement)
            await page.mouse.up();

            // settlement, event/state-based only:
            // 1. the semantic document committed
            await expect.poll(async () => {
                const {dockModel} = await app.getComponent(workspaceId, ['dockModel']);
                return Math.abs(dockModel.nodes['split-main'].sizes[0] - modelBefore.nodes['split-main'].sizes[0])
            }, {
                message  : `${tag}: the drag commits a semantic resizeSplit document change`,
                timeout  : 10000,
                intervals: [50, 100]
            }).toBeGreaterThan(0.02);

            // 2. the deferred projection applied the committed extent to live DOM
            await expect.poll(async () => (await readMatrix(page)).layoutWidth, {
                message  : `${tag}: the projection applies the committed split to the grid layout box`,
                timeout  : 10000,
                intervals: [50, 100]
            }).toBeCloseTo(before.layoutWidth + deltaX, 0);

            // 3. the motion lifecycle ENTERED (positive barrier) ...
            await expect.poll(() => page.evaluate(() => globalThis.__motion16375.seen), {
                message  : `${tag}: the committed resize enters the dock-motion lifecycle`,
                timeout  : 10000,
                intervals: [25, 50]
            }).toBe(true);

            // ... and fully released the presentation
            await expect(root, `${tag}: the dock motion lifecycle settles`)
                .not.toHaveClass(/neo-dashboard-dock-animating/, {timeout: 10000});
            await expect(page.locator('.neo-dock-flip-fixed-stage'),
                `${tag}: no fixed-stage presentation residue`).toHaveCount(0);

            const settled = await readMatrix(page);

            expect(settled.transform, `${tag}: the grid carries no residual transform`).toBe('none');

            // ATTRIBUTION MATRIX (worker → header → body), keyed by aria-colindex:
            // 1. worker containerWidth rides the layout box — poisoned visual samples time this out
            await expect.poll(async () => {
                const {containerWidth} = await readWorker(app),
                      current          = await readMatrix(page);
                return Math.abs(containerWidth - current.layoutWidth)
            }, {
                message  : `${tag}: worker containerWidth equals the grid layout width`,
                timeout  : 5000,
                intervals: [100, 250]
            }).toBeLessThan(1);

            const worker = await readWorker(app),
                  matrix = await readMatrix(page);

            // 2. scroll state agrees across worker and main BEFORE any geometry comparison —
            //    a scroll divergence would shift every visual-space read
            expect(Math.abs(worker.scrollLeft - matrix.scrollLeft),
                `${tag}: worker scrollLeft agrees with the header toolbar's native scroll state`)
                .toBeLessThan(0.5);

            // 3. worker availableWidth rides the header buttons' summed LAYOUT widths
            expect(Math.abs(worker.availableWidth - matrix.buttonWidthSum),
                `${tag}: worker availableWidth equals the summed header-button layout widths`)
                .toBeLessThan(1.5);

            // 3. key-set identity WITHOUT duplicate collapse: raw per-surface counts must equal
            //    unique key counts (a duplicated column on either surface fails HERE), and the
            //    worker's columnPositions must be dataField-unique before it serves as a map.
            const headerKeys = Object.keys(matrix.headers).sort((a, b) => a - b),
                  cellKeys   = Object.keys(matrix.cells).sort((a, b) => a - b);

            expect(matrix.headerRowCount, `${tag}: no duplicated aria-colindex among visible header buttons`)
                .toBe(headerKeys.length);
            expect(matrix.cellRowCount, `${tag}: no duplicated aria-colindex among visible row-0 cells`)
                .toBe(cellKeys.length);
            expect(new Set(worker.columnPositions.map(c => c.dataField)).size,
                `${tag}: worker columnPositions carry unique dataFields`)
                .toBe(worker.columnPositions.length);

            expect(headerKeys.length, `${tag}: visible header buttons exist`).toBeGreaterThan(2);
            expect(cellKeys, `${tag}: visible header and cell aria-colindex key sets are identical`)
                .toEqual(headerKeys);

            // 4. per-key agreement in both spaces + worker columnPositions attribution
            const positionsByField = new Map(worker.columnPositions.map(c => [c.dataField, c]));

            for (const key of headerKeys) {
                const h = matrix.headers[key],
                      c = matrix.cells[key];

                // visual space — the user-visible symptom
                expect(Math.abs(h.visualX - c.visualX),
                    `${tag}: col ${key} header/cell visual left agree (h ${h.visualX} vs c ${c.visualX})`).toBeLessThan(1);
                expect(Math.abs(h.visualW - c.visualW),
                    `${tag}: col ${key} header/cell visual width agree (h ${h.visualW} vs c ${c.visualW})`).toBeLessThan(1);

                // content space — worker columnPositions is the generation both surfaces ride
                const workerColumn = positionsByField.get(c.dataField);

                expect(workerColumn, `${tag}: col ${key} (${c.dataField}) exists in worker columnPositions`).toBeTruthy();
                expect(Math.abs(workerColumn.x - c.contentX),
                    `${tag}: col ${key} worker x matches the cell content-space left`).toBeLessThan(0.5);
                expect(Math.abs(workerColumn.width - c.layoutW),
                    `${tag}: col ${key} worker width matches the cell layout width`).toBeLessThan(1);
                // offsetLeft is layout-space (scroll-independent), so no scroll term belongs here;
                // the visual-space asserts above carry scroll inherently via getBoundingClientRect
                expect(Math.abs(workerColumn.x - h.contentX),
                    `${tag}: col ${key} worker x matches the header button offset position`).toBeLessThan(1)
            }
        }

        // the ticket's recipe: repeated committed drags, both directions, cycled
        await dragAndVerify(160,  'drag1-right');
        await dragAndVerify(-160, 'drag2-left');
        await dragAndVerify(120,  'drag3-right');
        await dragAndVerify(-120, 'drag4-left');

        // net-zero series: every surface returns to boot geometry
        const end = await readMatrix(page);

        expect(Math.abs(end.layoutWidth - boot.layoutWidth),
            'the net-zero drag series returns the grid to its boot layout width').toBeLessThan(1);

        expect(pageErrors, 'the run surfaces zero page errors').toEqual([])
    })
});
