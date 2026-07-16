import {test, expect} from '@playwright/test';

/**
 * @summary The sensor dispatch-target discrimination witnesses (real DOM, real bubbling).
 *
 * `trigger()` on `Neo.main.draggable.sensor.Base` is the single seam every sensor event
 * (drag:start / drag:move / drag:end) rides to the document-level drag owner. A gesture's own
 * side effects can remove or replace the SOURCE node mid-drag (sort visuals lift the item, an
 * overflow plugin re-collapses the toolbar, a live re-render swaps nodes) — and an event
 * dispatched on a detached node bubbles nowhere, silently starving the move stream AND the
 * release. These witnesses discriminate WHICH dispatch branch executes: connected source → the
 * element carries the event (bubbling reaches document); detached source → the document carries
 * it directly. They live in the e2e layer because the contract under test IS real DOM event
 * semantics — the Node-side unit environment has no document, and a hand-rolled bubbling
 * polyfill would witness itself, not the sensor.
 *
 * Run: NEO_E2E_PORT=8096 npx playwright test DragSensorDispatch -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Neo.main.draggable.sensor.Base — dispatch-target discrimination', () => {
    /**
     * Boots a light served page (main-thread Neo present) and runs one trigger scenario in-page.
     * @param {Object} page
     * @param {Boolean} connected append the source element before triggering
     * @param {Boolean} removeMidGesture remove the element between two triggers
     * @returns {Promise<Object>} the in-page probe report
     */
    async function runScenario(page, {connected, removeMidGesture = false}) {
        await page.goto('/examples/dashboard/dock/');
        await page.waitForFunction(() => globalThis.Neo?.setupClass, null, {timeout: 30000});

        return page.evaluate(async ({connected, removeMidGesture}) => {
            const {default: SensorBase} = await import('/src/main/draggable/sensor/Base.mjs');

            const sensor   = Neo.create(SensorBase, {}),
                  element  = document.createElement('div'),
                  received = [];

            const handler = event => received.push({
                detailStep: event.detail?.step ?? null,
                targetKind: event.target === document ? 'document' : (event.target === element ? 'element' : 'other')
            });

            document.addEventListener('drag:probe', handler, true);

            connected && document.body.appendChild(element);

            sensor.trigger(element, {step: 1, type: 'drag:probe'});

            if (removeMidGesture) {
                element.remove();
                sensor.trigger(element, {step: 2, type: 'drag:probe'});
            }

            document.removeEventListener('drag:probe', handler, true);
            element.remove();
            sensor.destroy?.();

            return {received, wasConnected: connected}
        }, {connected, removeMidGesture})
    }

    test('connected source: the element carries the dispatch — bubbling reaches the document owner', async ({page}) => {
        const report = await runScenario(page, {connected: true});

        expect(report.received).toHaveLength(1);
        expect(report.received[0].detailStep).toBe(1);
        expect(report.received[0].targetKind, 'the CONNECTED branch dispatched on the element itself').toBe('element')
    });

    test('detached source: the document carries the dispatch — the event survives node loss', async ({page}) => {
        const report = await runScenario(page, {connected: false});

        expect(report.received, 'a detached dispatch target must not swallow the event').toHaveLength(1);
        expect(report.received[0].detailStep).toBe(1);
        expect(report.received[0].targetKind, 'the DETACHED branch dispatched on document directly').toBe('document')
    });

    test('mid-gesture removal: the same element flips branches without losing an event', async ({page}) => {
        const report = await runScenario(page, {connected: true, removeMidGesture: true});

        expect(report.received.map(entry => entry.detailStep), 'both frames delivered across the branch flip').toEqual([1, 2]);
        expect(report.received[0].targetKind).toBe('element');
        expect(report.received[1].targetKind).toBe('document')
    })
});
