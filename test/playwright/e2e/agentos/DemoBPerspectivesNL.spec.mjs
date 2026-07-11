import {test, expect}    from '../../fixtures.mjs';
import {demoBTourScript} from '../../../../apps/agentos/tour/demoBPerspectives.mjs';

/**
 * @summary Whitebox E2E for Demo B's full two-window perspective story.
 *
 * One native Tour click must open exactly one real popup, move the same live CounterPane
 * instance into it, capture the two worker-owned workspace documents, reattach, reconcile
 * that saved topology into one live window without opening another popup, render the exact
 * no-live-window remainder, and finish on Focus with the original counter still advancing.
 * The same page repeats the run so the executable screenplay proves deterministic replay.
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test agentos/DemoBPerspectivesNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Demo B — topology perspective + shared-heap popup journey', () => {
    test.setTimeout(150000);

    test('two deterministic runs each open one popup; topology restore opens none and preserves the CounterPane instance', async ({page, neuralLink}) => {
        const pageErrors    = [],
              runtimeErrors = [];
        let popupCount      = 0;

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
        page.on('popup', () => popupCount++);
        await page.goto('/apps/agentos/childapps/dockdemo/index.html?demo=b');
        await page.waitForSelector('.agentos-dockdemo-tour-play', {timeout: 30000});

        const app        = await neuralLink.connectToApp('AgentOSDockDemo'),
              workspaces = await app.findInstances({className: 'AgentOS.childapps.dockdemo.view.DemoBWorkspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id,
              totalBeats = demoBTourScript.scenes.flatMap(scene => scene.steps).length;

        expect(wsId, 'the DemoBWorkspace must exist in the App Worker').toBeTruthy();

        const readCounter = async () => {
            const counters = await app.findInstances(
                {className: 'AgentOS.childapps.dockdemo.view.CounterPane'},
                ['id', 'frames']
            );

            return (Array.isArray(counters) ? counters[0] : counters)
        };

        await expect.poll(async () => !!(await readCounter())?.id, {
            message: 'the worker must own one CounterPane before the tour',
            timeout: 10000,
            intervals: [100]
        }).toBe(true);

        const baseline = await readCounter();

        expect(baseline.id).toBeTruthy();

        const logs = [];

        for (let run = 0; run < 2; run++) {
            const popupsBefore = popupCount,
                  popupPromise = page.waitForEvent('popup', {timeout: 30000});

            await page.locator('.agentos-dockdemo-tour-play').click();

            const popup      = await popupPromise,
                  popupErrors = [];

            popup.on('pageerror', error => {
                let value = error == null ? '' : String(error.stack || error.message || error);
                value && value !== 'undefined' && popupErrors.push(value)
            });
            await expect(popup.locator('.agentos-dockdemo-counter-pane'), 'the real popup hosts the live workbench pane')
                .toBeVisible({timeout: 10000});

            const inPopup = await readCounter();

            expect(inPopup.id, 'the popup must hold the original CounterPane instance').toBe(baseline.id);

            await expect.poll(async () => {
                const state = await app.getComponent(wsId, ['tourRunner.running', 'tourRunner.log']);
                return {
                    length : state['tourRunner.log']?.length ?? 0,
                    running: state['tourRunner.running']
                }
            }, {
                message: `Demo B run ${run + 1} must complete every executable beat`,
                timeout: 60000,
                intervals: [100, 250]
            }).toEqual({length: totalBeats, running: false});

            await expect.poll(() => popup.isClosed(), {
                message: 'the scripted reattach closes the popup before topology restore',
                timeout: 10000,
                intervals: [100]
            }).toBe(true);

            const state = await app.getComponent(wsId, ['dockModel', 'restoreReport', 'tourRunner.log']),
                  final = await readCounter();

            expect(state.restoreReport.noWindowSpawned).toBe(true);
            expect(state.restoreReport.unrestored).toEqual([
                {capturedIndex: 1, itemId: 'workbench', reason: 'no-live-window'}
            ]);
            expect(state.restoreReport.displaced).toEqual([{itemId: 'workbench', liveIndex: 0}]);
            expect(state.dockModel.items.workbench.title).toBe('Workbench');
            expect(final.id, 'Focus restore must re-adopt the same live CounterPane').toBe(baseline.id);
            expect(final.properties.frames).toBeGreaterThan(baseline.properties.frames);
            expect(popupCount - popupsBefore, 'S3 opens one popup; S4 topology restore opens none').toBe(1);
            expect(popupErrors).toEqual([]);

            await expect(page.locator('.agentos-dockdemo-restore-report'))
                .toContainText('no window spawned');

            logs.push(state['tourRunner.log'])
        }

        expect(logs[1], 'the second run must produce the same timestamp-free operation log').toEqual(logs[0]);
        expect(runtimeErrors).toEqual([]);
        expect(pageErrors).toEqual([])
    })
});
