import {expect, test} from '../../fixtures.mjs';

const pickRect = rect => rect && ({
    height: rect.height,
    width : rect.width,
    x     : rect.x,
    y     : rect.y
});

async function findOne(app, selector, properties) {
    const found = await app.findInstances(selector, properties),
          list  = Array.isArray(found) ? found : found ? [found] : [];

    expect(list, `one ${JSON.stringify(selector)}`).toHaveLength(1);

    return list[0]
}

async function browserRect(page) {
    return page.evaluate(() => ({
        height: globalThis.innerHeight,
        width : globalThis.innerWidth,
        x     : globalThis.screenX,
        y     : globalThis.screenY
    }))
}

async function cdpWindow(page) {
    const cdp        = await page.context().newCDPSession(page),
          {windowId} = await cdp.send('Browser.getWindowForTarget');

    return {cdp, page, windowId}
}

async function setBounds(handle, bounds) {
    await handle.cdp.send('Browser.setWindowBounds', {
        bounds  : {...bounds, windowState: 'normal'},
        windowId: handle.windowId
    });

    // Chromium can deliver a combined move+resize event before `screenX/screenY` expose the new
    // origin. Await the observable move, then emit a one-pixel resize pulse: the product's ordinary
    // resize path must publish that settled full snapshot rather than the earlier CDP ordering quirk.
    if (Number.isFinite(bounds.left) && Number.isFinite(bounds.top)) {
        await expect.poll(async () => {
            const observed = await browserRect(handle.page);

            return Math.max(
                Math.abs(observed.x - bounds.left),
                Math.abs(observed.y - bounds.top)
            )
        }, {
            message  : `window ${handle.windowId} must reach its requested physical position`,
            timeout  : 5000,
            intervals: [50, 100, 250]
        }).toBeLessThanOrEqual(80)
    }

    if (Number.isFinite(bounds.height)) {
        await handle.cdp.send('Browser.setWindowBounds', {
            bounds  : {...bounds, height: bounds.height + 1, windowState: 'normal'},
            windowId: handle.windowId
        });
        await handle.cdp.send('Browser.setWindowBounds', {
            bounds  : {...bounds, windowState: 'normal'},
            windowId: handle.windowId
        });

        // CDP changes the real window bounds but does not emit the page's native `resize` event in
        // this headed automation profile. Unit coverage owns `onResize → publishGeometry`; call the
        // product publisher here so this row isolates the remaining physical-rect → worker path.
        await handle.page.evaluate(() => globalThis.Neo.main.addon.WindowPosition.publishGeometry())
    }
}

async function managerRect(app, managerId, windowId) {
    const state = await app.callMethod(managerId, 'toJSON'),
          win   = state.windows.find(candidate => candidate.id === windowId);

    return pickRect(win?.innerRect)
}

async function awaitParity(app, managerId, page, windowId) {
    let receipt;

    await expect.poll(async () => {
        const observed = await browserRect(page),
              managed  = await managerRect(app, managerId, windowId),
              deltas   = managed && ['x', 'y', 'width', 'height']
                  .map(key => Math.abs(observed[key] - managed[key]));

        receipt = {managed, observed};

        return deltas ? Math.max(...deltas) : Infinity
    }, {
        message  : `window ${windowId} must publish its live browser geometry to manager.Window`,
        timeout  : 5000,
        intervals: [50, 100, 250]
    }).toBeLessThanOrEqual(2);

    return receipt
}

function sampleMetric(source, target) {
    const overlapWidth = Math.max(0,
              Math.min(source.x + source.width, target.x + target.width) - Math.max(source.x, target.x)),
          overlapHeight = Math.max(0,
              Math.min(source.y + source.height, target.y + target.height) - Math.max(source.y, target.y)),
          rx      = overlapWidth / Math.min(source.width, target.width),
          ry      = overlapHeight / Math.min(source.height, target.height),
          product = rx * ry;

    return {min: Math.min(rx, ry), product, rx, ry}
}

/**
 * @summary Headed calibration witness for dual-window conversion composition.
 *
 * Demo B composes strict physical park/re-show. This row proves exact target/vessel identities, live
 * post-resize browser-to-worker geometry, reachability for each asymmetric size pair, a physical
 * diagonal that distinguishes `min(rx, ry)` from `rx * ry`, and the .55/.35 dead band over a slow
 * crossing. Before park, worker truth comes from the exact live vessel; while parked, the source
 * binding deliberately switches to logical pointer position with the last exact physical extents.
 *
 * Run: NEO_E2E_PORT=8120 npx playwright test dashboard/DemoBVesselConversionNL \
 *   -c test/playwright/playwright.config.matrix.mjs --workers=1
 */
test.describe('Dashboard Demo B — vessel-conversion geometry readiness', () => {
    test.setTimeout(120000);
    // This row measures native window extents. The matrix runner's fixed emulated viewport is
    // load-bearing for drag portability rows, but would intentionally mask OS-window resizes here.
    test.use({viewport: null});

    test('publishes live size-pair rects and calibrates the source-owned .55/.35 binding', async ({page, neuralLink}) => {
        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.locator('.agentos-dockdemo-counter-pane').waitFor({timeout: 30000});

        const app       = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow'),
              workspace = await findOne(app, {
                  className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'
              }, ['id']),
              wsId       = workspace.id,
              sourceZone = await findOne(app, {
                  className       : 'Neo.dashboard.DockTabSortZone',
                  dockSourceNodeId: 'workbench-tabs',
                  dockWorkspaceId : 'demo-b-main'
              }, [
                  'enableVesselConversion',
                  'vesselConversionConvertThreshold',
                  'vesselConversionRevertThreshold',
                  'vesselConversionSensor',
                  'vesselConversionTargetId'
              ]),
              windowManager = await findOne(app, {className: 'Neo.manager.Window'}, ['id']);

        expect(sourceZone.properties).toMatchObject({
            enableVesselConversion          : true,
            vesselConversionConvertThreshold: .55,
            vesselConversionRevertThreshold : .35,
            vesselConversionSensor          : null,
            vesselConversionTargetId        : null
        });

        const targetPopupWait           = page.waitForEvent('popup', {timeout: 30000}),
              targetStageWait           = app.callMethod(wsId, 'openCrossWindowStage'),
              [targetPage, targetStage] = await Promise.all([targetPopupWait, targetStageWait]);

        await targetPage.waitForURL(url => url.searchParams.get('workspaceId') === 'demo-b-popup', {
            timeout  : 30000,
            waitUntil: 'domcontentloaded'
        });

        const vesselPopupWait = page.waitForEvent('popup', {timeout: 30000}),
              vesselOpenWait  = app.callMethod(wsId, 'openTearOutVessel', [{
                  itemId   : 'workbench',
                  proxyRect: {height: 280, width: 360, x: 40, y: 40}
              }]),
              [vesselPage, vesselConfig] = await Promise.all([vesselPopupWait, vesselOpenWait]);

        await vesselPage.waitForURL(url => url.searchParams.get('popout') === 'workbench', {
            timeout  : 30000,
            waitUntil: 'domcontentloaded'
        });

        expect(targetPage.url()).toContain('workspaceId=demo-b-popup');
        expect(vesselPage.url()).toContain('popout=workbench');
        expect(vesselConfig).toMatchObject({windowName: 'tearout-workbench'});

        let ids;

        await expect.poll(async () => {
            const state = await app.getComponent(wsId, ['crossWindowTargetWindowId', 'tearOutConnects']);

            ids = {
                source: state.tearOutConnects?.workbench?.windowId || null,
                target: state.crossWindowTargetWindowId
            };

            return ids
        }, {
            message  : 'the target workspace and tear-out vessel must connect under distinct authority',
            timeout  : 10000,
            intervals: [100]
        }).toEqual({source: expect.any(String), target: targetStage.windowId});
        expect(ids.source).not.toBe(ids.target);

        await expect.poll(() => Promise.all([targetPage, vesselPage].map(child => child.evaluate(() => ({
            exists       : Boolean(globalThis.Neo?.main?.addon?.WindowPosition),
            observeResize: globalThis.Neo?.main?.addon?.WindowPosition?.observeResize
        })))), {
            message  : 'both admitted child realms install the geometry publisher',
            timeout  : 10000,
            intervals: [100]
        }).toEqual([
            {exists: true, observeResize: true},
            {exists: true, observeResize: true}
        ]);

        const targetHandle = await cdpWindow(targetPage),
              sourceHandle = await cdpWindow(vesselPage),
              screen       = await page.evaluate(() => ({
                  left: Number.isFinite(globalThis.screen.availLeft) ? globalThis.screen.availLeft : 0,
                  top : Number.isFinite(globalThis.screen.availTop)  ? globalThis.screen.availTop  : 0
              })),
              left         = screen.left + 40,
              top          = screen.top + 40,
              cells        = [
                  {name: 'small-over-large', source: [360, 300], target: [760, 560]},
                  {name: 'large-over-small', source: [760, 560], target: [360, 300]},
                  {name: 'near-equal',       source: [620, 480], target: [600, 460]},
                  {name: 'post-resize',      source: [740, 520], target: [400, 320]}
              ],
              receipts     = [];

        for (const cell of cells) {
            await setBounds(targetHandle, {height: cell.target[1], left, top, width: cell.target[0]});
            await setBounds(sourceHandle, {height: cell.source[1], left, top, width: cell.source[0]});

            const target = await awaitParity(app, windowManager.id, targetPage, ids.target),
                  source = await awaitParity(app, windowManager.id, vesselPage, ids.source),
                  metric = sampleMetric(source.observed, target.observed);

            expect(metric.rx, `${cell.name} horizontal reachability`).toBeGreaterThan(.97);
            expect(metric.ry, `${cell.name} vertical reachability`).toBeGreaterThan(.97);
            receipts.push({name: cell.name, source, target, metric})
        }

        expect(receipts.at(-1).target.observed.width,
            'post-resize must publish a different live target extent')
            .not.toBe(receipts.at(-2).target.observed.width);

        await setBounds(targetHandle, {height: 560, left, top, width: 760});
        await setBounds(sourceHandle, {height: 320, left, top, width: 400});

        let target   = await awaitParity(app, windowManager.id, targetPage, ids.target),
            source   = await awaitParity(app, windowManager.id, vesselPage, ids.source),
            {bounds} = await sourceHandle.cdp.send('Browser.getWindowBounds', {windowId: sourceHandle.windowId}),
            desiredX = target.observed.x + target.observed.width  - .8 * source.observed.width,
            desiredY = target.observed.y + target.observed.height - .6 * source.observed.height;

        await setBounds(sourceHandle, {
            ...bounds,
            height: bounds.height + 1,
            left  : Math.round(bounds.left + desiredX - source.observed.x),
            top   : Math.round(bounds.top  + desiredY - source.observed.y)
        });
        source = await awaitParity(app, windowManager.id, vesselPage, ids.source);

        const diagonal = sampleMetric(source.observed, target.observed);

        expect(diagonal.rx).toBeGreaterThan(.75);
        expect(diagonal.rx).toBeLessThan(.85);
        expect(diagonal.ry).toBeGreaterThan(.55);
        expect(diagonal.ry).toBeLessThan(.65);
        expect(Math.abs(diagonal.min - diagonal.product), 'headed sample distinguishes min from product')
            .toBeGreaterThan(.08);

        await app.callMethod(sourceZone.id, 'startWindowDrag', [{
            popupHeight: source.observed.height,
            popupWidth : source.observed.width,
            windowName : 'tearout-workbench'
        }]);

        const requestedRatios = [.2, .5, .58, .5, .38, .32],
              expectedStates  = [false, false, true, true, true, false],
              calibration     = [];

        for (const requestedRatio of requestedRatios) {
            target = await awaitParity(app, windowManager.id, targetPage, ids.target);
            source = await awaitParity(app, windowManager.id, vesselPage, ids.source);

            const beforeState            = await app.callMethod(sourceZone.id, 'getVesselConversionState'),
                  {bounds: sourceBounds} = await sourceHandle.cdp.send('Browser.getWindowBounds', {
                      windowId: sourceHandle.windowId
                  }),
                  desiredX = target.observed.x + target.observed.width
                      - requestedRatio * Math.min(source.observed.width, target.observed.width),
                  desiredY = target.observed.y;

            if (!beforeState.converted && !beforeState.transitioning) {
                await setBounds(sourceHandle, {
                    ...sourceBounds,
                    left: Math.round(sourceBounds.left + desiredX - source.observed.x),
                    top : Math.round(sourceBounds.top  + desiredY - source.observed.y)
                });

                source = await awaitParity(app, windowManager.id, vesselPage, ids.source)
            }

            const logicalSourceRect = {height: 20, width: 40, x: desiredX, y: desiredY},
                  frame             = {
                      draggedItem    : {dockItemId: 'workbench', id: 'calibration-probe'},
                      logicalSourceRect,
                      pointerInTarget: true,
                      targetId       : 'demo-b-popup',
                      targetRect     : target.observed
                  };

            await app.callMethod(sourceZone.id, 'resolveRemoteDragTransition', [frame]);

            await expect.poll(async () => {
                const state = await app.callMethod(sourceZone.id, 'getVesselConversionState');

                return state.transitioning
            }, {
                message  : `ratio ${requestedRatio} strict platform transition must settle`,
                timeout  : 5000,
                intervals: [25, 50, 100]
            }).toBe(false);

            const decision = await app.callMethod(sourceZone.id, 'resolveRemoteDragTransition', [frame]),
                  binding  = await app.getComponent(sourceZone.id, [
                      'vesselConversionLogicalRect',
                      'vesselConversionSourceRect'
                  ]),
                  park     = await app.getComponent(wsId, ['lastVesselParkReceipt']),
                  metric = sampleMetric(binding.vesselConversionSourceRect, target.observed),
                  expectedSourceRect = beforeState.converted
                      ? {
                          height: source.observed.height,
                          width : source.observed.width,
                          x     : logicalSourceRect.x,
                          y     : logicalSourceRect.y
                      }
                      : source.observed;

            expect(binding.vesselConversionSourceRect,
                'pre-park uses exact live geometry; parked frames preserve exact extents at logical origin')
                .toEqual(expectedSourceRect);
            expect(binding.vesselConversionLogicalRect).toEqual(logicalSourceRect);
            calibration.push({beforeState, decision, metric, park: park.lastVesselParkReceipt, requestedRatio, source: expectedSourceRect})
        }

        expect(calibration.map(({decision}) => decision.commitEligible)).toEqual(expectedStates);

        const flips = expectedStates.slice(1)
            .filter((state, index) => state !== expectedStates[index]).length;

        expect(flips, 'one slow in/out crossing must produce exactly one convert-in + one convert-out')
            .toBe(2);

        const pointerOutDecision = await app.callMethod(sourceZone.id, 'resolveRemoteDragTransition', [{
            draggedItem      : {dockItemId: 'workbench', id: 'calibration-probe'},
            logicalSourceRect: source.observed,
            pointerInTarget  : false,
            targetId         : null,
            targetRect       : null
        }]);

        expect(pointerOutDecision, 'rect overlap without target-owned pointer intent stays inert')
            .toEqual({commitEligible: false, engage: false, retain: false});

        await app.callMethod(sourceZone.id, 'resetVesselConversion');
        await app.callMethod(sourceZone.id, 'endWindowDrag');

        console.log('VESSEL-CONVERSION-CALIBRATION', JSON.stringify({calibration, diagonal, flips, receipts}))
    })
});
