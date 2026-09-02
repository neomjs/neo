import {test, expect}    from '../../fixtures.mjs';
import {demoBTourScript} from '../../../../examples/dashboard/crossWindow/demoBPerspectives.mjs';

/**
 * Success sentinel for the popup-hosting poll below. The poll returns either this string or the
 * executor's own cross-window receipt, so the failure diff carries the refused precondition.
 * @type {String}
 */
const HOSTED = 'the popup hosts the live workbench pane';

/**
 * @summary Moves only the real headless-Chrome popup vessel outside the source viewport.
 * Product browsers honor the app-owned placement request; CDP supplies the missing window-manager
 * behavior in headless Chrome without bypassing Neo's pointer, preview, or commit path.
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
 * @summary Whitebox E2E for Demo B's full two-window perspective story.
 *
 * One native Tour click must open a durable target popup. During the paced run, worker truth must
 * additionally expose the competing pointer-follow tear-out vessel under a distinct
 * window identity while the same live CounterPane remains in the target. The tour then captures
 * the two worker-owned workspace documents, reattaches, and reconciles
 * that saved topology into one live window without opening another popup, render the exact
 * no-live-window remainder, and finish on Focus with the original counter still advancing.
 * The same page repeats the run without viewer pauses so the executable screenplay proves
 * deterministic replay and host-owned projection settledness independently of demo pacing.
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test dashboard/DemoBPerspectivesNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Dashboard Demo B — topology perspective + shared-heap popup journey', () => {
    test.setTimeout(150000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 760}
    });

    test('paced demo proves distinct target + tear-out authorities; replay stays deterministic and preserves the CounterPane instance', async ({page, neuralLink}) => {
        const pageErrors    = [],
              runtimeErrors = [];

        await page.context().exposeFunction('__recordDemoBRuntimeError', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => {
                globalThis.__recordDemoBRuntimeError({
                    column : event.colno,
                    line   : event.lineno,
                    message: event.message,
                    source : event.filename,
                    type   : 'error'
                })
            });
            globalThis.addEventListener('unhandledrejection', event => {
                globalThis.__recordDemoBRuntimeError({
                    reason: String(event.reason?.stack || event.reason?.message || event.reason),
                    type  : 'unhandledrejection'
                })
            })
        });

        page.on('pageerror', error => {
            let value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });
        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.waitForSelector('.agentos-dockdemo-tour-play', {timeout: 30000});

        const app        = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow'),
              workspaces = await app.findInstances({className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id,
              totalBeats = demoBTourScript.scenes.flatMap(scene => scene.steps).length;

        expect(wsId, 'the DemoBWorkspace must exist in the App Worker').toBeTruthy();

        const runnerId = (await app.getComponent(wsId, ['tourRunner.id']))['tourRunner.id'];

        expect(runnerId, 'the workspace must expose its TourRunner through worker truth').toBeTruthy();

        const readCounter = async () => {
            const counters = await app.findInstances(
                {className: 'Neo.examples.dashboard.crossWindow.CounterPane'},
                ['frames', 'id', 'mountCount', 'windowId']
            );

            return (Array.isArray(counters) ? counters[0] : counters)
        };

        await expect.poll(async () => !!(await readCounter())?.id, {
            message  : 'the worker must own one CounterPane before the tour',
            timeout  : 10000,
            intervals: [100]
        }).toBe(true);

        const baseline = await readCounter();

        expect(baseline.id).toBeTruthy();

        const logs = [];

        for (let run = 0; run < 2; run++) {
            const runBaseline  = await readCounter(),
                  popupPromise = page.waitForEvent('popup', {timeout: 30000});

            await app.setProperties(runnerId, {mode: run === 0 ? 'demo' : 'spec'});
            await page.locator('.agentos-dockdemo-tour-play').click();

            const popup       = await popupPromise,
                  popupErrors = [];

            await placePopupOutsideSource(page, popup);

            popup.on('pageerror', error => {
                let value = error == null ? '' : String(error.stack || error.message || error);
                value && value !== 'undefined' && popupErrors.push(value)
            });

            let inPopup = runBaseline;

            // Demo pacing leaves the transferred pane onscreen long enough for a human-facing
            // visual witness. Spec mode deliberately skips every pause, so transfer + reattach can
            // finish before Playwright samples the transient vessel; its structured receipt and
            // final document/log assertions below are the zero-pause correctness witness.
            if (run === 0) {
                // A bare visibility wait reports "element(s) not found" and stops there, while the
                // reason sits one call away: a cross-window step the executor refuses records its
                // own error string on the TourRunner log. Polling the receipt beside the pane makes
                // a failure name the refused precondition instead of only its symptom — the same
                // reason `DemoBWorkspace#describeCrossWindowChromeMismatch` reports every term
                // separately rather than collapsing a conjunction into one string.
                await expect.poll(async () => {
                    if (await popup.locator('.agentos-dockdemo-counter-pane').isVisible()) {
                        return HOSTED
                    }

                    let log         = (await app.getComponent(wsId, ['tourRunner.log']))['tourRunner.log'] || [],
                        crossWindow = log.filter(entry => entry.type === 'cross-window');

                    return crossWindow.length > 0
                        ? `cross-window receipt: ${JSON.stringify(crossWindow)}`
                        : 'the pane is not hosted, and the tour has not reached its cross-window step'
                }, {
                    message  : 'the real popup hosts the live workbench pane',
                    timeout  : 10000,
                    intervals: [250]
                }).toBe(HOSTED);

                await expect.poll(readCounter, {
                    message  : 'worker truth must show the original instance mounted once into the popup',
                    timeout  : 10000,
                    intervals: [100]
                }).toMatchObject({
                    id        : baseline.id,
                    properties: {
                        frames    : expect.any(Number),
                        mountCount: runBaseline.properties.mountCount + 1
                    }
                });

                inPopup = await readCounter();

                expect(inPopup.properties.frames).toBeGreaterThanOrEqual(runBaseline.properties.frames);
                expect(inPopup.properties.windowId).not.toBe(runBaseline.properties.windowId);

                await expect.poll(async () => {
                    const state = await app.getComponent(wsId, [
                              'crossWindowTargetWindowId',
                              'tearOutConnects',
                              'tearOutPanes'
                          ]),
                          counter        = await readCounter(),
                          targetWindowId = state.crossWindowTargetWindowId,
                          tearOutWindowId = state.tearOutConnects?.workbench?.windowId
                              ?? state.tearOutPanes?.workbench?.windowId;

                    return Boolean(targetWindowId
                        && tearOutWindowId
                        && counter?.properties?.windowId === targetWindowId
                        && targetWindowId !== tearOutWindowId)
                }, {
                    message  : 'the pane must stay target-owned while the competing G1 vessel keeps a distinct identity',
                    timeout  : 10000,
                    intervals: [100]
                }).toBe(true)
            }

            await expect.poll(async () => {
                const state = await app.getComponent(wsId, ['tourRunner.running', 'tourRunner.log']);
                return {
                    length : state['tourRunner.log']?.length ?? 0,
                    running: state['tourRunner.running']
                }
            }, {
                message  : `Demo B run ${run + 1} must complete every executable beat`,
                timeout  : 60000,
                intervals: [100, 250]
            }).toEqual({length: totalBeats, running: false});

            // Runner settlement does not claim hosting-surface projection settlement. Await the
            // worker-owned queue explicitly so a first-run projection defect cannot masquerade as
            // a second-run popup timeout.
            await app.callMethod(wsId, 'awaitProjectionIdle');
            await expect(page.locator('.agentos-dockdemo-counter-pane'), 'Focus is visibly projected before replay')
                .toBeVisible();

            const sourceTabs = await app.findInstances(
                    {dockNodeId: 'workbench-tabs'},
                    ['id', 'tabBarId']
                ),
                sourceTab = Array.isArray(sourceTabs) ? sourceTabs[0] : sourceTabs,
                sourceButtons = await app.findInstances(
                    {parentId: sourceTab.properties.tabBarId},
                    ['hidden', 'hideMode', 'id', 'mounted', 'pressed', 'text', 'vdom.removeDom', 'windowId']
                ),
                sourceButton = Array.isArray(sourceButtons) ? sourceButtons[0] : sourceButtons,
                sourceBarConsistency = await app.verifyComponentConsistency(sourceTab.properties.tabBarId),
                sourceBarMismatches = sourceBarConsistency?.mismatches
                    || sourceBarConsistency?.result?.mismatches
                    || [];

            expect(sourceButton?.properties,
                `Focus header state before replay: ${JSON.stringify(sourceButton)}`).toMatchObject({
                hidden : false,
                mounted: true,
                pressed: true
            });
            expect(sourceBarMismatches,
                'Focus restore must commit the re-created tab header into worker, VDOM, and DOM truth')
                .toEqual([]);

            await expect.poll(() => popup.isClosed(), {
                message  : 'the scripted reattach closes the popup before topology restore',
                timeout  : 10000,
                intervals: [100]
            }).toBe(true);

            await expect.poll(async () => (await app.getComponent(wsId, ['crossWindowTargetWindowId']))
                .crossWindowTargetWindowId, {
                message  : 'worker disconnect cleanup must retire the closed target before replay',
                timeout  : 10000,
                intervals: [100]
            }).toBeNull();

            const state = await app.getComponent(wsId, [
                      'detachedPanes',
                      'dockModel',
                      'perspectiveStore.collection',
                      'restoreReport',
                      'tourRunner.log'
                  ]),
                  final = await readCounter();

            const detached = state['perspectiveStore.collection']?.layouts?.['demo-b-detached'];

            expect(state.restoreReport).not.toBeNull();
            expect(detached?.captureScope).toBe('topology');
            expect(detached?.windowDocuments).toHaveLength(1);
            expect(detached.windowDocuments[0].items.workbench).toEqual({
                componentRef: 'Workbench',
                kind        : 'panel',
                title       : 'Workbench'
            });
            expect(detached.windowDocuments[0].nodes['popup-tabs'].items).toEqual(['workbench']);
            expect(state.restoreReport.noWindowSpawned).toBe(true);
            expect(state.restoreReport.unrestored).toEqual([
                {capturedIndex: 1, itemId: 'workbench', reason: 'no-live-window'}
            ]);
            expect(state.restoreReport.displaced).toEqual([{itemId: 'workbench', liveIndex: 0}]);
            expect(state.dockModel.items.workbench.title).toBe('Workbench');
            expect(state['tourRunner.log'].filter(entry => entry.type === 'cross-window')).toEqual([{
                applied: true,
                errors : [],
                sceneId: 's3',
                step   : {
                    itemId           : 'workbench',
                    sourceWorkspaceId: 'demo-b-main',
                    targetWorkspaceId: 'demo-b-popup',
                    targetNodeId     : 'popup-tabs'
                },
                stepIndex: 2,
                type     : 'cross-window'
            }]);
            expect(final.id, 'Focus restore must re-adopt the same live CounterPane').toBe(baseline.id);
            expect(final.properties.frames).toBeGreaterThanOrEqual(inPopup.properties.frames);
            expect(final.properties.windowId).toBe(runBaseline.properties.windowId);
            expect(popupErrors).toEqual([]);

            await expect(page.locator('.agentos-dockdemo-restore-report'))
                .toContainText('no window spawned');

            logs.push(JSON.stringify(state['tourRunner.log']))
        }

        expect(logs[1], 'the no-pause spec run must produce the same byte-identical operation log').toBe(logs[0]);
        expect(runtimeErrors).toEqual([]);
        expect(pageErrors).toEqual([])
    })
});
