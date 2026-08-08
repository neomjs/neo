import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: a tab drag in the top-right strip must never paint a
 * header-layer label over a content-layer label.
 *
 * Defect mechanics (red state, first observed during a demo-video capture): for
 * several frames during a tab drag, two DIFFERENT heading strings interleave on one baseline —
 * the captured soup sat under the `EVIDENCE CHAIN` kicker in the Audit pane — then the frame
 * self-recovers. A transient exposure of intermediate state: an outgoing and an incoming (or a
 * dragged and a landed) subtree both painted, crossing the header/content layer boundary.
 *
 * Witness method: a page-side rAF sampler installed BEFORE the gesture records every heading-ish
 * string (tab header buttons + resident-card kicker/title/metric) with its box, one record per
 * frame, inside the right-top tab container (`metrics` + `audit` panes, the capture surface).
 * Red: any two DIFFERENT strings' boxes overlap (>2px both axes) on any frame; the pair's
 * classes name the layers involved. The exposure frame count is recorded, not described.
 *
 * `DockFlip.play()` branch classification is recorded alongside (wrapped `play`,
 * `hasPreservedMarkerSet`, `hasLandedInPlace`) — including the outcome where the defect sits
 * outside DockFlip entirely.
 *
 * CDP page.mouse is REQUIRED: the drag must ride the trusted-input path (the app-side synthetic
 * path does not exercise the real drag lifecycle — measured in the drag-selection lane).
 *
 * Viewport 1280x800: the flagship capture profile at which the defect was recorded.
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test workstation/WorkstationTabDragLabelOverlapNL -c test/playwright/playwright.config.e2e.mjs --workers=1 --headed
 */
test.describe('Workstation — a top-right tab drag never paints a header label over a content label (#16406)', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 800, width: 1280}},
        viewport      : {height: 800, width: 1280}
    });

    test('no two different heading strings share an overlapping box on any frame of the drag', async ({page, neuralLink}) => {
        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 30000});

        const app = await neuralLink.connectToApp('Workstation');

        // The captured scene had the Audit pane active (the soup sat under EVIDENCE CHAIN).
        const auditButton = page.locator('.neo-tab-header-button', {hasText: 'Audit'}).first();

        await auditButton.click();
        await page.waitForSelector('.workstation-resident-kicker:has-text("EVIDENCE CHAIN")', {timeout: 10000});

        const auditBox   = await auditButton.boundingBox(),
              metricsBox = await page.locator('.neo-tab-header-button', {hasText: 'Metrics'}).first().boundingBox();

        expect(auditBox,   'the Audit tab header button must be visible').toBeTruthy();
        expect(metricsBox, 'the Metrics tab header button must be visible').toBeTruthy();

        // Interference canary: headed runs share the OS cursor; stray real moves interleave.
        await page.evaluate(() => {
            window.__canary = {mousedown: 0, mousemove: 0, mouseup: 0};

            ['mousedown', 'mousemove', 'mouseup'].forEach(type =>
                document.addEventListener(type, () => window.__canary[type]++, true))
        });

        // DockFlip branch recorder: which classification (if any) the drag rides. Main addons
        // register as singleton instances at their className path (Main.mjs#registerAddon), so
        // resolve class-or-instance and patch the prototype chain either way.
        await page.evaluate(() => {
            window.__flipLog = [];

            const target = Neo.main.addon.DockFlip,
                  proto  = target?.prototype || (target && Object.getPrototypeOf(target));

            if (!proto) {
                window.__flipLog.push({m: 'dockflip-unreachable', type: typeof target});
                return
            }

            const wrapSync = name => {
                const orig = proto[name];

                if (typeof orig !== 'function') return;

                proto[name] = function(...args) {
                    const result = orig.apply(this, args);

                    window.__flipLog.push({m: name, r: result, t: Math.round(performance.now())});

                    return result
                }
            };

            wrapSync('hasPreservedMarkerSet');
            wrapSync('hasLandedInPlace');

            const origPlay = proto.play;

            proto.play = function(...args) {
                window.__flipLog.push({m: 'play', opts: JSON.stringify(args[0] || {}), t: Math.round(performance.now())});

                return origPlay.apply(this, args)
            }
        });

        // rAF heading sampler: one record per frame of every heading-ish string's text + box
        // inside the right-top tab container (scoped via the Audit button's closest container).
        const sampling = page.evaluate(({durationMs}) => new Promise(resolve => {
            const SELECTORS = '.neo-tab-header-button, .workstation-resident-kicker, .workstation-resident-title, .workstation-resident-metric',
                  auditEl   = [...document.querySelectorAll('.neo-tab-header-button')]
                      .find(el => el.textContent.trim() === 'Audit'),
                  region    = auditEl?.closest('.neo-tab-container') || document.body,
                  samples   = [],
                  t0        = performance.now();

            (function tick() {
                const heads = [...region.querySelectorAll(SELECTORS)]
                    .filter(el => el.getClientRects().length > 0)
                    .map(el => {
                        const r = el.getBoundingClientRect();

                        return {
                            c: el.classList.contains('neo-tab-header-button') ? 'header' : 'content',
                            s: el.textContent.trim().slice(0, 60),
                            x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)
                        }
                    })
                    .filter(h => h.s.length > 0 && h.w > 0 && h.h > 0);

                samples.push({t: Math.round(performance.now() - t0), heads});

                performance.now() - t0 < durationMs
                    ? requestAnimationFrame(tick)
                    : resolve(samples)
            })()
        }), {durationMs: 4500});

        // The gesture, two phases in one sampling window:
        // A) sort swap — drag the Audit header left past the Metrics button's center, hold, release.
        // B) content excursion — drag the Audit header DOWN ~140px into the content layer, hold,
        //    return to the strip, release. The excursion is the gesture that crosses the
        //    header/content layer boundary the defect lives on.
        const startX  = auditBox.x + auditBox.width / 2,
              startY  = auditBox.y + auditBox.height / 2,
              targetX = metricsBox.x + metricsBox.width / 2 - 8;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX - 24, startY, {steps: 4});
        await page.mouse.move(targetX, startY, {steps: 10});
        await page.waitForTimeout(250);
        await page.mouse.move(targetX - 4, startY, {steps: 2});
        await page.mouse.up();

        await page.waitForTimeout(400);

        const auditBoxB = await page.locator('.neo-tab-header-button', {hasText: 'Audit'}).first().boundingBox(),
              bx        = auditBoxB.x + auditBoxB.width / 2,
              by        = auditBoxB.y + auditBoxB.height / 2;

        await page.mouse.move(bx, by);
        await page.mouse.down();
        await page.mouse.move(bx + 6, by + 40, {steps: 4});
        await page.mouse.move(bx + 10, by + 140, {steps: 10});
        await page.waitForTimeout(300);
        await page.mouse.move(bx, by + 20, {steps: 6});
        await page.mouse.move(bx, by, {steps: 2});
        await page.mouse.up();

        const samples = await sampling;

        // Discriminating measurement: per frame, every pair of DIFFERENT strings whose boxes
        // overlap by more than 2px on both axes, SPLIT BY LAYER CROSSING. The defect crosses the
        // header/content layer boundary (the ticket's corrected reading); same-row header×header
        // crossings during a sort swap are the designed slide-past animation and are recorded as
        // diagnostics, not failures.
        const violations = [], sameLayer = [];

        samples.forEach((frame, fi) => {
            for (let i = 0; i < frame.heads.length; i++) {
                for (let j = i + 1; j < frame.heads.length; j++) {
                    const a = frame.heads[i], b = frame.heads[j];

                    if (a.s === b.s) continue;

                    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
                          oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);

                    if (ox > 2 && oy > 2) {
                        const entry = {
                            frame: fi, t: frame.t,
                            a    : `${a.s} [${a.c}]`, b: `${b.s} [${b.c}]`,
                            aR   : [a.x, a.y, a.w, a.h], bR: [b.x, b.y, b.w, b.h],
                            ox, oy
                        };

                        (a.c === b.c ? sameLayer : violations).push(entry)
                    }
                }
            }
        });

        const exposureFrames = new Set(violations.map(v => v.frame)).size,
              pairHistogram  = violations.reduce((acc, v) => {
                  const key = `${v.a} × ${v.b}`;

                  acc[key] = (acc[key] || 0) + 1;

                  return acc
              }, {}),
              sameLayerHistogram = sameLayer.reduce((acc, v) => {
                  const key = `${v.a} × ${v.b}`;

                  acc[key] = (acc[key] || 0) + 1;

                  return acc
              }, {}),
              flipLog        = await page.evaluate(() => window.__flipLog),
              canary         = await page.evaluate(() => window.__canary);

        console.log('[overlap-diag] cross-layer exposure frames:', exposureFrames, 'of', samples.length, 'sampled');
        console.log('[overlap-diag] cross-layer pair histogram:', JSON.stringify(pairHistogram));
        console.log('[overlap-diag] first cross-layer violations:', JSON.stringify(violations.slice(0, 20)));
        console.log('[overlap-diag] same-layer crossings (designed slide-past diagnostics):', JSON.stringify(sameLayerHistogram));
        console.log('[overlap-diag] flip log:', JSON.stringify(flipLog));
        console.log('[overlap-diag] canary:', JSON.stringify(canary));

        // AC1/AC2: no header-layer label may ever share an overlapping box with a content-layer
        // label — the layer-boundary crossing is the defect's discriminating signature.
        expect(
            violations.length,
            `${exposureFrames} frame(s) painted a header-layer label over a content-layer label — first: ${JSON.stringify(violations[0] || null)}`
        ).toBe(0);
    })
})
