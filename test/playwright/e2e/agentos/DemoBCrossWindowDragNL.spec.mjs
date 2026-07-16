import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Headless-Chrome physical-window adapter. Product browsers honor the app-owned
 * placement request; headless Chrome ignores it, so CDP moves only the real top-level vessel.
 * Dock semantics, pointer events, previews and commits remain entirely Neo-owned.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Page} popup
 */
async function placePopupOutsideSource(page, popup) {
    const popupCdp    = await page.context().newCDPSession(popup),
          popupWindow = await popupCdp.send('Browser.getWindowForTarget'),
          sourceStage = await page.evaluate(() => ({
              left : globalThis.screenX,
              top  : globalThis.screenY,
              width: globalThis.innerWidth
          }));

    await popupCdp.send('Browser.setWindowBounds', {
        bounds: {
            height     : popupWindow.bounds.height,
            left       : sourceStage.left + sourceStage.width + 40,
            top        : sourceStage.top,
            width      : popupWindow.bounds.width,
            windowState: 'normal'
        },
        windowId: popupWindow.windowId
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
 * Run: NEO_E2E_PORT=8120 npx playwright test agentos/DemoBCrossWindowDragNL \
 *   -c test/playwright/playwright.config.e2e.mjs --workers=1
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
              runtimeErrors = [];

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

        await page.goto('/apps/agentos/childapps/dockdemo/index.html?demo=b');
        await page.waitForSelector('.agentos-dockdemo-counter-pane', {timeout: 30000});

        const app        = await neuralLink.connectToApp('AgentOSDockDemo'),
              workspaces = await app.findInstances(
                  {className: 'AgentOS.childapps.dockdemo.view.DemoBWorkspace'},
                  ['id']
              ),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the App Worker must own one DemoBWorkspace').toBeTruthy();

        const readCounter = async () => {
            const counters = await app.findInstances(
                {className: 'AgentOS.childapps.dockdemo.view.CounterPane'},
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

        popup.on('pageerror', error => {
            let value = String(error?.stack || error?.message || error || '');

            value && value !== 'undefined' && popupErrors.push(value)
        });

        const result         = await resultPromise,
              phaseZeroTrace = await app.getDragTrace();

        expect(result.errors, 'the real gesture must settle through the remote target').toEqual([]);
        expect(result.applied).toBe(true);
        expect(result.witness.instanceId, 'the transferred pane is the original live instance').toBe(baseline.id);
        expect(result.proof).toMatchObject({
            framesNotReset           : true,
            localDropFires           : 0,
            mountDelta               : 1,
            remoteDropOutFires       : 1,
            sameInstance             : true,
            sourceSuppressionConsumed: true,
            transferCommits          : 1
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

    test('Escape after remote preview clears every gesture surface and mutates neither document', async ({page, neuralLink}) => {
        const pageErrors    = [],
              popupErrors   = [],
              runtimeErrors = [];

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

        await page.goto('/apps/agentos/childapps/dockdemo/index.html?demo=b');
        await page.waitForSelector('.agentos-dockdemo-counter-pane', {timeout: 30000});

        const app        = await neuralLink.connectToApp('AgentOSDockDemo'),
              workspaces = await app.findInstances(
                  {className: 'AgentOS.childapps.dockdemo.view.DemoBWorkspace'},
                  ['id']
              ),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id,
              counters   = await app.findInstances(
                  {className: 'AgentOS.childapps.dockdemo.view.CounterPane'},
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

        const result        = await resultPromise,
              after         = await app.getComponent(wsId, ['crossWindowStats', 'dockModel', 'popupDocument']),
              finalCounters = await app.findInstances(
                  {className: 'AgentOS.childapps.dockdemo.view.CounterPane'},
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
        expect(finalCounter.properties.mountCount).toBe(baseline.properties.mountCount);
        expect(finalCounter.properties.windowId).toBe(baseline.properties.windowId);
        expect(trace?.events.at(-1)?.t).toBe('cancel');
        expect(runtimeErrors).toEqual([]);
        expect(popupErrors).toEqual([]);
        expect(pageErrors).toEqual([]);

        await popup.close()
    })
});
