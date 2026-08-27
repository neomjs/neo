import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the splitter's DRAG PROXY renders its affordance while the gesture is live.
 *
 * The defect this pins shipped because every existing arm stopped at `mouse.down()`. A splitter is
 * painted correctly at rest and the proxy is a different element entirely — a clone mounted at
 * `document.body`, outside the cascade that painted the source. Detached from it, the engine's
 * `--dock-splitter-*` defaults (declared on `.neo-dashboard`) and each consumer's values (declared
 * as descendant rules under an app root) all resolve empty, and the affordance disappears at the
 * one moment it exists to say "you are moving something".
 *
 * So this witness is only meaningful if it CROSSES the drag threshold and inspects while the
 * gesture is still held. A resting assertion here would re-certify the surface that was never
 * broken — which is precisely how the defect passed review.
 *
 * The Engine-owned example host proves the default paint and handle metrics travel together.
 *
 * Run: NEO_E2E_PORT=49241 NEO_TEST_SKIP_CI=true npx playwright test dashboard/DockSplitterProxyPaintNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
const HOSTS = [
    {name: 'the example (engine floor, no app dock CSS)', url: '/examples/dashboard/dock/', ready: '.neo-dashboard-dock-splitter', handleDiscriminates: true}
];

test.describe('Neo.dashboard.DockSplitter — the drag proxy carries its paint', () => {
    test.setTimeout(90000);

    for (const host of HOSTS) {
    test(`a live drag proxy resolves the splitter tokens it was cloned from — ${host.name}`, async ({page}) => {
        await page.goto(host.url);
        page.on('pageerror', error => console.error('BROWSER JS ERROR:', error.message));

        const splitter = page.locator(host.ready).first();
        await expect(splitter, 'the host must render a splitter to drag').toBeVisible({timeout: 60000});

        // The source's own resolved paint, read BEFORE the gesture. This is the comparison target:
        // the proxy is correct when it matches what the cascade gave the element it cloned, which
        // is a stronger statement than "not transparent" and holds for any consumer.
        const source = await splitter.evaluate(el => {
            const style = getComputedStyle(el);
            return {
                background: style.backgroundColor,
                handleSize: style.getPropertyValue('--dock-splitter-handle-size').trim()
            }
        });

        expect(source.background, 'the resting splitter must itself be painted, or the comparison is vacuous')
            .not.toBe('rgba(0, 0, 0, 0)');

        // Guards the flag above rather than trusting it: if a consumer's handle opt-out changed,
        // this fails instead of silently turning a real assertion into `0 === 0` or the reverse.
        host.handleDiscriminates
            ? expect(source.handleSize, `${host.name} is declared to cover the handle axis, so its source handle must be non-zero`).not.toBe('0')
            : expect(source.handleSize, `${host.name} is declared to opt out of the handle, so its source handle must be zero`).toBe('0');

        const box = await splitter.boundingBox();
        const sx  = box.x + box.width  / 2,
              sy  = box.y + box.height / 2;

        await page.mouse.move(sx, sy);
        await page.mouse.down();
        // Two moves: the first crosses the drag threshold that creates the proxy, the second is a
        // real displacement so the proxy is genuinely in flight rather than mid-initialisation.
        await page.mouse.move(sx + 12, sy, {steps: 4});
        await page.mouse.move(sx + 60, sy, {steps: 15});

        const proxy = page.locator('body > .neo-dragproxy.neo-dashboard-dock-splitter').first();

        try {
            await expect(proxy, 'crossing the drag threshold must create a splitter proxy').toBeVisible({timeout: 10000});

            const measured = await proxy.evaluate(el => {
                const style = getComputedStyle(el);
                return {
                    background: style.backgroundColor,
                    handleSize: style.getPropertyValue('--dock-splitter-handle-size').trim()
                }
            });

            // The regression state, named explicitly so a failure reads as the defect rather than
            // as a generic mismatch: an unscoped proxy computes a transparent background.
            expect(measured.background,
                `the proxy must not fall back to transparent — measured ${measured.background}, source ${source.background}`
            ).not.toBe('rgba(0, 0, 0, 0)');

            expect(measured.background,
                'the proxy resolves the same background the cascade gave its source'
            ).toBe(source.background);

            // The handle is the half that fails silently: a 0px handle still renders a band, so a
            // background-only assertion would pass a proxy whose grip had vanished.
            // Asserted on both hosts, but only DISCRIMINATING where the source handle is non-zero —
            // see `handleDiscriminates`. On a zero-handle consumer this is a consistency check, not
            // evidence that the metric travelled.
            expect(measured.handleSize,
                `the proxy resolves the handle metric too — measured '${measured.handleSize}', source '${source.handleSize}'`
            ).toBe(source.handleSize);
        } finally {
            // Always release: a held button leaks into every later test in the worker.
            await page.mouse.up()
        }
    })
    }
});
