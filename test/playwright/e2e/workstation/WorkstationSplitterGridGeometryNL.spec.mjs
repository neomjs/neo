import { test, expect } from '../../fixtures.mjs';

/**
 * Whitebox-e2e: repeated committed splitter drags keep worker, header, and cell geometry aligned.
 *
 * After committed DockSplitter resizes, the 100k Matrix grid could keep painting while
 * its geometry generations drifted apart — header labels narrower than their cells, the last
 * body column clipped at the shared right edge, phantom mounted columns. Mechanism: the grid's
 * resize measurement (`grid.Container#passSizeToBody` + `grid.header.Toolbar#passSizeToBody`)
 * ran `getBoundingClientRect()` through async worker→main round-trips that could land inside
 * DockFlip's inverse-transform presentation window, persisting transform-scaled VISUAL rects
 * as `containerWidth` / `availableWidth` / `columnPositions` (witnessed live: containerWidth
 * 476.77 and availableWidth 1328.72 at a settled 388px rest). The seam now reads layout-box
 * metrics (`getLayoutRect()`), which transforms never affect.
 *
 * This guard drives the ticket's own recipe — a bounded series of real committed drags, BOTH
 * directions, repeated cycles — and after every settled commit asserts the full attribution
 * matrix (worker → header → body):
 *   1. worker `containerWidth` equals the grid container's layout width (±1px);
 *   2. worker `availableWidth` equals the summed layout widths of the header buttons (±1.5px);
 *   3. every visible header button and its x-order-paired first-row cell agree on left/width
 *      (±1px) — the ticket's visible symptom, asserted pairwise.
 *
 * Settlement is event/state-based only (dock document commit, projected DOM extent, motion
 * lifecycle class, zero fixed-stage residue, transform-free grid) — no fixed-delay sleeps,
 * per the ticket's walls.
 *
 * The race itself is pinned RACE-FREE by the first test: it freezes a "mid-motion" frame (a
 * static ancestor scale transform), triggers the measurement through the projection's own
 * mutation class (a flex-basis write on the pane's tab container), and asserts the worker
 * persists the LAYOUT box. Pre-fix that fails deterministically on every run — no lucky
 * timing can green-wash it; the drag test then guards the integrated surface.
 *
 * Run: npx playwright test WorkstationSplitterGridGeometryNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation splitter drags: grid geometry stays attributable (#16375)', () => {
    test.setTimeout(180000);
    test.use({ viewport: { width: 1280, height: 720 } });

    const GRID_ID = 'neo-grid-container-1',
          BODY_ID = 'neo-grid-body-1';

    /** Page-side geometry matrix for the Matrix grid: container, header buttons, row-0 cells. */
    const readMatrix = page => page.evaluate(gridId => {
        const grid    = document.getElementById(gridId),
              header  = grid.querySelector('.neo-grid-header-toolbar'),
              body    = grid.querySelector('.neo-grid-body'),
              clip    = body.getBoundingClientRect(),
              inClip  = r => r.width > 0 && r.right > clip.left + 1 && r.left < clip.right - 1,
              buttons = [...header.children]
                  .map(b => ({r: b.getBoundingClientRect(), lw: parseFloat(getComputedStyle(b).width)}))
                  .filter(({r}) => r.width > 0),
              headers = buttons
                  .filter(({r}) => inClip(r))
                  .map(({r}) => ({x: r.left, w: r.width}))
                  .sort((a, b) => a.x - b.x),
              row     = body.querySelector('[role="row"]'),
              cells   = row ? [...row.children]
                  .map(c => c.getBoundingClientRect())
                  .filter(r => inClip(r))
                  .map(r => ({x: r.left, w: r.width}))
                  .sort((a, b) => a.x - b.x) : [];

        return {
            layoutWidth   : parseFloat(getComputedStyle(grid).width),
            transform     : getComputedStyle(grid).transform,
            buttonWidthSum: buttons.reduce((sum, {lw}) => sum + lw, 0),
            headers,
            cells
        };
    }, GRID_ID);

    test('measurement stays layout-true while an ancestor transform holds (deterministic reproducer)', async ({ page, neuralLink }) => {
        const SCALE_X = 0.6,
              SCALE_Y = 0.85;

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-tour-play', {timeout: 30000});
        await page.waitForSelector(`#${GRID_ID}`, {timeout: 30000});

        const app = await neuralLink.connectToApp('Workstation');

        // boot settlement: the worker knows the real grid width
        await expect.poll(async () => {
            const {containerWidth} = await app.getComponent(BODY_ID, ['containerWidth']);
            return containerWidth
        }, {timeout: 15000, intervals: [100, 250]}).toBeGreaterThan(0);

        const boot = await readMatrix(page);

        // ARM THE TRAP: freeze a "mid-motion" frame — a static ancestor scale transform.
        await page.evaluate(([sx, sy]) => {
            document.body.style.transformOrigin = 'left top';
            document.body.style.transform       = `scale(${sx}, ${sy})`
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
            const {containerWidth} = await app.getComponent(BODY_ID, ['containerWidth']),
                  current          = await readMatrix(page);
            return Math.abs(containerWidth - current.layoutWidth)
        }, {
            message  : 'worker containerWidth equals the grid layout width (not the transform-scaled visual width)',
            timeout  : 10000,
            intervals: [100, 250]
        }).toBeLessThan(1);

        await expect.poll(async () => {
            const {availableWidth} = await app.getComponent(BODY_ID, ['availableWidth']),
                  current          = await readMatrix(page);
            return Math.abs(availableWidth - current.buttonWidthSum)
        }, {
            message  : 'worker availableWidth equals the summed header-button layout widths (not their scaled visual widths)',
            timeout  : 10000,
            intervals: [100, 250]
        }).toBeLessThan(1.5);

        // DISARM + coherence: restore the pane flex pair and the transform, geometry re-converges.
        await page.evaluate(flex => {
            document.getElementById('neo-tab-container-2').style.flex = flex[0];
            document.getElementById('neo-tab-container-3').style.flex = flex[1];
            document.body.style.transform       = '';
            document.body.style.transformOrigin = ''
        }, originalFlex);

        await expect.poll(async () => {
            const {containerWidth} = await app.getComponent(BODY_ID, ['containerWidth']),
                  current          = await readMatrix(page);
            return Math.abs(containerWidth - current.layoutWidth)
        }, {
            message  : 'worker containerWidth re-converges on the layout box after the transform clears',
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
        await expect.poll(async () => {
            const {containerWidth} = await app.getComponent(BODY_ID, ['containerWidth']);
            return containerWidth
        }, {timeout: 15000, intervals: [100, 250]}).toBeGreaterThan(0);

        const boot = await readMatrix(page);

        /** One committed drag + event-based settlement + the full attribution matrix. */
        async function dragAndVerify(deltaX, tag) {
            const splitter                 = page.locator('.neo-dashboard-dock-splitter-horizontal'),
                  box                      = await splitter.boundingBox(),
                  sx                       = box.x + box.width / 2,
                  sy                       = box.y + box.height / 2,
                  before                   = await readMatrix(page),
                  {dockModel: modelBefore} = await app.getComponent(workspaceId, ['dockModel']);

            await page.mouse.move(sx, sy);
            await page.mouse.down();
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

            // 3. the motion lifecycle fully released the presentation
            await expect(root, `${tag}: the dock motion lifecycle settles`)
                .not.toHaveClass(/neo-dashboard-dock-animating/, {timeout: 10000});
            await expect(page.locator('.neo-dock-flip-fixed-stage'),
                `${tag}: no fixed-stage presentation residue`).toHaveCount(0);

            const settled = await readMatrix(page);

            expect(settled.transform, `${tag}: the grid carries no residual transform`).toBe('none');

            // ATTRIBUTION MATRIX (worker → header → body), the ticket's AC net:
            // 1. worker containerWidth rides the layout box — poisoned visual samples time this out
            await expect.poll(async () => {
                const {containerWidth} = await app.getComponent(BODY_ID, ['containerWidth']),
                      current          = await readMatrix(page);
                return Math.abs(containerWidth - current.layoutWidth)
            }, {
                message  : `${tag}: worker containerWidth equals the grid layout width`,
                timeout  : 5000,
                intervals: [100, 250]
            }).toBeLessThan(1);

            // 2. worker availableWidth rides the header buttons' summed LAYOUT widths
            const {availableWidth} = await app.getComponent(BODY_ID, ['availableWidth']);

            expect(Math.abs(availableWidth - settled.buttonWidthSum),
                `${tag}: worker availableWidth equals the summed header-button layout widths`)
                .toBeLessThan(1.5);

            // 3. every visible header agrees with its x-order-paired first-row cell
            expect(settled.headers.length, `${tag}: visible header buttons exist`).toBeGreaterThan(2);
            expect(settled.cells.length, `${tag}: visible row-0 cells exist`).toBeGreaterThan(2);

            const pairCount = Math.min(settled.headers.length, settled.cells.length);

            for (let i = 0; i < pairCount; i++) {
                const h = settled.headers[i],
                      c = settled.cells[i];

                expect(Math.abs(h.x - c.x),
                    `${tag}: header[${i}] left aligns with its cell (h ${h.x} vs c ${c.x})`).toBeLessThan(1);
                expect(Math.abs(h.w - c.w),
                    `${tag}: header[${i}] width matches its cell (h ${h.w} vs c ${c.w})`).toBeLessThan(1)
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
