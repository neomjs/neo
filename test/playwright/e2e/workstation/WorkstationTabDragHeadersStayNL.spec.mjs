import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: during an in-window tab drag on an overflowing tab strip,
 * including rises out of the strip and returns, every rendered tab button stays inside the strip
 * box and settles after the post-drag overflow drain to the engine's focused-extent partition
 * with no residual absolute positioning on drop.
 *
 * Red mechanism on unpatched `dev`:
 * 1. `Neo.draggable.container.SortZone#onDragStart` admitted overflow-withheld (`hidden: true`,
 *    `vdom.removeDom: true`) tab buttons into `sortableItems`. Their unmounted DOM queries returned
 *    `{x: 0, y: 0, width: 0, height: 0}`, which `adjustItemRectsToParent` shifted to
 *    `(-ownerRect.x, -ownerRect.y)`. Dragging the 3rd (last visible) tab of `heavy-tabs` 120 px
 *    right swapped its slot with the 0-width overflow slot, writing
 *    `left: (-ownerRect.x - width)px, top: (-ownerRect.y)px` onto the button's `wrapperStyle` and
 *    sending it to viewport `(-width, 0)` at the window's top-left corner.
 * 2. On drop, `SortZone#processDragEnd` clears inline `style.position` before its 30 ms frame wait
 *    and `Overflow#scheduleSortDragProjection`'s post-drag drain. Focusing the strip reveals its
 *    `showOnFocus` header actions, narrowing the usable extent so `Overflow.computeOverflow` keeps
 *    the 2 protected tabs (active + focused) and displaces the 3rd into the overflow menu.
 */
test.describe('Workstation — in-window tab drag keeps strip headers inside the strip', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 1000, width: 2200}},
        viewport      : {height: 1000, width: 2200}
    });

    /**
     * Drags the 3rd visible tab of `heavy-tabs` out of the strip and back, drops it at its origin, and asserts the
     * strip settles to the focused-extent partition with every header inside it.
     * @param {Object} fixtures `{page, neuralLink}`
     * @param {Number} [cpuThrottle=1] CDP CPU throttling rate for the page's main thread from the drop on
     */
    async function dragAndSettle({page, neuralLink}, cpuThrottle=1) {
        globalThis.DOMRect ??= class DOMRect {};
        const {default: Overflow} = await import('../../../../src/tab/plugin/Overflow.mjs');
        const pageErrors          = [];

        page.on('pageerror', error => pageErrors.push(String(error.stack || error.message || error)));

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});

        const app        = await neuralLink.connectToApp('Workstation'),
              workspaces = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the Workstation Workspace must exist in the App Worker').toBeTruthy();

        const chrome = await app.callMethod(wsId, 'getTabChromeIdentity', ['heavy-tabs']);

        expect(chrome?.headerId, 'heavy-tabs must project a tab header toolbar').toBeTruthy();

        const overflowPlugin = await app.callMethod(chrome.headerId, 'getPlugin', ['tab-overflow']);

        expect(overflowPlugin?.id, 'heavy-tabs header toolbar must own a tab-overflow plugin').toBeTruthy();

        await expect.poll(async () => {
            const [overflowState, domCount] = await Promise.all([
                app.getComponent(overflowPlugin.id, [
                    'appliedHiddenIds',
                    'measuredControlWidth',
                    'measuring',
                    'projectQueued'
                ]),
                page.evaluate(async headerId => {
                    const countVisible = () => {
                        const toolbar = document.getElementById(headerId);

                        if (!toolbar || toolbar.classList.contains('neo-dashboard-dock-animating')) {
                            return 0
                        }

                        return [...toolbar.querySelectorAll('.neo-tab-header-button')]
                            .filter(el => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0)
                            .length
                    };

                    const c1 = await new Promise(resolve => requestAnimationFrame(() => resolve(countVisible()))),
                          c2 = await new Promise(resolve => requestAnimationFrame(() => resolve(countVisible())));

                    return c1 === c2 ? c2 : 0
                }, chrome.headerId)
            ]);

            if (overflowState?.measuring || overflowState?.projectQueued) return 0;
            if (!(overflowState?.measuredControlWidth > 0)) return 0;
            if (!((overflowState?.appliedHiddenIds || []).length > 0)) return 0;

            return domCount
        }, {
            message  : 'heavy-tabs initial overflow projection and control width measurement must settle with at least 3 visible tab buttons',
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

        const activePreDragButton    = stage.buttons[0],
              displacedPreDragButton = stage.buttons[1],
              targetButton           = stage.buttons[2],
              startX                 = Math.round(targetButton.x + targetButton.width / 2),
              startY                 = Math.round(targetButton.y + targetButton.height / 2);

        await page.evaluate(async ({headerId, targetId}) => {
            const mouseSensor = await Neo.main?.addon?.DragDrop?.getMouseSensor?.();

            if (mouseSensor) {
                mouseSensor.delay = 0
            }

            window.__canary = {mousedown: 0, mousemove: 0, mouseup: 0};

            ['mousedown', 'mousemove', 'mouseup'].forEach(type =>
                document.addEventListener(type, () => {
                    window.__canary[type]++;

                    if (type === 'mouseup') {
                        window.__tabDragSampling = false
                    }
                }, true));

            window.__tabDragSamples  = [];
            window.__tabDragSampling = true;

            const t0 = performance.now();

            (function tick() {
                if (!window.__tabDragSampling) {
                    return
                }

                const toolbar = document.getElementById(headerId),
                      target  = document.getElementById(targetId);

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
                        dragActive: toolbar.style.position === 'relative' && target?.style.position === 'absolute',
                        strip     : {
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
        }, {headerId: chrome.headerId, targetId: targetButton.id});

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

        if (cpuThrottle > 1) {
            await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', {rate: cpuThrottle})
        }

        await page.mouse.up();

        await expect.poll(async () => (await app.getComponent(chrome.headerId, ['containsFocus'])).containsFocus, {
            message: 'the dropped tab takes its focus back, so the strip holds focus',
            timeout: 10000
        }).toBe(true);

        // Explicit post-drop settle boundary: wait until SortZone clears inline positioning,
        // focus restoration reveals the contextual header actions in the DOM, Overflow's post-drag and
        // action-geometry projections complete (!sortDragProjectionQueued && !sortDragDrainScheduled &&
        // !measuring && !projectQueued), and the rendered button set is identical across two consecutive
        // animation frames matching Overflow.computeOverflow for the focused extent.
        await expect.poll(async () => {
            const [headerState, overflowState, tabButtons, tabContainer, domSettle] = await Promise.all([
                app.getComponent(chrome.headerId, ['containsFocus', 'contextualActionsVisible']),
                app.getComponent(overflowPlugin.id, [
                    'appliedHiddenIds',
                    'controlWidth',
                    'measuredControlWidth',
                    'measuring',
                    'naturalWidths',
                    'projectAsAction',
                    'projectQueued',
                    'sortDragDrainScheduled',
                    'sortDragProjectionQueued'
                ]),
                app.callMethod(chrome.headerId, 'getTabButtons', []),
                app.callMethod(overflowPlugin.id, 'getTabContainer', []),
                page.evaluate(async headerId => {
                    const readFrame = () => {
                        const toolbar = document.getElementById(headerId);

                        if (!toolbar || toolbar.classList.contains('neo-is-dragging')) {
                            return null
                        }

                        const allButtons = [...toolbar.querySelectorAll('.neo-tab-header-button')];

                        if (!allButtons.every(el => el.style.position === '')) {
                            return null
                        }

                        const actionEls = [...toolbar.querySelectorAll('.neo-toolbar-action:not(.neo-tab-overflow-control)')]
                            .filter(el => el.offsetWidth > 0);

                        if (actionEls.length === 0) {
                            return null
                        }

                        const ownerStart  = toolbar.offsetLeft,
                              ownerSize   = toolbar.offsetWidth,
                              firstAction = actionEls[0],
                              actionStart = firstAction ? firstAction.offsetLeft : null,
                              actionSize  = actionEls.reduce((sum, el) => sum + el.offsetWidth, 0),
                              coordExtent = Number.isFinite(ownerStart) && Number.isFinite(actionStart)
                                  ? Math.max(0, Math.floor(actionStart - ownerStart))
                                  : null,
                              sizeExtent    = Number.isFinite(ownerSize)
                                  ? Math.max(0, Math.floor(ownerSize - actionSize))
                                  : null,
                              focusedExtent = coordExtent === null
                                  ? sizeExtent || 0
                                  : sizeExtent === null ? coordExtent : Math.min(coordExtent, sizeExtent),
                              visibleIds    = allButtons
                                  .filter(el => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0)
                                  .map(el => el.id);

                        return {focusedExtent, visibleIds}
                    };

                    const frame1 = await new Promise(resolve => requestAnimationFrame(() => resolve(readFrame()))),
                          frame2 = await new Promise(resolve => requestAnimationFrame(() => resolve(readFrame())));

                    if (!frame1 || !frame2 || frame1.focusedExtent !== frame2.focusedExtent || frame1.visibleIds.join(',') !== frame2.visibleIds.join(',')) {
                        return null
                    }

                    return frame2
                }, chrome.headerId)
            ]);

            if (!domSettle) return false;
            if (!headerState?.containsFocus || !headerState?.contextualActionsVisible) return false;
            if (overflowState?.sortDragProjectionQueued || overflowState?.sortDragDrainScheduled) return false;
            if (overflowState?.measuring || overflowState?.projectQueued) return false;

            const [tabContainerProps, buttonStates] = await Promise.all([
                tabContainer?.id ? app.getComponent(tabContainer.id, ['activeIndex']) : null,
                Promise.all((tabButtons || []).map(btn => app.getComponent(btn.id, ['containsFocus', 'id'])))
            ]);

            const activeButton  = buttonStates[tabContainerProps?.activeIndex ?? 0] || null,
                  focusedButton = buttonStates.find(btn => btn?.containsFocus === true) || null,
                  controlWidth  = overflowState.projectAsAction
                      ? overflowState.measuredControlWidth || 0
                      : Math.max(overflowState.controlWidth || 0, overflowState.measuredControlWidth || 0),
                  partition     = Overflow.computeOverflow({
                      activeItemId : activeButton?.id,
                      controlWidth,
                      extent       : domSettle.focusedExtent,
                      focusedItemId: focusedButton?.id,
                      items        : buttonStates.map(btn => ({
                          headerWidth: overflowState.naturalWidths?.[btn.id],
                          id         : btn.id
                      }))
                  }),
                  hiddenIds     = overflowState?.appliedHiddenIds || [];

            return domSettle.visibleIds.join(',') === partition.visible.join(',')
                && hiddenIds.join(',') === partition.hidden.join(',')
        }, {
            message  : 'Overflow post-drag drain and focused-extent header partition must settle across worker and two consecutive DOM frames',
            timeout  : 10000,
            intervals: [20, 50, 100]
        }).toBe(true);

        const [
            {canary, focusedExtent, postDropButtons, samples},
            overflowState,
            tabButtons,
            tabContainer
        ] = await Promise.all([
            page.evaluate(headerId => {
                window.__tabDragSampling = false;

                const toolbar    = document.getElementById(headerId),
                      strip      = toolbar.getBoundingClientRect(),
                      ownerStart = toolbar.offsetLeft,
                      ownerSize  = toolbar.offsetWidth,
                      actionEls  = [...toolbar.querySelectorAll('.neo-toolbar-action:not(.neo-tab-overflow-control)')]
                          .filter(el => el.offsetWidth > 0),
                      firstAction   = actionEls[0],
                      actionStart   = firstAction ? firstAction.offsetLeft : null,
                      actionSize    = actionEls.reduce((sum, el) => sum + el.offsetWidth, 0),
                      coordExtent   = Number.isFinite(ownerStart) && Number.isFinite(actionStart)
                          ? Math.max(0, Math.floor(actionStart - ownerStart))
                          : null,
                      sizeExtent    = Number.isFinite(ownerSize)
                          ? Math.max(0, Math.floor(ownerSize - actionSize))
                          : null,
                      focusedExtent = coordExtent === null
                          ? sizeExtent || 0
                          : sizeExtent === null ? coordExtent : Math.min(coordExtent, sizeExtent),
                      buttons       = [...toolbar.querySelectorAll('.neo-tab-header-button')]
                          .filter(el => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0)
                          .map(el => {
                              const r  = el.getBoundingClientRect(),
                                    cs = getComputedStyle(el);

                              return {
                                  bottom        : Math.round(r.bottom),
                                  computedPos   : cs.position,
                                  height        : Math.round(r.height),
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
                    focusedExtent,
                    postDropButtons: buttons,
                    samples        : window.__tabDragSamples
                }
            }, chrome.headerId),
            app.getComponent(overflowPlugin.id, [
                'appliedHiddenIds',
                'control',
                'controlWidth',
                'measuredControlWidth',
                'naturalWidths',
                'projectAsAction'
            ]),
            app.callMethod(chrome.headerId, 'getTabButtons', []),
            app.callMethod(overflowPlugin.id, 'getTabContainer', [])
        ]);

        const tabContainerProps = tabContainer?.id
            ? await app.getComponent(tabContainer.id, ['activeIndex'])
            : null;

        const buttonStates = await Promise.all(
            tabButtons.map(btn => app.getComponent(btn.id, ['containsFocus', 'id', 'text']))
        );
        const activeButton  = buttonStates[tabContainerProps?.activeIndex ?? 0] || null,
              focusedButton = buttonStates.find(btn => btn.containsFocus === true) || null,
              controlWidth  = overflowState.projectAsAction
                  ? overflowState.measuredControlWidth || 0
                  : Math.max(overflowState.controlWidth || 0, overflowState.measuredControlWidth || 0),
              computedPartition = Overflow.computeOverflow({
                  activeItemId : activeButton?.id,
                  controlWidth,
                  extent       : focusedExtent,
                  focusedItemId: focusedButton?.id,
                  items        : buttonStates.map(btn => ({
                      headerWidth: overflowState.naturalWidths?.[btn.id],
                      id         : btn.id
                  }))
              });

        const controlProps = overflowState.control?.id
                  ? await app.getComponent(overflowState.control.id, ['hidden', 'menu', 'menuList'])
                  : null,
              menuListProps = controlProps?.menuList?.id
                  ? await app.getComponent(controlProps.menuList.id, ['items'])
                  : null,
              menuTexts     = (menuListProps?.items || controlProps?.menu?.items || []).map(item => item.text);

        const midDragSamples = samples.filter(frame => frame.dragActive),
              outsideFrames  = samples.flatMap((frame, frameIndex) =>
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

        expect(midDragSamples.length, 'rAF sampler captured mid-drag frames while absolute drag positioning was active').toBeGreaterThan(0);
        midDragSamples.forEach((frame, idx) => {
            expect(frame.buttons.length, `mid-drag frame ${idx} holds the >= 3 tab partition while Overflow is queued`).toBeGreaterThanOrEqual(3)
        });

        expect(
            outsideFrames,
            `no tab header button may leave the strip box during the in-window drag (first violation: ${JSON.stringify(outsideFrames[0] || null)})`
        ).toEqual([]);

        // Compare the settled post-drop strip against Overflow.computeOverflow's focused-extent partition.
        expect(activeButton?.id, 'active tab remains the first pre-drag tab').toBe(activePreDragButton.id);
        expect(focusedButton?.id, 'dragged tab holds focus after SortZone post-drop focus restoration').toBe(targetButton.id);
        expect(
            computedPartition.visible,
            'Overflow.computeOverflow protects the active and focused tabs under the narrower focused extent'
        ).toEqual([activePreDragButton.id, targetButton.id]);
        expect(
            postDropButtons.map(btn => btn.id),
            'rendered post-drop tab buttons equal Overflow.computeOverflow visible partition'
        ).toEqual(computedPartition.visible);
        expect(
            overflowState.appliedHiddenIds,
            'Overflow plugin appliedHiddenIds matches Overflow.computeOverflow hidden partition'
        ).toEqual(computedPartition.hidden);
        expect(
            computedPartition.hidden,
            'the non-protected middle tab is displaced into the overflow partition when focus reveals header actions'
        ).toContain(displacedPreDragButton.id);
        expect(
            menuTexts,
            'the overflow control menu contains the displaced middle tab'
        ).toContain(displacedPreDragButton.text);

        const postDropDragged = postDropButtons.find(btn => btn.id === targetButton.id);

        expect(postDropDragged, 'the dragged tab remains rendered in the strip after drop').toBeDefined();
        expect(postDropDragged.height, 'the dragged tab retains rendered strip height after drop').toBeGreaterThan(16);

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
    }

    test('dragging the 3rd visible tab 120 px right and 45 px above the strip keeps all headers inside the strip and settles to the focused-extent partition on drop', async ({page, neuralLink}) => dragAndSettle({page, neuralLink}));

    // A loaded main thread renders the dropped tab's re-show late: the focus restore must wait for it, or the strip stays unfocused
    test('with the main thread loaded from the drop on, the dropped tab takes its focus back and the strip still settles', async ({page, neuralLink}) => dragAndSettle({page, neuralLink}, 8));
});
