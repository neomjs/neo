import { test, expect } from '../fixtures.mjs';

/**
 * Whitebox-e2e for locked-grid column drag-and-drop: landing accuracy + cross-region re-home.
 *
 * Paradigm (per the whitebox-e2e protocol): Playwright drives the native gesture; the Neural Link
 * fixture asserts App-Worker truth. The worker oracle is the grid's region-grouped column arrays
 * (`centerColumns` / `lockedStartColumns` / `lockedEndColumns`) — the engine recomputes these from
 * each column's `locked` value on every column mutation, so they are the authoritative view of which
 * region owns a column and at which index. We assert the dragged column's region+index there and
 * cross-check the rendered DOM order: a worker<->DOM consistency check that catches engine<->DOM drift
 * (the engine moves a column but the DOM misses it, or vice-versa) — invisible to a DOM-only test.
 *
 * Why the column arrays and NOT the header button's parentId: mapping a button to its region through
 * its parent toolbar's instance-id is a trap — the three region toolbars are created in a different
 * order than they render (the centre `headerToolbar` is built first; locked start/end on demand), so
 * a toolbar instance-id never maps cleanly to a visual region, and a DOM-nth lookup of the toolbar
 * just re-reads the DOM. The region column arrays are the engine's own region+index model, recomputed
 * from each column's `locked` value (which the drag commits on drop), so they are the single worker
 * source of truth — and post-drop they agree with the buttons' placement.
 *
 * Two legs:
 *   - LANDING ACCURACY: a centre column dragged within the centre region lands at the cursor-accurate
 *     index (engine keeps it in centerColumns at that index; the DOM shows it there — no overshoot).
 *   - CROSS-REGION RE-HOME: dragging a centre column into locked-start re-homes it (engine moves it
 *     into lockedStartColumns AND the DOM applies the move).
 *
 * DevIndex multi-region header DOM: .neo-grid-header-toolbar[0]=locked-start, [1]=centre, [2]=locked-end;
 * column labels live in SPAN.neo-button-text; the draggable target is the header button (.neo-draggable).
 * Dispatch: page.mouse.down -> move(x, {steps}) -> up — the {steps} cadence arms Neo's Mouse drag sensor.
 *
 * Run: npx playwright test GridColumnCrossBodyDnD -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Desktop (1920x1080): lockedColumns Fixture Locked-Column DnD (#12807)', () => {
    test.setTimeout(90000); // allow time for render + Neural Link mapping.
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page }) => {
        await page.goto('/examples/grid/lockedColumns/');
        page.on('console',   msg => console.log('BROWSER:', msg.text()));
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(500); // settle render before measuring
    });

    test('center-region "Total" drag lands at index 2 — engine keeps it in centerColumns + DOM idx 2 (no overshoot)', async ({ page, neuralLink }) => {
        const app    = await neuralLink.connectToApp('Neo.examples.grid.lockedColumns');
        const gridId = await resolveGridId(app);

        await assertPristineGrid(app, gridId);                     // worker precondition (also catches a foreign/stale bound app)
        expect((await getColumnOrder(page, 1))[0]).toBe('Total');  // DOM sanity: Total starts at centre idx 0

        const centerToolbar = page.locator('.neo-grid-header-toolbar').nth(1);
        const totalHeader    = centerToolbar.locator('.neo-draggable', { hasText: 'Total' }).first();
        await expect(totalHeader).toBeVisible({ timeout: 5000 });

        const idx2Header = centerToolbar.locator('.neo-draggable').nth(2);
        const totalBox   = await totalHeader.boundingBox();
        const idx2Box    = await idx2Header.boundingBox();

        await page.mouse.move(totalBox.x + totalBox.width / 2, totalBox.y + totalBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(idx2Box.x + idx2Box.width / 2, totalBox.y + totalBox.height / 2, { steps: 60 });
        await page.mouse.up();
        await page.waitForTimeout(500);

        const region   = await regionColumns(app, gridId);
        const domOrder = await getColumnOrder(page, 1);
        console.log('[locked-dnd] centerColumns:', JSON.stringify(region.center.slice(0, 5)), '| centre DOM:', JSON.stringify(domOrder.slice(0, 5)));

        expect(region.center[2]).toBe('totalContributions'); // worker truth: Total landed at centre index 2
        expect(domOrder.indexOf('Total')).toBe(2);            // DOM layer: cursor-accurate landing (no overshoot)
    });

    test('cross-region: center "Total" drag into locked-start re-homes — engine moves it to lockedStartColumns + DOM applies it', async ({ page, neuralLink }) => {
        const app    = await neuralLink.connectToApp('Neo.examples.grid.lockedColumns');
        const gridId = await resolveGridId(app);

        await assertPristineGrid(app, gridId);
        expect(await getColumnOrder(page, 0)).toEqual(['#', 'Rank', 'User']);

        const centerToolbar = page.locator('.neo-grid-header-toolbar').nth(1);
        const startToolbar  = page.locator('.neo-grid-header-toolbar').nth(0);
        const totalHeader    = centerToolbar.locator('.neo-draggable', { hasText: 'Total' }).first();
        await expect(totalHeader).toBeVisible({ timeout: 5000 });

        const totalBox = await totalHeader.boundingBox();
        const startBox = await startToolbar.boundingBox();

        await page.mouse.move(totalBox.x + totalBox.width / 2, totalBox.y + totalBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(startBox.x + startBox.width - 8, startBox.y + startBox.height / 2, { steps: 60 });
        await page.mouse.up();
        await page.waitForTimeout(800);

        const region   = await regionColumns(app, gridId);
        const domOrder = await getColumnOrder(page, 0);
        console.log('[locked-dnd] lockedStartColumns:', JSON.stringify(region.lockedStart), '| locked-start DOM:', JSON.stringify(domOrder));

        expect(region.lockedStart).toContain('totalContributions'); // worker truth: engine re-homed Total into locked-start
        expect(domOrder).toEqual(['#', 'Rank', 'User', 'Total']);    // DOM layer: rendered DOM applied the re-home (no drift)
    });
});

/**
 * Resolves the DevIndex grid-container instance id from the App Worker.
 * @returns {Promise<String>}
 */
async function resolveGridId(app) {
    const grids  = await app.findInstances({ ntype: 'grid-container' }, ['id']);
    const gridId = Array.isArray(grids) ? grids[0]?.id : grids?.id;
    expect(gridId, 'a grid-container instance must exist in the bound App Worker').toBeTruthy();
    return gridId;
}

/**
 * Reads the grid's three region-grouped column arrays from the App Worker and returns each as an
 * ordered list of dataFields. This is the engine's authoritative region+index model (recomputed from
 * every column's `locked` value on mutation), so it must be read AFTER a drag-leg has settled.
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
 * Worker-truth precondition: the bound grid is in its pristine layout (Total unlocked at centre idx 0,
 * #/Rank/User locked to the start, Total NOT pre-homed to the end). Asserting this before the gesture
 * both pins a known starting state and fails loudly if the Neural Link bound to a different DevIndex
 * instance than this test's page — the fixture currently resolves by app name, so a second connected
 * DevIndex (e.g. a developer's open tab) can otherwise be read silently instead of the test's page.
 */
async function assertPristineGrid(app, gridId) {
    const region = await regionColumns(app, gridId);
    expect(region.lockedStart).toEqual(['id', 'rank', 'login']);  // #, Rank, User
    expect(region.center[0]).toBe('totalContributions');          // Total starts unlocked at centre index 0
    expect(region.lockedEnd).not.toContain('totalContributions'); // Total is NOT pre-homed to locked-end
}

/**
 * Reads the header column labels in order for a region toolbar (DOM oracle layer).
 * Region order: 0 = locked-start, 1 = centre, 2 = locked-end. Labels = SPAN.neo-button-text.
 */
async function getColumnOrder(page, toolbarIndex) {
    return page.evaluate((idx) => {
        const tb = document.querySelectorAll('.neo-grid-header-toolbar')[idx];
        if (!tb) return [];
        return Array.from(tb.querySelectorAll('.neo-button-text'))
            .map(el => (el.textContent || '').trim())
            .filter(Boolean);
    }, toolbarIndex);
}
