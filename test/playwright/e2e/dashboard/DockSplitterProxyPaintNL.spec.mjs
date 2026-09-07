import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the splitter's drag affordance stays painted while the gesture is live — in BOTH
 * presentations the component supports.
 *
 * The defect this pins shipped because every existing arm stopped at `mouse.down()`. A splitter is
 * painted correctly at rest, so a resting assertion re-certifies the surface that was never broken,
 * which is precisely how the defect passed review. Every arm below therefore CROSSES the drag
 * threshold and inspects while the gesture is still held.
 *
 * **Two presentations, because the default moved underneath this spec.** `Neo.component.Splitter`
 * ships `liveResize: false` — the proxy-and-commit path, where a clone mounts at `document.body`,
 * outside the cascade that painted its source, and the `--dock-splitter-*` defaults resolve empty.
 * `Neo.dashboard.dock.interaction.DockSplitter` overrides it to `true`, so `useProxy` is false and
 * a dock drag creates **no proxy at all**. This spec used to assert the proxy unconditionally, and
 * could therefore only fail on a dock splitter — a guard pinned to a branch the consumer had
 * stopped taking, red for a reason that looked like a paint regression and was not.
 *
 * What survives the default flip is the VALUE, not the mechanism: the affordance must not vanish
 * mid-gesture. Under live resize the source element carries it; under proxy-and-commit the clone
 * does. Parameterising is what keeps a future default flip from silently retiring the coverage
 * again — each arm states which presentation it measured.
 *
 * The Engine-owned example host proves the default paint and handle metrics travel together.
 *
 * Run: NEO_E2E_PORT=49241 npx playwright test dashboard/DockSplitterProxyPaintNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
const HOST = {name: 'the example (engine floor, no app dock CSS)', ready: '.neo-dashboard-dock-splitter', url: '/examples/dashboard/dock/'};

/**
 * The two presentations the component supports, each with the element that must carry the paint
 * while the gesture is held.
 * @type {Object[]}
 */
const PRESENTATIONS = [{
    // Measured: the source darkens from `0 0 0 / 0.09` to `/ 0.26` while held — the active state
    // doing its job. Pinning the background to its resting value would red on any legitimate
    // active-state token, so the token-scope proof rides the HANDLE identity instead, which the
    // gesture has no reason to change. That is the stronger half anyway: a 0px handle still renders
    // a band, so a background-only assertion passes an affordance whose grip has vanished.
    background: 'painted',
    liveResize: true,
    name      : 'live resize (the dock default)',
    // No clone exists, so the source itself is the affordance for the whole gesture.
    subject   : 'source'
}, {
    // A clone must match its source exactly: it is the same element, re-parented, so ANY divergence
    // is the cascade loss this spec was written for.
    background: 'identical',
    liveResize: false,
    name      : 'proxy-and-commit (liveResize: false)',
    subject   : 'proxy'
}];

test.describe('Neo.dashboard.dock.interaction.DockSplitter — the drag affordance survives its gesture', () => {
    test.setTimeout(90000);

    for (const presentation of PRESENTATIONS) {
        test(`the held gesture keeps the splitter's resolved paint — ${presentation.name}, ${HOST.name}`, async ({neo, page}) => {
            await page.goto(HOST.url);
            page.on('pageerror', error => console.error('BROWSER JS ERROR:', error.message));

            const splitter = page.locator(HOST.ready).first();
            await expect(splitter, 'the host must render a splitter to drag').toBeVisible({timeout: 60000});

            const splitterId = await splitter.evaluate(el => el.id);

            expect(splitterId, 'the splitter must expose a component id to configure through').toBeTruthy();

            // Both arms set it explicitly. Riding the dock's default would leave the live-resize arm
            // silently re-parameterised by any future flip — the exact failure this spec is being
            // repaired for.
            await neo.setConfig(splitterId, {liveResize: presentation.liveResize});

            // The source's own resolved paint, read BEFORE the gesture. This is the comparison
            // target: the affordance is correct when it matches what the cascade gave the element
            // it belongs to, which is a stronger statement than "not transparent" and holds for any
            // consumer.
            const source = await splitter.evaluate(el => {
                const style = getComputedStyle(el);
                return {
                    background: style.backgroundColor,
                    handleSize: style.getPropertyValue('--dock-splitter-handle-size').trim()
                }
            });

            expect(source.background, 'the resting splitter must itself be painted, or the comparison is vacuous')
                .not.toBe('rgba(0, 0, 0, 0)');
            expect(source.handleSize, 'the engine host must give the splitter a non-zero handle, or the handle axis is untested')
                .not.toBe('0');

            const box = await splitter.boundingBox(),
                  sx  = box.x + box.width  / 2,
                  sy  = box.y + box.height / 2;

            await page.mouse.move(sx, sy);
            await page.mouse.down();
            // Two moves: the first crosses the drag threshold, the second is a real displacement so
            // the gesture is genuinely in flight rather than mid-initialisation.
            await page.mouse.move(sx + 12, sy, {steps: 4});
            await page.mouse.move(sx + 60, sy, {steps: 15});

            const proxy = page.locator('body > .neo-dragproxy.neo-dashboard-dock-splitter').first();

            try {
                // The presentation itself is asserted before its paint. Without this the proxy arm
                // could pass by measuring the source, and the live arm could pass while a proxy it
                // never inspected carried the regression.
                presentation.subject === 'proxy'
                    ? await expect(proxy, 'proxy-and-commit must create a body-mounted proxy').toBeVisible({timeout: 10000})
                    : await expect(proxy, 'live resize must create NO proxy — a proxy here means the presentation did not take').toHaveCount(0);

                const subject  = presentation.subject === 'proxy' ? proxy : splitter,
                      measured = await subject.evaluate(el => {
                          const style = getComputedStyle(el);
                          return {
                              background: style.backgroundColor,
                              handleSize: style.getPropertyValue('--dock-splitter-handle-size').trim()
                          }
                      });

                // The regression state, named explicitly so a failure reads as the defect rather
                // than as a generic mismatch: an unscoped affordance computes transparent.
                expect(measured.background,
                    `${presentation.name}: the held affordance must not fall back to transparent — measured ${measured.background}, source ${source.background}`
                ).not.toBe('rgba(0, 0, 0, 0)');

                presentation.background === 'identical' && expect(measured.background,
                    `${presentation.name}: a body-mounted clone resolves the same background the cascade gave its source`
                ).toBe(source.background);

                // The handle is the half that fails silently: a 0px handle still renders a band, so
                // a background-only assertion would pass an affordance whose grip had vanished.
                expect(measured.handleSize,
                    `${presentation.name}: the handle metric travels too — measured '${measured.handleSize}', source '${source.handleSize}'`
                ).toBe(source.handleSize)
            } finally {
                // Always release: a held button leaks into every later test in the worker.
                await page.mouse.up()
            }
        })
    }
});
