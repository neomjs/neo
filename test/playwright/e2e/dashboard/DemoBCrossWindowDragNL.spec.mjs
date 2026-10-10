import {test, expect}        from '../../fixtures.mjs';
import {placeBesideSource}   from '../utils/filmStage.mjs';
import {readNativeLifecycle} from '../utils/dockNativeLifecycle.mjs';

/**
 * @summary Whether a browser-owned Page is a tear-out vessel after its staged same-origin navigation.
 * A closed Page keeps its last URL, so a vessel the target's claim retired still counts.
 * @param {import('@playwright/test').Page} page
 * @returns {Boolean}
 */
function isTearOutPage(page) {
    try {
        return new URL(page.url()).searchParams.get('popout') === 'workbench'
    } catch {
        return false
    }
}

/**
 * @summary Waits until at least `count` tear-out vessels have navigated, and returns them in birth order.
 * @param {import('@playwright/test').Page[]} pages
 * @param {Number} count
 * @returns {Promise<import('@playwright/test').Page[]>}
 */
async function waitForTearOutPages(pages, count) {
    let found = [];

    await expect.poll(() => {
        found = pages.filter(isTearOutPage);

        return found.length
    }, {
        message  : `${count} tear-out Page(s) must navigate`,
        timeout  : 15000,
        intervals: [25, 50, 100]
    }).toBeGreaterThanOrEqual(count);

    return found
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
 * One rule for every window of the group (the docking design record §2.8.6): inside a
 * window the drag is that window's tab-header proxy, outside every window it is a vessel. The direct
 * path never births one, because a claimed frame is no boundary crossing; the desktop legs do, and
 * the target's claim retires the vessel that rode the hand in. The matrix profile allows pop-ups,
 * which is the product's one-time setup.
 *
 * Headed matrix run: NEO_E2E_PORT=8120 npx playwright test dashboard/DemoBCrossWindowDragNL \
 *   -c test/playwright/playwright.config.matrix.mjs --workers=1
 */
test.describe('Dashboard Demo B — real cross-window dock drag', () => {
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

        const app        = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow'),
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
              before   = await app.getComponent(wsId, ['dockModel', 'popupDocument', 'tearOutAcquisitionAttempts']);

        expect(before.dockModel.nodes['workbench-tabs'].items).toEqual(['workbench']);
        expect(before.popupDocument.nodes['popup-tabs'].items).toEqual([]);
        expect(before.tearOutAcquisitionAttempts).toBe(0);

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
        const placement = await placeBesideSource(page, popup);

        expect(placement.fits, placement.reason ?? 'the popup must be placeable outside the source')
            .toBe(true);

        popup.on('pageerror', error => {
            let value = String(error?.stack || error?.message || error || '');

            value && value !== 'undefined' && popupErrors.push(value)
        });

        const result         = await resultPromise,
              phaseZeroTrace = await app.getDragTrace(),
              // The coordinator's OWN record of what it saw per candidate. The workspace's
              // `debug` payload is a post-hoc reconstruction and cannot report an early return.
              claimState     = await app.getDragState();

        expect(result.errors,
            `the real gesture must settle through the remote target: ${JSON.stringify(result.debug ?? null)}`
            + `\ndrag trace: ${JSON.stringify(phaseZeroTrace)}`
            + `\nclaim trace: ${JSON.stringify(claimState?.claimTrace ?? null)}`)
            .toEqual([]);
        expect(result.applied).toBe(true);
        expect(result.witness.instanceId, 'the transferred pane is the original live instance').toBe(baseline.id);
        // The pointer went from the source tab straight onto the target: a claimed frame is no
        // boundary crossing, so no vessel was born and the pane mounted once, into the target.
        expect(result.proof).toMatchObject({
            framesNotReset           : true,
            homeMountDelta           : 0,
            localDropFires           : 0,
            mountDelta               : 1,
            remoteDropOutFires       : 1,
            sameInstance             : true,
            sourceSuppressionConsumed: true,
            targetMountDelta         : 1,
            transferCommits          : 1,
            vesselBorn               : false,
            vesselMountDelta         : 0,
            vesselRetired            : true
        });
        expect(result.proof.remoteSnapshot).toMatchObject({
            engaged     : true,
            ready       : true,
            targetNodeId: 'popup-tabs',
            preview     : {itemId: 'workbench', target: {nodeId: 'popup-tabs'}},
            rendered    : {itemId: 'workbench', target: {nodeId: 'popup-tabs'}}
        });
        expect(result.proof.remoteSnapshot.embodiment).toMatchObject({
            header        : true,
            itemId        : 'workbench',
            ownsPane      : false,
            settled       : true,
            targetWindowId: (await app.getComponent(wsId, ['crossWindowTargetWindowId'])).crossWindowTargetWindowId,
            visible       : true
        });
        expect(result.proof.remoteSnapshot.indicators.candidateCount,
            'the empty root tabs target must expose its five distinct cross candidates before release').toBe(5);
        expect(result.proof.remoteSnapshot.indicators.activePreviewId,
            'the lit indicator and committed semantic preview must be the same candidate')
            .toBe(result.proof.remoteSnapshot.preview.previewId);
        expect(popupPages.filter(isTearOutPage), 'the direct path births no vessel').toHaveLength(0);

        await expect(popup.locator('.agentos-dockdemo-counter-pane'),
            'the target window must render the transferred live pane').toBeVisible({timeout: 10000});

        const after                = await app.getComponent(wsId, ['crossWindowStats', 'dockModel', 'popupDocument', 'tearOutAcquisitionAttempts']),
              counter              = await readCounter(),
              topologyCaptureProbe = await app.callMethod(wsId, 'capturePerspective', [
                  'CrossWindowProbe', {scope: 'topology'}
              ]);

        expect(topologyCaptureProbe, 'the real transferred documents must remain topology-capturable')
            .toEqual({errors: [], saved: true});

        const expectedSource = {
                  schema: 'neo.dock.zone.v1',
                  root  : 'root',
                  items : {
                      inspector: {title: 'Inspector'},
                      timeline : {title: 'Timeline'},
                      console  : {title: 'Console'}
                  },
                  nodes: {
                      root       : {type: 'edge-zone', zones: {right: {nodeId: 'side-tabs'}}},
                      'side-tabs': {
                          type: 'tabs', items: ['inspector', 'timeline', 'console'], activeItemId: 'inspector'
                      }
                  }
              },
              expectedTarget = {
                  schema: 'neo.dock.zone.v1',
                  root  : 'popup-root',
                  items : {
                      workbench: {title: 'Workbench'}
                  },
                  nodes: {
                      'popup-root': {type: 'edge-zone', zones: {center: {nodeId: 'popup-tabs'}}},
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
        expect(after.tearOutAcquisitionAttempts, 'no vessel was acquired on the direct path').toBe(0);
        expect(counter.id).toBe(baseline.id);
        expect(counter.properties.mountCount).toBe(baseline.properties.mountCount + 1);
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

    test('one gesture leaves for the desktop, hands the drag to the target, leaves again and detaches a fresh vessel', async ({page, neuralLink}) => {
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

        const app        = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow'),
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
              }, {roundTrip: true}]),
              targetPopup = await targetPromise;

        const placement = await placeBesideSource(page, targetPopup);

        expect(placement.fits, placement.reason ?? 'the target popup must be placeable outside the source')
            .toBe(true);

        // The desktop leg births the first vessel; the target's claim retires it while the drag goes on.
        let firstTearOut;

        try {
            [firstTearOut] = await waitForTearOutPages(popupPages, 1)
        } catch (error) {
            const result = await resultPromise;

            throw new Error(`${error.message}\njourney result: ${JSON.stringify(result)}`)
        }

        const result = await resultPromise;

        expect(result.errors,
            `the journey must settle detached in a fresh vessel: ${JSON.stringify(result.debug ?? result.proof ?? null)}`)
            .toEqual([]);
        expect(result.applied).toBe(true);
        expect(result.witness.instanceId).toBe(baseline.id);
        expect(result.proof).toMatchObject({
            acquisitionAttempts: {
                afterExit           : 2,
                atClaim             : 1,
                beforeGesture       : 0,
                totalGestureAttempts: 2
            },
            claim: {
                activeSlot   : false,
                paneHome     : true,
                settled      : true,
                vesselRetired: true
            },
            claimSnapshot: {
                embodiment: {header: true, ownsPane: false, settled: true, visible: true},
                engaged   : true,
                ready     : true
            },
            detached: {
                catalogRetained: true,
                itemAbsent     : true
            },
            parkReceiptUnchanged: true,
            stats               : {
                localDropFires    : 0,
                remoteDropOutFires: 0,
                transferCommits   : 0
            }
        });

        const {firstVessel, mounts, secondVessel} = result.proof;

        expect(firstVessel.windowId, 'the desktop leg acquired a vessel').toBeTruthy();
        expect(secondVessel.windowId, 'leaving the target acquired a fresh vessel').toBeTruthy();
        expect(secondVessel.windowId, 'the fresh vessel is a new generation').not.toBe(firstVessel.windowId);
        expect(secondVessel.windowName, 'the same semantic slot names both generations').toBe(firstVessel.windowName);
        expect(result.proof.detached.entry.windowId).toBe(secondVessel.windowId);
        expect(result.proof.terminalVessel.windowId).toBe(secondVessel.windowId);
        // One mount per window the pane entered: the first vessel, home on the claim, the fresh vessel.
        expect(mounts).toEqual({
            atClaim       : mounts.beforeGesture + 2,
            atFirstVessel : mounts.beforeGesture + 1,
            atSecondVessel: mounts.beforeGesture + 3,
            beforeGesture : baseline.properties.mountCount,
            terminal      : mounts.beforeGesture + 3
        });

        // Browser-realm facts, read after the gesture settled: the claim closed the first vessel, the
        // fresh one survives as the detached owner, and both came from the same semantic window name.
        await expect.poll(() => firstTearOut.isClosed(), {
            message  : 'the target\'s claim closes the vessel that rode the hand in',
            timeout  : 10000,
            intervals: [50, 100]
        }).toBe(true);

        const tearOutPages = await waitForTearOutPages(popupPages, 2),
              liveTearOuts = tearOutPages.filter(child => !child.isClosed());

        expect(tearOutPages, 'two vessels were born in one gesture').toHaveLength(2);
        expect(liveTearOuts, 'exactly one tear-out Page survives as the detached terminal owner').toHaveLength(1);

        // Same-origin acquisition opens about:blank under a per-generation browser-owned name before
        // minting its route; the vessel's 320×240 minimum extent tells its calls from the stage's popup.
        const survivingTearOut  = liveTearOuts[0],
              tearOutTargetName = await survivingTearOut.evaluate(() => globalThis.name),
              tearOutOpenCalls  = windowOpenCalls.filter(call =>
                  call.features.startsWith('height=240,') && call.features.endsWith(',width=320'));

        expect(survivingTearOut, 'the surviving vessel is the fresh generation').not.toBe(firstTearOut);
        expect(tearOutOpenCalls, 'browser-realm instrumentation observes one acquisition per desktop leg')
            .toHaveLength(2);
        expect(new Set(tearOutOpenCalls.map(call => call.target)).size, 'each generation opened under its own name').toBe(2);
        expect(tearOutOpenCalls.map(call => call.target), 'the survivor came from the second acquisition')
            .toContain(tearOutTargetName);

        const after = await app.getComponent(wsId, [
                  'crossWindowStats', 'dockModel', 'popupDocument', 'tearOutAcquisitionAttempts'
              ]),
              native = await readNativeLifecycle(app, wsId),
              finalCounters = await app.findInstances(
                  {className: 'Neo.examples.dashboard.crossWindow.CounterPane'},
                  ['id', 'mountCount', 'windowId']
              ),
              finalCounterList = Array.isArray(finalCounters) ? finalCounters : finalCounters ? [finalCounters] : [],
              finalCounter = finalCounterList[0];

        expect(finalCounterList, 'the journey never duplicates the live CounterPane').toHaveLength(1);
        await expect(survivingTearOut.locator('.agentos-dockdemo-counter-pane')).toBeVisible({timeout: 10000});
        expect(after.tearOutAcquisitionAttempts).toBe(2);
        expect(after.popupDocument).toEqual(before.popupDocument);
        expect(after.dockModel.items.workbench).toEqual(before.dockModel.items.workbench);
        expect(Object.values(after.dockModel.nodes).some(node => node.items?.includes('workbench'))).toBe(false);
        expect(native.owners.workbench.windowId).toBe(secondVessel.windowId);
        expect(after.crossWindowStats).toEqual(result.proof.stats);
        expect(finalCounter.id).toBe(baseline.id);
        expect(finalCounter.properties.mountCount).toBe(baseline.properties.mountCount + 3);
        expect(finalCounter.properties.windowId).toBe(secondVessel.windowId);
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

        const app        = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow'),
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

        // Through the desktop: the vessel born there retires on the target's claim, so Escape must
        // clear a target proxy whose pane already came home, with no vessel left anywhere.
        const popupPromise  = page.waitForEvent('popup', {timeout: 30000}),
              resultPromise = app.callMethod(wsId, 'executeCrossWindowStep', [{
                  itemId           : 'workbench',
                  sourceWorkspaceId: 'demo-b-main',
                  targetNodeId     : 'popup-tabs',
                  targetWorkspaceId: 'demo-b-popup'
              }, {cancelAtTarget: true, viaDesktop: true}]),
              popup = await popupPromise;

        popup.on('pageerror', error => {
            let value = String(error?.stack || error?.message || error || '');

            value && value !== 'undefined' && popupErrors.push(value)
        });

        const placement = await placeBesideSource(page, popup);

        expect(placement.fits, placement.reason ?? 'the popup must be placeable outside the source')
            .toBe(true);

        let firstTearOut;

        try {
            [firstTearOut] = await waitForTearOutPages(popupPages, 1)
        } catch (error) {
            const result = await resultPromise;

            throw new Error(`${error.message}\ncancel result: ${JSON.stringify(result)}`)
        }

        const result        = await resultPromise,
              after         = await app.getComponent(wsId, ['crossWindowStats', 'dockModel', 'popupDocument', 'tearOutAcquisitionAttempts']),
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
        expect(result.proof.acquisitionAttempts, 'the desktop leg acquired one vessel').toBe(1);
        expect(result.proof.firstVessel.windowId).toBeTruthy();
        expect(result.proof.claim).toMatchObject({paneHome: true, settled: true, vesselRetired: true});
        expect(result.proof.vesselAfterCancel).toEqual({nativeHandleKey: null, windowId: null, windowName: null});
        expect(result.proof.remoteSnapshot).toMatchObject({
            embodiment: {header: true, ownsPane: false, settled: true, visible: true},
            engaged   : true,
            ready     : true
        });
        expect(result.proof.cancellation).toEqual({
            escapeDispatched : true,
            releaseDispatched: true,
            settled          : true
        });
        expect(result.proof.cleanup).toEqual({
            activeTargetZone       : null,
            activeCandidateId      : null,
            candidateSetSchema     : null,
            dragDataPresent        : false,
            dragEndActive          : false,
            dragPlaceholderPresent : false,
            dragProxyPresent       : false,
            proxyEmbodimentPresent : false,
            vesselEmbodimentPresent: false,
            sourcePaneRestored     : true,
            draggingClass          : false,
            nativeCandidateCount   : 0,
            semanticPreviewId      : null,
            renderedPreviewId      : null,
            ready                  : true
        });
        expect(result.proof.stats).toEqual({
            localDropFires    : 0,
            remoteDropOutFires: 0,
            transferCommits   : 0
        });

        await expect.poll(() => firstTearOut.isClosed(), {
            message  : 'the vessel that rode the hand into the claim is closed',
            timeout  : 10000,
            intervals: [50, 100]
        }).toBe(true);
        expect(popupPages.filter(isTearOutPage), 'exactly one vessel was born').toHaveLength(1);

        expect(after.dockModel).toEqual(before.dockModel);
        expect(after.popupDocument).toEqual(before.popupDocument);
        expect(after.crossWindowStats).toEqual(result.proof.stats);
        expect(after.tearOutAcquisitionAttempts).toBe(1);
        expect(finalCounter.id).toBe(baseline.id);
        // The vessel mounted the pane once; the claim brought it home once; Escape moved nothing.
        expect(finalCounter.properties.mountCount).toBe(baseline.properties.mountCount + 2);
        expect(finalCounter.properties.windowId).toBe(baseline.properties.windowId);
        expect(trace?.events.at(-1)?.t).toBe('cancel');
        expect(runtimeErrors).toEqual([]);
        expect(popupErrors).toEqual([]);
        expect(pageErrors).toEqual([]);

        await popup.close()
    })
});
