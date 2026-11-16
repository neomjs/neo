import { test, expect } from '../../fixtures.mjs';

/**
 * Whitebox-e2e: an auxiliary element mounted OUTSIDE grid.body (appended to the grid's ARIA wrapper,
 * the `[role="grid"]` element) and registered via scrollManager.registerHorizontalScrollFollower()
 * receives --grid-scroll-left in step with the centre body — including a follower that registers
 * mid-scroll, when the scrollbar already sits at scrollLeft > 0. Locked bodyStart / bodyEnd cells
 * neither inherit --grid-scroll-left nor shift horizontally.
 *
 * The review-suggested `.neo-grid-aria-wrapper` selector does not exist in the DOM: the ARIA wrapper
 * renders without that class (baseCls: [] in grid.Container), so this spec mounts into `[role="grid"]`,
 * the same node.
 *
 * Covers AC-3 / AC-4 of https://github.com/neomjs/neo/issues/20966
 *
 * Run: npx playwright test HorizontalScrollFollowerSync -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Desktop (1920x1080): lockedColumns Fixture — follower rows outside grid.body sync --grid-scroll-left', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page, neuralLink }) => {
        void neuralLink;
        await page.goto('/examples/grid/lockedColumns/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        await page.waitForSelector('[role="grid"]', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(500); // settle render before measuring
    });

    test('follower outside grid.body mirrors --grid-scroll-left; locked cells neither inherit it nor shift', async ({ page, neuralLink }) => {
        const app = await neuralLink.connectToApp('Neo.examples.grid.lockedColumns');

        // Worker oracles: the centre body (most columns) and the grid's ScrollManager
        const bodies = await app.findInstances({ className: 'Neo.grid.Body' }, ['id', 'columnPositions.count']);
        expect(bodies.length, 'three region bodies').toBe(3);
        const centreId = bodies.map(b => b.properties).sort((a, b) => b['columnPositions.count'] - a['columnPositions.count'])[0].id;

        const managers = await app.findInstances({ className: 'Neo.grid.ScrollManager' }, ['id']);
        expect(managers.length, 'one grid ScrollManager').toBe(1);
        const scrollManagerId = managers[0].properties.id;

        const followerId       = 'e2e-h-scroll-follower-1',
              midScrollMountId = 'e2e-h-scroll-follower-2';

        // Mount the first auxiliary element outside grid.body, inside the grid's ARIA wrapper,
        // and register it while the scrollbar still sits at 0.
        const mounted = await page.evaluate(id => {
            const wrapper = document.querySelector('[role="grid"]');
            if (!wrapper) return false;

            const node = document.createElement('div');
            node.id = id;
            wrapper.appendChild(node);
            return true;
        }, followerId);
        expect(mounted, 'ARIA wrapper found; follower mounted outside grid.body').toBe(true);

        await app.callMethod(scrollManagerId, 'registerHorizontalScrollFollower', [followerId]);

        // Worker truth: the id joined the manager's follower set
        await expect.poll(async () => {
            const m = await app.getComponent(scrollManagerId, ['horizontalScrollFollowerIds.size']);
            return m['horizontalScrollFollowerIds.size'];
        }, 'worker-side follower set holds the registered id').toBe(1);

        // Phase 1: scroll to a first position and compare follower vs centre body vs locked cells
        const phase1 = await page.evaluate(({ followerId, centreId }) => {
            const hScrollbar = document.querySelector('.neo-grid-horizontal-scrollbar');
            if (!hScrollbar) return { error: 'horizontal scrollbar not found' };

            const lockedLefts = () => {
                const s = document.querySelector('.neo-grid-row .neo-grid-cell.neo-locked-start');
                const e = document.querySelector('.neo-grid-row .neo-grid-cell.neo-locked-end');
                return { startLeft: s ? s.getBoundingClientRect().left : null, endLeft: e ? e.getBoundingClientRect().left : null };
            };
            const lockedVars = () => {
                const s = document.querySelector('.neo-grid-row .neo-grid-cell.neo-locked-start');
                const e = document.querySelector('.neo-grid-row .neo-grid-cell.neo-locked-end');
                return {
                    startVar: s ? getComputedStyle(s).getPropertyValue('--grid-scroll-left') : null,
                    endVar  : e ? getComputedStyle(e).getPropertyValue('--grid-scroll-left') : null
                };
            };

            return (async () => {
                const initialLocked = lockedLefts();

                hScrollbar.scrollLeft = 120;
                await new Promise(r => requestAnimationFrame(r));
                await new Promise(r => requestAnimationFrame(r));

                const expected    = hScrollbar.scrollLeft + 'px',
                      bodyNode    = document.getElementById(centreId),
                      follower    = document.getElementById(followerId),
                      afterLocked = lockedLefts(),
                      afterVars   = lockedVars();

                return {
                    scrolled          : hScrollbar.scrollLeft > 0,
                    expected,
                    bodyVar           : bodyNode ? bodyNode.style.getPropertyValue('--grid-scroll-left') : null,
                    followerVar       : follower ? follower.style.getPropertyValue('--grid-scroll-left') : null,
                    lockedStartPresent: initialLocked.startLeft !== null,
                    lockedEndPresent  : initialLocked.endLeft !== null,
                    lockedStartStable : initialLocked.startLeft === afterLocked.startLeft,
                    lockedEndStable   : initialLocked.endLeft === afterLocked.endLeft,
                    lockedStartVar    : afterVars.startVar,
                    lockedEndVar      : afterVars.endVar
                };
            })();
        }, { followerId, centreId });

        console.log('[h-scroll-follower] phase1', JSON.stringify(phase1));

        expect(phase1.error).toBeUndefined();
        expect(phase1.scrolled,       'scrollbar moved').toBe(true);
        expect(phase1.lockedStartPresent, 'locked-start cells present').toBe(true);
        expect(phase1.lockedEndPresent,   'locked-end cells present (no vacuous pass)').toBe(true);

        // The follower mirrors the centre body exactly (AC-3)
        expect(phase1.bodyVar,     'centre body carries --grid-scroll-left').toBe(phase1.expected);
        expect(phase1.followerVar, 'follower outside grid.body matches the centre body').toBe(phase1.bodyVar);

        // Locked isolation (AC-4): no inheritance, no shift
        expect(phase1.lockedStartVar, 'locked-start cells do not inherit --grid-scroll-left').toBe('');
        expect(phase1.lockedEndVar,   'locked-end cells do not inherit --grid-scroll-left').toBe('');
        expect(phase1.lockedStartStable, 'locked-start stayed put').toBe(true);
        expect(phase1.lockedEndStable,   'locked-end stayed put').toBe(true);

        // Phase 2: register a second follower MID-SCROLL (scrollLeft > 0); it must seed immediately
        const scrollLeftNow = await page.evaluate(id => {
            const wrapper = document.querySelector('[role="grid"]');
            const node    = document.createElement('div');
            node.id = id;
            wrapper.appendChild(node);
            return document.querySelector('.neo-grid-horizontal-scrollbar').scrollLeft;
        }, midScrollMountId);
        expect(scrollLeftNow, 'mid-scroll registration happens at scrollLeft > 0').toBeGreaterThan(0);

        await app.callMethod(scrollManagerId, 'registerHorizontalScrollFollower', [midScrollMountId]);

        await expect.poll(async () => {
            return page.evaluate(id => document.getElementById(id)?.style.getPropertyValue('--grid-scroll-left') ?? null, midScrollMountId);
        }, 'mid-scroll follower seeds --grid-scroll-left from the current scroller position').toBe(scrollLeftNow + 'px');

        // Phase 3: a further scroll moves BOTH followers with the body; locked cells still frozen
        const phase3 = await page.evaluate(({ followerId, midScrollMountId, centreId }) => {
            const hScrollbar = document.querySelector('.neo-grid-horizontal-scrollbar');

            const lockedLefts = () => {
                const s = document.querySelector('.neo-grid-row .neo-grid-cell.neo-locked-start');
                const e = document.querySelector('.neo-grid-row .neo-grid-cell.neo-locked-end');
                return { startLeft: s ? s.getBoundingClientRect().left : null, endLeft: e ? e.getBoundingClientRect().left : null };
            };

            return (async () => {
                const beforeLocked = lockedLefts();

                hScrollbar.scrollLeft = 400;
                await new Promise(r => requestAnimationFrame(r));
                await new Promise(r => requestAnimationFrame(r));

                const expected    = hScrollbar.scrollLeft + 'px',
                      afterLocked = lockedLefts();

                return {
                    expected,
                    bodyVar          : document.getElementById(centreId)?.style.getPropertyValue('--grid-scroll-left') ?? null,
                    follower1Var     : document.getElementById(followerId)?.style.getPropertyValue('--grid-scroll-left') ?? null,
                    follower2Var     : document.getElementById(midScrollMountId)?.style.getPropertyValue('--grid-scroll-left') ?? null,
                    lockedStartStable: beforeLocked.startLeft === afterLocked.startLeft,
                    lockedEndStable  : beforeLocked.endLeft === afterLocked.endLeft
                };
            })();
        }, { followerId, midScrollMountId, centreId });

        console.log('[h-scroll-follower] phase3', JSON.stringify(phase3));

        expect(phase3.bodyVar,      'centre body at the new position').toBe(phase3.expected);
        expect(phase3.follower1Var, 'first follower still in sync').toBe(phase3.expected);
        expect(phase3.follower2Var, 'mid-scroll follower in sync after registration').toBe(phase3.expected);
        expect(phase3.lockedStartStable, 'locked-start stayed put through the second scroll').toBe(true);
        expect(phase3.lockedEndStable,   'locked-end stayed put through the second scroll').toBe(true);

        // Leave the example as found
        await app.callMethod(scrollManagerId, 'unregisterHorizontalScrollFollower', [followerId]);
        await app.callMethod(scrollManagerId, 'unregisterHorizontalScrollFollower', [midScrollMountId]);
    });
});
