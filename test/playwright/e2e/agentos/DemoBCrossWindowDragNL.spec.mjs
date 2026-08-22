import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Waits for one admitted child realm's ordinary geometry publisher, then publishes its
 * observed frame after CDP automation moved the real top-level window.
 * @param {import('@playwright/test').Page} page
 * @param {String} message
 */
async function publishObservedGeometry(page, message) {
    await expect.poll(() => page.evaluate(() =>
        Boolean(globalThis.Neo?.main?.addon?.WindowPosition?.publishGeometry)
    ), {
        message,
        timeout  : 10000,
        intervals: [25, 50, 100]
    }).toBe(true);

    await page.evaluate(() => globalThis.Neo.main.addon.WindowPosition.publishGeometry())
}

/**
 * @summary Chrome-automation physical-window adapter. Product browsers honor the app-owned
 * placement request; automation can ignore it, so CDP moves only the real top-level vessel.
 * Dock semantics, pointer events, previews and commits remain entirely Neo-owned.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Page} popup
 */
async function placePopupOutsideSource(page, popup) {
    await popup.waitForURL(url => url.protocol !== 'about:', {timeout: 30000});

    const readRect = target => target.evaluate(() => ({
        height: globalThis.outerHeight,
        width : globalThis.outerWidth,
        x     : globalThis.screenX,
        y     : globalThis.screenY
    }));

    // Product/headed browsers honor the app's own placement after the popup connects. Give that
    // bounded observable path first authority; only an actually-overlapping stage needs CDP.
    for (let attempt = 0; attempt < 20; attempt++) {
        let [source, target] = await Promise.all([readRect(page), readRect(popup)]),
            overlaps         = source.x < target.x + target.width && source.x + source.width > target.x
                && source.y < target.y + target.height && source.y + source.height > target.y;

        if (!overlaps) return;

        await page.waitForTimeout(25)
    }

    const popupCdp    = await page.context().newCDPSession(popup),
          popupWindow = await popupCdp.send('Browser.getWindowForTarget'),
          sourceStage = await page.evaluate(() => ({
              availHeight: globalThis.screen.availHeight,
              availLeft  : globalThis.screen.availLeft,
              availTop   : globalThis.screen.availTop,
              availWidth : globalThis.screen.availWidth,
              height     : globalThis.outerHeight,
              left       : globalThis.screenX,
              top        : globalThis.screenY,
              width      : globalThis.outerWidth
          })),
          targetHeight = popupWindow.bounds.height,
          targetWidth  = popupWindow.bounds.width,
          gap          = 40,
          candidates   = [{
              left: sourceStage.left + sourceStage.width + gap,
              top : sourceStage.top
          }, {
              left: sourceStage.left - targetWidth - gap,
              top : sourceStage.top
          }, {
              left: sourceStage.left,
              top : sourceStage.top + sourceStage.height + gap
          }, {
              left: sourceStage.left,
              top : sourceStage.top - targetHeight - gap
          }],
          point = candidates.find(candidate => candidate.left >= sourceStage.availLeft
              && candidate.top >= sourceStage.availTop
              && candidate.left + targetWidth <= sourceStage.availLeft + sourceStage.availWidth
              && candidate.top + targetHeight <= sourceStage.availTop + sourceStage.availHeight);

    if (!point) {
        throw new Error('the headed screen cannot place the target popup outside the source window')
    }

    const requested = {
        height: targetHeight,
        ...point,
        width : targetWidth
    };

    await popupCdp.send('Browser.setWindowBounds', {
        bounds: {
            ...requested,
            windowState: 'normal'
        },
        windowId: popupWindow.windowId
    });

    await expect.poll(async () => {
        const observed = await readRect(popup);

        return Math.max(Math.abs(observed.x - requested.left), Math.abs(observed.y - requested.top))
    }, {
        message  : 'the CDP adapter must move the real target window before publishing geometry',
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBeLessThanOrEqual(80);

    await expect.poll(async () => {
        const [source, target] = await Promise.all([readRect(page), readRect(popup)]);

        return source.x < target.x + target.width && source.x + source.width > target.x
            && source.y < target.y + target.height && source.y + source.height > target.y
    }, {
        message  : 'the CDP adapter must leave two physically non-overlapping top-level windows',
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBe(false);

    // CDP does not guarantee the page's native resize/movement events in this automation profile.
    // Publish the observed target-realm snapshot so the product readiness gate still consumes its
    // ordinary manager.Window authority rather than test-owned requested coordinates.
    await publishObservedGeometry(popup, 'the target popup must install its geometry publisher')
}

/**
 * @summary Moves one real popup to an observed screen-space origin and republishes its target-
 * realm geometry. This is automation plumbing only; it never writes requested coordinates into
 * Neo's manager truth.
 * @param {import('@playwright/test').Page} popup
 * @param {{x:Number, y:Number}} origin
 * @param {String} message
 */
async function placePopupAtObservedOrigin(popup, origin, message) {
    const popupCdp    = await popup.context().newCDPSession(popup),
          popupWindow = await popupCdp.send('Browser.getWindowForTarget'),
          requested   = {
              height: popupWindow.bounds.height,
              left  : origin.x,
              top   : origin.y,
              width : popupWindow.bounds.width
          };

    await popupCdp.send('Browser.setWindowBounds', {
        bounds  : {...requested, windowState: 'normal'},
        windowId: popupWindow.windowId
    });

    await expect.poll(async () => {
        const observed = await popup.evaluate(() => ({x: globalThis.screenX, y: globalThis.screenY}));

        return Math.max(Math.abs(observed.x - requested.left), Math.abs(observed.y - requested.top))
    }, {
        message,
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBeLessThanOrEqual(80);

    await publishObservedGeometry(popup, 'the moving vessel must install its geometry publisher')
}

/**
 * @summary Headed-Chrome adapter for the moving tear-out vessel. Automation can deny the
 * product's pointer-follow `window.moveTo()` even though it allowed the popup acquisition. Move
 * the real top-level window to the observed target origin, then publish only the observed target-
 * realm geometry; Neo's conversion and exact-handle park gates remain the decision authority.
 * @param {import('@playwright/test').Page} target
 * @param {import('@playwright/test').Page} vessel
 */
async function placeMovingVesselAtTarget(target, vessel) {
    const targetOrigin = await target.evaluate(() => ({x: globalThis.screenX, y: globalThis.screenY}));

    await placePopupAtObservedOrigin(
        vessel,
        targetOrigin,
        'the CDP adapter must place the real moving vessel over the observed target'
    )
}

/**
 * @summary Finds the one browser-owned tear-out child after its staged same-origin navigation.
 * @param {import('@playwright/test').Page[]} pages
 * @returns {Promise<import('@playwright/test').Page>}
 */
async function waitForTearOutPopup(pages) {
    let popup;

    await expect.poll(() => {
        popup = pages.find(child => {
            try {
                return new URL(child.url()).searchParams.get('popout') === 'workbench'
            } catch {
                return false
            }
        });

        return Boolean(popup)
    }, {
        message  : 'the exact tear-out Page must navigate and remain live during conversion',
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBe(true);

    return popup
}

/**
 * @summary Gives the headed physical-window adapter a bounded observation window without changing
 * the production movement contract.
 * @param {import('@playwright/test').Page} page
 */
async function widenAutomationWindowMoveObservation(page) {
    await page.evaluate(() => {
        globalThis.Neo.Main.windowMovePollAttempts = 40;
        globalThis.Neo.Main.windowMovePollDelay    = 25
    })
}

/**
 * @summary Whitebox Phase-0 gate for Demo B's real two-window dock gesture.
 *
 * Neural Link invokes the app's semantic executor, but the executor itself resolves the live tab
 * header and both render-target geometries immediately before dispatching a readiness-gated
 * mousedown -> threshold moves -> remote screen moves -> mouseup sequence through the existing
 * InteractionService. Before release, the receipt captures the live coordinator, semantic
 * preview, rendered preview, and indicator selection. The post-state then proves the real path,
 * not an equivalent reducer call: target transfer once, source remote-drop-out once, source local
 * drop zero times, both worker-owned documents changed, and the same CounterPane instance mounted
 * into the second browser document without resetting its heartbeat.
 *
 * Headed matrix run: NEO_E2E_PORT=8120 npx playwright test agentos/DemoBCrossWindowDragNL \
 *   -c test/playwright/playwright.config.matrix.mjs --workers=1
 */
test.describe('AgentOS Demo B — real cross-window dock drag', () => {
    test.setTimeout(120000);
    // Both physical viewports must fit side-by-side on the CI screen because global screen-space
    // hit-testing deliberately resolves the first intersecting window. The app itself remains
    // container-responsive; this is stage geometry, not a fixed product layout assumption.
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 760}
    });

    test('the cold gesture transfers Workbench once and preserves its live worker instance', async ({page, neuralLink}) => {
        const pageErrors    = [],
              popupErrors   = [],
              popupPages    = [],
              runtimeErrors = [];

        page.context().on('page', child => popupPages.push(child));

        await page.context().exposeFunction('__recordDemoBCrossWindowError', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => {
                globalThis.__recordDemoBCrossWindowError({
                    column : event.colno,
                    line   : event.lineno,
                    message: event.message,
                    source : event.filename,
                    type   : 'error'
                })
            });
            globalThis.addEventListener('unhandledrejection', event => {
                globalThis.__recordDemoBCrossWindowError({
                    reason: String(event.reason?.stack || event.reason?.message || event.reason),
                    type  : 'unhandledrejection'
                })
            })
        });

        page.on('pageerror', error => {
            let value = String(error?.stack || error?.message || error || '');

            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.waitForSelector('.agentos-dockdemo-counter-pane', {timeout: 30000});
        await widenAutomationWindowMoveObservation(page);

        const app        = await neuralLink.connectToApp('AgentOSDockDemo'),
              workspaces = await app.findInstances(
                  {className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'},
                  ['id']
              ),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the App Worker must own one DemoBWorkspace').toBeTruthy();

        const readCounter = async () => {
            const counters = await app.findInstances(
                {className: 'Neo.examples.dashboard.crossWindow.CounterPane'},
                ['frames', 'id', 'mounted', 'mountCount', 'windowId']
            );

            return Array.isArray(counters) ? counters[0] : counters
        };

        await expect.poll(async () => (await readCounter())?.properties?.mountCount, {
            message  : 'the real source-document mount must be observable before the gesture',
            timeout  : 10000,
            intervals: [100]
        }).toBe(1);

        const baseline = await readCounter(),
              before   = await app.getComponent(wsId, ['dockModel', 'popupDocument']);

        expect(before.dockModel.nodes['workbench-tabs'].items).toEqual(['workbench']);
        expect(before.popupDocument.nodes['popup-tabs'].items).toEqual([]);

        await app.getDragTrace(true);

        const popupPromise  = page.waitForEvent('popup', {timeout: 30000}),
              resultPromise = app.callMethod(wsId, 'executeCrossWindowStep', [{
                  itemId           : 'workbench',
                  sourceWorkspaceId: 'demo-b-main',
                  targetNodeId     : 'popup-tabs',
                  targetWorkspaceId: 'demo-b-popup'
              }]),
              popup = await popupPromise;

        // Chrome's headless window manager ignores `window.open(left=...)` and `window.moveTo`,
        // even though headed/product browsers honor the app-owned placement path. Move the REAL
        // popup target through CDP so Neo's screen-space Window manager observes two physical,
        // non-overlapping rectangles; no dock semantics or gesture events ride this adapter.
        await placePopupOutsideSource(page, popup);

        const tearOutPopup = await waitForTearOutPopup(popupPages);

        await placeMovingVesselAtTarget(popup, tearOutPopup);

        popup.on('pageerror', error => {
            let value = String(error?.stack || error?.message || error || '');

            value && value !== 'undefined' && popupErrors.push(value)
        });

        const result         = await resultPromise,
              phaseZeroTrace = await app.getDragTrace();

        expect(result.errors,
            `the real gesture must settle through the remote target: ${JSON.stringify(result.debug ?? null)}`
            + `\ndrag trace: ${JSON.stringify(phaseZeroTrace)}`)
            .toEqual([]);
        expect(result.applied).toBe(true);
        expect(result.witness.instanceId, 'the transferred pane is the original live instance').toBe(baseline.id);
        expect(result.proof).toMatchObject({
            framesNotReset           : true,
            localDropFires           : 0,
            mountDelta               : 2,
            remoteDropOutFires       : 1,
            sameInstance             : true,
            sourceSuppressionConsumed: true,
            targetMountDelta         : 1,
            transferCommits          : 1,
            vesselMountDelta         : 1
        });
        expect(result.proof.remoteSnapshot).toMatchObject({
            engaged     : true,
            ready       : true,
            targetNodeId: 'popup-tabs',
            preview     : {itemId: 'workbench', target: {nodeId: 'popup-tabs'}},
            rendered    : {itemId: 'workbench', target: {nodeId: 'popup-tabs'}}
        });
        expect(result.proof.remoteSnapshot.indicators.candidateCount,
            'the empty root tabs target must expose its five distinct cross candidates before release').toBe(5);
        expect(result.proof.remoteSnapshot.indicators.activePreviewId,
            'the lit indicator and committed semantic preview must be the same candidate')
            .toBe(result.proof.remoteSnapshot.preview.previewId);

        await expect(popup.locator('.agentos-dockdemo-counter-pane'),
            'the target window must render the transferred live pane').toBeVisible({timeout: 10000});

        const after                = await app.getComponent(wsId, ['crossWindowStats', 'dockModel', 'popupDocument']),
              counter              = await readCounter(),
              topologyCaptureProbe = await app.callMethod(wsId, 'capturePerspective', [
                  'CrossWindowProbe', {scope: 'topology'}
              ]);

        expect(topologyCaptureProbe, 'the real transferred documents must remain topology-capturable')
            .toEqual({errors: [], saved: true});

        const expectedSource = {
                  schema: 'neo.harness.dockZone.v1',
                  root  : 'root',
                  items : {
                      inspector: {componentRef: 'Inspector', title: 'Inspector', kind: 'panel'},
                      timeline : {componentRef: 'Timeline',  title: 'Timeline',  kind: 'panel'},
                      console  : {componentRef: 'Console',   title: 'Console',   kind: 'terminal'}
                  },
                  nodes: {
                      root       : {type: 'edge-zone', zones: {right: 'side-tabs'}},
                      'side-tabs': {
                          type: 'tabs', items: ['inspector', 'timeline', 'console'], activeItemId: 'inspector'
                      }
                  }
              },
              expectedTarget = {
                  schema: 'neo.harness.dockZone.v1',
                  root  : 'popup-root',
                  items : {
                      workbench: {componentRef: 'Workbench', title: 'Workbench', kind: 'panel'}
                  },
                  nodes: {
                      'popup-root': {type: 'edge-zone', zones: {center: 'popup-tabs'}},
                      'popup-tabs': {type: 'tabs', items: ['workbench'], activeItemId: 'workbench'}
                  }
              };

        expect(result.sourceDocument).toEqual(expectedSource);
        expect(result.targetDocument).toEqual(expectedTarget);
        expect(after.dockModel).toEqual(result.sourceDocument);
        expect(after.popupDocument).toEqual(result.targetDocument);
        expect(after.crossWindowStats).toEqual({
            localDropFires    : 0,
            remoteDropOutFires: 1,
            transferCommits   : 1
        });
        expect(counter.id).toBe(baseline.id);
        expect(counter.properties.mountCount).toBe(baseline.properties.mountCount + 2);
        expect(counter.properties.mounted).toBe(true);
        expect(counter.properties.windowId).not.toBe(baseline.properties.windowId);

        await expect.poll(async () => (await readCounter())?.properties?.frames, {
            message  : 'the instance-local heartbeat must continue after the target-document mount',
            timeout  : 5000,
            intervals: [100, 250]
        }).toBeGreaterThan(counter.properties.frames);

        const traceData = phaseZeroTrace,
              traces    = traceData?.traces || traceData?.result?.traces || [],
              trace     = traces[traces.length - 1];

        expect(trace, 'the real tab SortZone must record the gesture').toBeTruthy();
        expect(trace.events.some(event => event.t === 'move'), 'the sensor must produce a real move leg').toBe(true);
        expect(trace.events.at(-1)?.t, 'the source SortZone must complete its terminal cleanup').toBe('end');

        const targets = await app.findInstances({dockNodeId: 'popup-tabs'}, ['id', 'windowId']),
              target  = Array.isArray(targets) ? targets[0] : targets;

        expect(target?.id, 'the target tabs projection must exist in worker truth').toBeTruthy();

        const consistency = await app.verifyComponentConsistency(target.id),
              mismatches  = consistency?.mismatches || consistency?.result?.mismatches || [];

        expect(mismatches, 'target items / VDOM / DOM must agree after adoption').toEqual([]);
        expect(runtimeErrors).toEqual([]);
        expect(popupErrors).toEqual([]);
        expect(pageErrors).toEqual([])
    });

    test('one gesture parks, re-shows, and detaches the same vessel without popup re-acquisition', async ({page, neuralLink}) => {
        const pageErrors      = [],
              popupPages      = [],
              windowOpenCalls = [];

        await page.context().exposeFunction('__recordDemoBWindowOpen', data => windowOpenCalls.push(data));
        await page.context().addInitScript(() => {
            const nativeOpen = globalThis.open;

            globalThis.open = function(url, target, features) {
                globalThis.__recordDemoBWindowOpen({
                    features: String(features ?? ''),
                    target  : String(target ?? ''),
                    url     : String(url ?? '')
                });

                return nativeOpen.call(this, url, target, features)
            }
        });

        page.context().on('page', child => {
            popupPages.push(child);
            child.on('pageerror', error => {
                let value = String(error?.stack || error?.message || error || '');

                value && value !== 'undefined' && pageErrors.push(value)
            })
        });
        page.on('pageerror', error => {
            let value = String(error?.stack || error?.message || error || '');

            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.waitForSelector('.agentos-dockdemo-counter-pane', {timeout: 30000});
        await widenAutomationWindowMoveObservation(page);

        const app        = await neuralLink.connectToApp('AgentOSDockDemo'),
              workspaces = await app.findInstances(
                  {className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'},
                  ['id']
              ),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id,
              counters   = await app.findInstances(
                  {className: 'Neo.examples.dashboard.crossWindow.CounterPane'},
                  ['id', 'mountCount', 'windowId']
              ),
              counterList = Array.isArray(counters) ? counters : counters ? [counters] : [],
              baseline   = counterList[0],
              before     = await app.getComponent(wsId, ['dockModel', 'popupDocument', 'tearOutAcquisitionAttempts']);

        expect(wsId).toBeTruthy();
        expect(counterList, 'exactly one live CounterPane exists before the gesture').toHaveLength(1);
        expect(before.tearOutAcquisitionAttempts).toBe(0);

        const targetPromise = page.waitForEvent('popup', {timeout: 30000}),
              resultPromise = app.callMethod(wsId, 'executeCrossWindowStep', [{
                  itemId           : 'workbench',
                  sourceWorkspaceId: 'demo-b-main',
                  targetNodeId     : 'popup-tabs',
                  targetWorkspaceId: 'demo-b-popup'
              }, {parkObservationMs: 1800, roundTrip: true}]),
              targetPopup = await targetPromise;

        await placePopupOutsideSource(page, targetPopup);

        let tearOutPopup;

        try {
            tearOutPopup = await waitForTearOutPopup(popupPages)
        } catch (error) {
            const result = await resultPromise;

            throw new Error(`${error.message}\nround-trip result: ${JSON.stringify(result)}`)
        }

        await placeMovingVesselAtTarget(targetPopup, tearOutPopup);

        let parkReceipt;

        try {
            await expect.poll(async () => {
                parkReceipt = (await app.getComponent(wsId, ['lastVesselParkReceipt'])).lastVesselParkReceipt;
                return parkReceipt?.parked === true
            }, {
                message  : 'the product must publish strict park admission before the observation window ends',
                timeout  : 1500,
                intervals: [25, 50]
            }).toBe(true)
        } catch (error) {
            const result = await resultPromise;

            throw new Error(`${error.message}\npark receipt: ${JSON.stringify(parkReceipt)}`
                + `\nround-trip result: ${JSON.stringify(result)}`)
        }

        await expect(tearOutPopup.locator('.agentos-dockdemo-counter-pane'),
            'the moving tear-out vessel must render its real live pane before any terminal commit')
            .toBeVisible({timeout: 5000});

        let sourceParkState;

        await expect.poll(async () => {
            sourceParkState = await tearOutPopup.evaluate(() => ({
                focused: document.hasFocus(),
                x      : globalThis.screenX,
                y      : globalThis.screenY
            }));

            return Math.max(
                Math.abs(sourceParkState.x - parkReceipt.requested.x),
                Math.abs(sourceParkState.y - parkReceipt.requested.y)
            )
        }, {
            message  : 'the tear-out renderer must observe the admitted physical park position',
            timeout  : 1000,
            intervals: [25, 50]
        }).toBeLessThanOrEqual(2);

        const targetParkState = await targetPopup.evaluate(() => ({
            focused: document.hasFocus(),
            x      : globalThis.screenX,
            y      : globalThis.screenY
        }));

        expect(targetParkState.focused, 'moving the source must not raise it above the focused cover target').toBe(true);
        // Chrome automation can report document.hasFocus() true in multiple top-level pages at
        // once. The post-move TARGET receipt is the exclusive admission oracle; requiring the
        // source to report false would encode a browser-harness quirk as product semantics.
        expect(parkReceipt.refocused).toBe(true);

        let restoreReceipt;

        await expect.poll(async () => {
            restoreReceipt = (await app.getComponent(wsId, ['lastVesselRestoreReceipt'])).lastVesselRestoreReceipt;
            return Boolean(restoreReceipt?.requested)
        }, {
            message  : 'out-conversion must publish its exact restore request',
            timeout  : 3000,
            intervals: [10, 25, 50]
        }).toBe(true);

        await placePopupAtObservedOrigin(
            tearOutPopup,
            restoreReceipt.requested,
            'the CDP adapter must let the real vessel reach Neo\'s exact restore request'
        );

        const result = await resultPromise;

        expect(result.errors,
            `the full conversion round-trip must settle detached: ${JSON.stringify(result.debug ?? null)}`)
            .toEqual([]);
        expect(result.applied).toBe(true);
        expect(result.witness.instanceId).toBe(baseline.id);
        expect(result.proof).toMatchObject({
            acquisitionAttempts: {
                afterRestore            : 1,
                atFirstPark             : 1,
                beforeGesture           : 0,
                midGestureReacquisitions: 0,
                totalGestureAttempts    : 1
            },
            detached: {
                catalogRetained: true,
                itemAbsent     : true
            },
            parkSlotCleared : true,
            restored        : true,
            sameNativeHandle: true,
            sameWindowId    : true,
            stats           : {
                localDropFires    : 0,
                remoteDropOutFires: 0,
                transferCommits   : 0
            }
        });
        expect(result.proof.firstRemoteSnapshot).toMatchObject({engaged: true, ready: true});
        expect(result.proof.outSnapshot).toMatchObject({engaged: false, ready: false});
        expect(result.proof.detached.entry.windowId).toBe(result.proof.firstIdentity.windowId);
        expect(result.proof.terminalIdentity).toEqual(result.proof.firstIdentity);
        expect(result.proof.parkReceipt).toEqual(parkReceipt);

        // Same-origin acquisition now opens about:blank before minting its route and navigating.
        // The browser-owned target name, not the staged URL, joins the surviving Page back to its
        // actual window.open call without consulting the product's acquisition counter.
        const tearOutTargetName = await tearOutPopup.evaluate(() => globalThis.name),
              tearOutOpenCalls  = windowOpenCalls.filter(call => call.target === tearOutTargetName);

        expect(tearOutOpenCalls, 'browser-realm instrumentation observes zero mid-gesture reacquisition')
            .toHaveLength(1);

        await expect.poll(() => page.context().pages().filter(child => {
            try {
                return new URL(child.url()).searchParams.get('popout') === 'workbench'
            } catch {
                return false
            }
        }).length, {
            message  : 'exactly one tear-out Page survives as the detached terminal owner',
            timeout  : 10000,
            intervals: [100]
        }).toBe(1);

        const survivingTearOut = page.context().pages().filter(child => {
                  try {
                      return new URL(child.url()).searchParams.get('popout') === 'workbench'
                  } catch {
                      return false
                  }
              })[0],
              after = await app.getComponent(wsId, [
                  'crossWindowStats', 'dockModel', 'popupDocument', 'tearOutAcquisitionAttempts', 'tearOutPanes'
              ]),
              finalCounters = await app.findInstances(
                  {className: 'Neo.examples.dashboard.crossWindow.CounterPane'},
                  ['id', 'mountCount', 'windowId']
              ),
              finalCounterList = Array.isArray(finalCounters) ? finalCounters : finalCounters ? [finalCounters] : [],
              finalCounter = finalCounterList[0],
              restoredPhysical = await survivingTearOut.evaluate(() => ({
                  x: globalThis.screenX,
                  y: globalThis.screenY
              }));

        expect(survivingTearOut, 're-show and terminal retain the acquisition-time Page object').toBe(tearOutPopup);
        expect(finalCounterList, 'the round-trip never duplicates the live CounterPane').toHaveLength(1);
        await expect(survivingTearOut.locator('.agentos-dockdemo-counter-pane')).toBeVisible({timeout: 10000});
        expect(Math.abs(restoredPhysical.x - result.proof.restoreReceipt.requested.x)).toBeLessThanOrEqual(2);
        expect(Math.abs(restoredPhysical.y - result.proof.restoreReceipt.requested.y)).toBeLessThanOrEqual(2);
        expect(after.tearOutAcquisitionAttempts).toBe(1);
        expect(after.popupDocument).toEqual(before.popupDocument);
        expect(after.dockModel.items.workbench).toEqual(before.dockModel.items.workbench);
        expect(Object.values(after.dockModel.nodes).some(node => node.items?.includes('workbench'))).toBe(false);
        expect(after.tearOutPanes.workbench.windowId).toBe(result.proof.firstIdentity.windowId);
        expect(after.crossWindowStats).toEqual(result.proof.stats);
        expect(finalCounter.id).toBe(baseline.id);
        expect(finalCounter.properties.mountCount).toBe(baseline.properties.mountCount + 1);
        expect(finalCounter.properties.windowId).toBe(result.proof.firstIdentity.windowId);
        expect(pageErrors).toEqual([]);

        await survivingTearOut.close();
        await targetPopup.close()
    });

    test('Escape after remote preview clears every gesture surface and mutates neither document', async ({page, neuralLink}) => {
        const pageErrors    = [],
              popupErrors   = [],
              popupPages    = [],
              runtimeErrors = [];

        page.context().on('page', child => popupPages.push(child));

        await page.context().exposeFunction('__recordDemoBCrossWindowCancelError', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => {
                globalThis.__recordDemoBCrossWindowCancelError({
                    column : event.colno,
                    line   : event.lineno,
                    message: event.message,
                    source : event.filename,
                    type   : 'error'
                })
            });
            globalThis.addEventListener('unhandledrejection', event => {
                globalThis.__recordDemoBCrossWindowCancelError({
                    reason: String(event.reason?.stack || event.reason?.message || event.reason),
                    type  : 'unhandledrejection'
                })
            })
        });

        page.on('pageerror', error => {
            let value = String(error?.stack || error?.message || error || '');

            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.waitForSelector('.agentos-dockdemo-counter-pane', {timeout: 30000});
        await widenAutomationWindowMoveObservation(page);

        const app        = await neuralLink.connectToApp('AgentOSDockDemo'),
              workspaces = await app.findInstances(
                  {className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'},
                  ['id']
              ),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id,
              counters   = await app.findInstances(
                  {className: 'Neo.examples.dashboard.crossWindow.CounterPane'},
                  ['frames', 'id', 'mountCount', 'windowId']
              ),
              baseline   = Array.isArray(counters) ? counters[0] : counters,
              before     = await app.getComponent(wsId, ['dockModel', 'popupDocument']);

        expect(wsId).toBeTruthy();
        await app.getDragTrace(true);

        const popupPromise  = page.waitForEvent('popup', {timeout: 30000}),
              resultPromise = app.callMethod(wsId, 'executeCrossWindowStep', [{
                  itemId           : 'workbench',
                  sourceWorkspaceId: 'demo-b-main',
                  targetNodeId     : 'popup-tabs',
                  targetWorkspaceId: 'demo-b-popup'
              }, {cancelAtTarget: true}]),
              popup = await popupPromise;

        popup.on('pageerror', error => {
            let value = String(error?.stack || error?.message || error || '');

            value && value !== 'undefined' && popupErrors.push(value)
        });

        await placePopupOutsideSource(page, popup);

        const tearOutPopup = await waitForTearOutPopup(popupPages);

        await placeMovingVesselAtTarget(popup, tearOutPopup);

        const result        = await resultPromise,
              after         = await app.getComponent(wsId, ['crossWindowStats', 'dockModel', 'popupDocument']),
              finalCounters = await app.findInstances(
                  {className: 'Neo.examples.dashboard.crossWindow.CounterPane'},
                  ['frames', 'id', 'mountCount', 'windowId']
              ),
              finalCounter = Array.isArray(finalCounters) ? finalCounters[0] : finalCounters,
              traceData    = await app.getDragTrace(),
              traces       = traceData?.traces || traceData?.result?.traces || [],
              trace        = traces[traces.length - 1];

        expect(result.applied).toBe(false);
        expect(result.cancelled).toBe(true);
        expect(result.errors).toEqual(['cross-window gesture cancelled before commit']);
        expect(result.proof.documentsUnchanged).toBe(true);
        expect(result.proof.remoteSnapshot).toMatchObject({engaged: true, ready: true});
        expect(result.proof.cancellation).toEqual({
            escapeDispatched : true,
            releaseDispatched: true,
            settled          : true
        });
        expect(result.proof.cleanup).toEqual({
            activeTargetZone      : null,
            activeCandidateId     : null,
            candidateSetSchema    : null,
            dragDataPresent       : false,
            dragEndActive         : false,
            dragPlaceholderPresent: false,
            dragProxyPresent      : false,
            draggingClass         : false,
            nativeCandidateCount  : 0,
            semanticPreviewId     : null,
            renderedPreviewId     : null,
            ready                 : true
        });
        expect(result.proof.stats).toEqual({
            localDropFires    : 0,
            remoteDropOutFires: 0,
            transferCommits   : 0
        });

        expect(after.dockModel).toEqual(before.dockModel);
        expect(after.popupDocument).toEqual(before.popupDocument);
        expect(after.crossWindowStats).toEqual(result.proof.stats);
        expect(finalCounter.id).toBe(baseline.id);
        expect(finalCounter.properties.mountCount).toBe(baseline.properties.mountCount + 2);
        expect(finalCounter.properties.windowId).toBe(baseline.properties.windowId);
        expect(trace?.events.at(-1)?.t).toBe('cancel');
        expect(runtimeErrors).toEqual([]);
        expect(popupErrors).toEqual([]);
        expect(pageErrors).toEqual([]);

        await popup.close()
    })
});
