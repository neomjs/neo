import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: during an in-window tab drag on an overflowing tab strip,
 * including rises out of the strip and returns, every rendered tab button stays inside the strip
 * box and settles with no residual absolute positioning on drop.
 *
 * Red mechanism on unpatched `dev`: `Neo.draggable.container.SortZone#onDragStart` admitted
 * overflow-withheld (`hidden: true`, `vdom.removeDom: true`) tab buttons into `sortableItems`.
 * Their unmounted DOM queries returned `{x: 0, y: 0, width: 0, height: 0}`, which
 * `adjustItemRectsToParent` shifted to `(-ownerRect.x, -ownerRect.y)`. Dragging the 3rd (last
 * visible) tab of `heavy-tabs` 120 px right swapped its slot with the 0-width overflow slot,
 * writing `left: (-ownerRect.x - width)px, top: (-ownerRect.y)px` onto the button's `wrapperStyle`
 * and sending it to viewport `(-width, 0)` at the window's top-left corner.
 */
test.describe('Workstation — in-window tab drag keeps strip headers inside the strip', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 1000, width: 2200}},
        viewport      : {height: 1000, width: 2200}
    });

    test('dragging the 3rd visible tab 120 px right and 45 px above the strip keeps all headers inside the strip and clears absolute positioning on drop', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(String(error.stack || error.message || error)));

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});

        const app        = await neuralLink.connectToApp('Workstation'),
              workspaces = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the Workstation Workspace must exist in the App Worker').toBeTruthy();

        const chrome = await app.callMethod(wsId, 'getTabChromeIdentity', ['heavy-tabs']);

        expect(chrome?.headerId, 'heavy-tabs must project a tab header toolbar').toBeTruthy();

        await expect.poll(async () => {
            return page.evaluate(headerId => {
                const toolbar = document.getElementById(headerId);

                if (!toolbar || toolbar.classList.contains('neo-dashboard-dock-animating')) {
                    return 0
                }

                return [...toolbar.querySelectorAll('.neo-tab-header-button')]
                    .filter(el => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0)
                    .length
            }, chrome.headerId)
        }, {
            message  : 'heavy-tabs overflow projection must settle with at least 3 visible tab buttons',
            timeout  : 30000,
            intervals: [50, 100, 200]
        }).toBeGreaterThanOrEqual(3);

        const stage = await page.evaluate(headerId => {
            const toolbar = document.getElementById(headerId),
                  strip   = toolbar.getBoundingClientRect(),
                  buttons = [...toolbar.querySelectorAll('.neo-tab-header-button')]
                      .filter(el => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0)
                      .map(el => {
                          const r = el.getBoundingClientRect();

                          return {
                              height: r.height,
                              id    : el.id,
                              text  : el.textContent.trim(),
                              width : r.width,
                              x     : r.x,
                              y     : r.y
                          }
                      });

            return {
                buttons,
                strip: {
                    bottom: strip.bottom,
                    height: strip.height,
                    left  : strip.left,
                    right : strip.right,
                    top   : strip.top,
                    width : strip.width,
                    x     : strip.x,
                    y     : strip.y
                }
            }
        }, chrome.headerId);

        expect(stage.buttons.length, 'at least 3 visible tab headers in heavy-tabs').toBeGreaterThanOrEqual(3);

        const targetButton = stage.buttons[2],
              startX       = Math.round(targetButton.x + targetButton.width / 2),
              startY       = Math.round(targetButton.y + targetButton.height / 2);

        await page.evaluate(headerId => {
            window.__canary = {mousedown: 0, mousemove: 0, mouseup: 0};

            ['mousedown', 'mousemove', 'mouseup'].forEach(type =>
                document.addEventListener(type, () => window.__canary[type]++, true));

            window.__tabDragSamples  = [];
            window.__tabDragSampling = true;

            const t0 = performance.now();

            (function tick() {
                const toolbar = document.getElementById(headerId);

                if (toolbar) {
                    const strip   = toolbar.getBoundingClientRect(),
                          buttons = [...toolbar.querySelectorAll('.neo-tab-header-button')]
                              .filter(el => el.getClientRects().length > 0)
                              .map(el => {
                                  const r = el.getBoundingClientRect();

                                  return {
                                      bottom: Math.round(r.bottom),
                                      height: Math.round(r.height),
                                      id    : el.id,
                                      left  : Math.round(r.left),
                                      right : Math.round(r.right),
                                      text  : el.textContent.trim(),
                                      top   : Math.round(r.top),
                                      width : Math.round(r.width),
                                      x     : Math.round(r.x),
                                      y     : Math.round(r.y)
                                  }
                              });

                    window.__tabDragSamples.push({
                        buttons,
                        strip: {
                            bottom: Math.round(strip.bottom),
                            left  : Math.round(strip.left),
                            right : Math.round(strip.right),
                            top   : Math.round(strip.top)
                        },
                        t: Math.round(performance.now() - t0)
                    })
                }

                if (window.__tabDragSampling) {
                    requestAnimationFrame(tick)
                }
            })()
        }, chrome.headerId);

        // Reproducing gesture: drag the 3rd visible tab 120 px right, rise 45 px above the strip, and return.
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 24, startY, {steps: 4});

        await expect.poll(async () => {
            return page.evaluate(id => document.getElementById(id)?.style.position, targetButton.id)
        }, {
            message  : 'SortZone must arm absolute drag positioning on the strip buttons before the excursion',
            timeout  : 5000,
            intervals: [20, 50, 100]
        }).toBe('absolute');

        await page.mouse.move(startX + 120, startY, {steps: 12});
        await page.mouse.move(startX + 120, startY - 45, {steps: 10});
        await page.mouse.move(startX + 120, startY, {steps: 10});
        await page.mouse.move(startX, startY, {steps: 12});
        await page.mouse.up();

        // Wait until SortZone's drag-end latch clears the transient absolute positioning.
        await expect.poll(async () => {
            return page.evaluate(headerId => {
                const toolbar = document.getElementById(headerId);

                if (!toolbar) return false;

                return [...toolbar.querySelectorAll('.neo-tab-header-button')]
                    .every(el => el.style.position === '')
            }, chrome.headerId)
        }, {
            message  : 'every tab button must clear inline absolute positioning after the drop',
            timeout  : 10000,
            intervals: [20, 50, 100]
        }).toBe(true);

        const {canary, postDropButtons, samples} = await page.evaluate(headerId => {
            window.__tabDragSampling = false;

            const toolbar = document.getElementById(headerId),
                  strip   = toolbar.getBoundingClientRect(),
                  buttons = [...toolbar.querySelectorAll('.neo-tab-header-button')]
                      .filter(el => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0)
                      .map(el => {
                          const r  = el.getBoundingClientRect(),
                                cs = getComputedStyle(el);

                          return {
                              bottom        : Math.round(r.bottom),
                              computedPos   : cs.position,
                              id            : el.id,
                              inlineLeft    : el.style.left,
                              inlinePosition: el.style.position,
                              inlineTop     : el.style.top,
                              left          : Math.round(r.left),
                              outsideStrip  : r.top < strip.top - 2 || r.bottom > strip.bottom + 2 || r.left < strip.left - 2 || r.right > strip.right + 2,
                              right         : Math.round(r.right),
                              text          : el.textContent.trim(),
                              top           : Math.round(r.top)
                          }
                      });

            return {
                canary         : window.__canary,
                postDropButtons: buttons,
                samples        : window.__tabDragSamples
            }
        }, chrome.headerId);

        const outsideFrames = samples.flatMap((frame, frameIndex) =>
            frame.buttons
                .filter(b =>
                    b.top < frame.strip.top - 2 ||
                    b.bottom > frame.strip.bottom + 2 ||
                    b.left < frame.strip.left - 2 ||
                    b.right > frame.strip.right + 2
                )
                .map(b => ({
                    button: b,
                    frame : frameIndex,
                    strip : frame.strip,
                    t     : frame.t
                }))
        );

        expect(canary.mousedown, 'positive control: exactly one gesture press').toBe(1);
        expect(canary.mouseup,   'positive control: exactly one gesture release').toBe(1);
        expect(canary.mousemove, 'positive control: the real pointer move stream fired').toBeGreaterThanOrEqual(30);
        expect(samples.length,   'positive control: rAF sampler captured frames across the drag').toBeGreaterThan(5);

        expect(
            outsideFrames,
            `no tab header button may leave the strip box during the in-window drag (first violation: ${JSON.stringify(outsideFrames[0] || null)})`
        ).toEqual([]);

        expect(postDropButtons.length, 'rendered tab buttons remain in the strip after drop').toBeGreaterThanOrEqual(3);
        postDropButtons.forEach(btn => {
            expect(btn.outsideStrip, `post-drop button ${btn.id} (${btn.text}) sits inside the strip`).toBe(false);
            expect(btn.inlinePosition, `post-drop button ${btn.id} has no residual inline position`).toBe('');
            expect(btn.inlineLeft, `post-drop button ${btn.id} has no residual inline left`).toBe('');
            expect(btn.inlineTop, `post-drop button ${btn.id} has no residual inline top`).toBe('');
            expect(btn.computedPos, `post-drop button ${btn.id} is not absolutely positioned`).not.toBe('absolute')
        });

        const consistency = await app.verifyComponentConsistency(chrome.headerId);

        expect(consistency.consistent, 'header toolbar VDOM/DOM/items stay consistent after drop').toBe(true);
        expect(pageErrors, 'no uncaught page errors').toEqual([])
    })
});
