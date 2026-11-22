import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/data/pipeline`: one data pipeline run on the data worker and on the app worker. The page is read
 * as a visitor reads it. It opens with a run on the data worker; a run on the app worker follows. A stage's duration
 * stands under the worker that the pipeline's telemetry names for it, so a filled column proves where the run was.
 * What a run cost the app is read twice: from the heartbeat the app reports, and from the pulse, whose stillness
 * the page's own animation frames see.
 */
const
    EXAMPLE = '/examples/data/pipeline/index.html',
    STAGES  = ['Request hook', 'Connection', 'Response hook', 'Post-parse hook', 'Normalizer'],
    // The worker the example's view lives in, found by what it holds: its address differs between the environments
    appWorker = async page => {
        for (const worker of page.workers()) {
            if (await worker.evaluate(() => typeof Neo !== 'undefined' && !!Neo.examples?.data?.pipeline?.MainContainer).catch(() => false)) {
                return worker
            }
        }

        throw new Error('no worker holds the example')
    };

test.describe('examples/data/pipeline — one pipeline on either worker, every stage on the page', () => {
    test('the run on the app worker stops the app, the runs on the data worker do not', async ({baseURL, page}) => {
        const errors = [], foreign = [];

        page.on('console',   message => message.type() === 'error' && !message.location().url.endsWith('/favicon.ico') && errors.push(message.text()));
        page.on('pageerror', error   => errors.push(String(error)));
        page.on('request',   request => !/^(blob:|data:)/.test(request.url()) && !request.url().startsWith(baseURL) && foreign.push(request.url()));

        await page.goto(EXAMPLE);

        const
            runApp    = page.getByRole('button', {name: 'Run on the app worker'}),
            runData   = page.getByRole('button', {name: 'Run on the data worker'}),
            stages    = page.locator('.neo-examples-data-pipeline-stages .neo-list-item'),
            rows      = page.locator('.neo-examples-data-pipeline-report tbody tr'),
            beat      = mode => page.locator('.neo-examples-data-pipeline-heartbeat', {hasText: `workerExecution: '${mode}'`}),
            paused    = async mode => Number(await beat(mode).getAttribute('data-paused')),
            durations = mode => page.locator(`.neo-examples-data-pipeline-stage-run:has(.neo-ran-on-${mode}) .neo-examples-data-pipeline-stage-duration`),
            duration  = async (mode, index) => parseFloat(await durations(mode).nth(index).textContent());

        await expect(beat('data'), 'the page opens with a run on the data worker').toHaveAttribute('data-run', '1', {timeout: 30000});
        await expect(runApp, 'the buttons are free').toBeEnabled();
        await expect(page.locator('.neo-viewport'), 'the example opens dark').toHaveClass(/neo-theme-neo-dark/);
        await expect(page.locator('.neo-examples-data-pipeline-stage-name')).toHaveText(STAGES);
        await expect(rows, 'the report is there before any click').toHaveCount(8);
        await expect(page.locator('.neo-examples-data-pipeline-legend'), 'the legend names the gap the code marks').toContainText('Red marks every gap of 20 ms or more between two beats');
        await expect(page.locator('.neo-examples-data-pipeline-error'), 'no run has failed').toHaveCount(0);

        // The sample names its worker: the first run's times stand in the Data Worker's column, the other is empty
        await expect(durations('app')).toHaveText(STAGES.map(() => '–'));
        expect(await duration('data', 1), 'the connection took time in the Data Worker').toBeGreaterThan(0);
        expect(await duration('data', 3), 'the hook that shapes the orders took time, which the telemetry reports').toBeGreaterThan(0);
        expect(await beat('app').getAttribute('data-run'), 'nothing ran on the app worker yet').toBeNull();

        const pausedOnLoad = await paused('data');

        // The pulse as the page's own frames see it: how long its dot holds one position
        await page.evaluate(() => {
            const dot = document.querySelector('.neo-examples-data-pipeline-pulse-dot');

            window.pulseStill = {left: dot.style.left, max: 0, since: performance.now()};

            const tick = now => {
                const state = window.pulseStill;

                if (dot.style.left !== state.left) {
                    state.left  = dot.style.left;
                    state.since = now
                } else {
                    state.max = Math.max(state.max, now - state.since)
                }

                requestAnimationFrame(tick)
            };

            requestAnimationFrame(tick)
        });

        await runApp.click();
        await expect(beat('app'), 'the run on the app worker reports what it cost the app').toHaveAttribute('data-run', '2', {timeout: 30000});

        expect(await duration('app', 1), 'the connection took time in the App Worker').toBeGreaterThan(0);
        expect(await duration('app', 3), 'so did the hook that shapes the orders').toBeGreaterThan(0);
        await expect(stages.nth(3)).toContainText(/turned [\d,]+ orders into 8 report rows/);

        const pausedOnApp = await paused('app');

        // Parsing and shaping the payload is far more than 40 ms of work on any machine that runs this
        expect(pausedOnApp, 'parsing and shaping the orders in the App Worker stopped the app').toBeGreaterThanOrEqual(40);
        expect(await page.evaluate(() => window.pulseStill.max), 'and the page saw the pulse stand still').toBeGreaterThanOrEqual(40);
        // A loaded runner may delay a beat, so the runs are compared instead of asking for no pause at all
        expect(pausedOnLoad, 'the same work in the Data Worker cost the app less than half of that').toBeLessThan(pausedOnApp / 2);

        await runData.click();
        await expect(beat('data'), 'a second run on the data worker').toHaveAttribute('data-run', '3', {timeout: 30000});

        expect(await paused('data'), 'and again less than half').toBeLessThan(pausedOnApp / 2);
        expect(await duration('app', 3), 'the app worker keeps its last times beside the new ones').toBeGreaterThan(0);

        await expect(rows, 'the report has a row per country').toHaveCount(8);
        await expect(rows.first(), 'the strongest market leads').toContainText('US');

        expect(foreign, 'the example runs from the repository alone').toEqual([]);
        expect(errors).toEqual([])
    });

    test('a run that does not finish gives the page back, and only a finished run counts', async ({page}) => {
        const uncaught = [];

        // A fetch that fails is logged by the browser itself; what must not appear is an error nobody caught
        page.on('console',   message => message.type() === 'error' && /Uncaught/.test(message.text()) && uncaught.push(message.text()));
        page.on('pageerror', error   => uncaught.push(String(error)));

        await page.goto(EXAMPLE);

        const
            runApp = page.getByRole('button', {name: 'Run on the app worker'}),
            beat   = mode => page.locator('.neo-examples-data-pipeline-heartbeat', {hasText: `workerExecution: '${mode}'`}),
            notice = page.locator('.neo-examples-data-pipeline-error');

        await expect(beat('data')).toHaveAttribute('data-run', '1', {timeout: 30000});
        await expect(runApp).toBeEnabled();

        const
            worker = await appWorker(page),
            inView = fn => worker.evaluate(`(${fn})(Neo.manager.Component.items.find(item => item.className === 'Neo.examples.data.pipeline.MainContainer'))`);

        // A load that throws: the payload's address answers no more
        await inView(view => {view.realUrl = view.payloadUrl; view.payloadUrl = `${view.payloadUrl}-gone`});
        await runApp.click();

        await expect(notice, 'the page says that the run did not finish').toContainText('The run on the app worker did not finish');
        await expect(runApp, 'and gives its buttons back').toBeEnabled();
        expect(await beat('app').getAttribute('data-run'), 'a failed run is no run').toBeNull();
        expect(await inView(view => view.heartbeat), 'the heartbeat of the failed run has stopped').toBeNull();

        // A load that resolves with nothing: it must not pass for a run, nor show the sample of the run before it
        await inView(view => {
            const {store} = view.getReference('report'), {load} = store;

            view.payloadUrl = view.realUrl;
            store.load      = async () => {store.load = load; return null}
        });
        await runApp.click();

        await expect(notice).toContainText('its load brought no report');
        await expect(runApp).toBeEnabled();
        expect(await beat('app').getAttribute('data-run'), 'a load without a report is no run either').toBeNull();
        await expect(beat('data'), 'the run before it stays on the page as it was').toHaveAttribute('data-run', '1');

        // A store that fails after its pipeline has finished: the pipeline has published a fulfilled sample by then
        await inView(view => {
            const {store} = view.getReference('report'), {load} = store;

            store.load = async function(...args) {
                store.load = load;
                await load.apply(store, args);
                throw new Error('the store failed after the pipeline')
            }
        });
        await runApp.click();

        await expect(notice).toContainText('the store failed after the pipeline');
        await expect(runApp).toBeEnabled();
        expect(await beat('app').getAttribute('data-run'), 'an attempt whose store failed is no run').toBeNull();

        // A run that finishes on the other worker draws both columns: the failed attempt's sample is not among them
        await page.getByRole('button', {name: 'Run on the data worker'}).click();

        await expect(beat('data')).toHaveAttribute('data-run', '2', {timeout: 30000});
        await expect(page.locator('.neo-examples-data-pipeline-stage-run:has(.neo-ran-on-app) .neo-examples-data-pipeline-stage-duration'),
            'the failed attempt left no times in the app worker\'s column').toHaveText(STAGES.map(() => '–'));

        // The retry: the third run the page finishes, and the line about the failure is gone
        await runApp.click();

        await expect(beat('app')).toHaveAttribute('data-run', '3', {timeout: 30000});
        await expect(notice).toHaveCount(0);
        expect(uncaught).toEqual([])
    });

    test('a gap between two beats is a pause from 20 ms on, and its length is the gap', async ({page}) => {
        await page.goto(EXAMPLE);
        await expect(page.getByRole('button', {name: 'Run on the app worker'})).toBeEnabled({timeout: 30000});

        const
            worker = await appWorker(page),
            read   = beats => worker.evaluate(beats => Neo.examples.data.pipeline.MainContainer.readHeartbeat(beats), beats);

        expect(await read([0, 5, 24.5, 30]), 'a gap just under the threshold is no pause').toEqual({duration: 30, paused: 0, pauses: []});
        expect(await read([0, 5, 25, 30]),   'a gap of exactly 20 ms is one').toEqual({duration: 30, paused: 20, pauses: [{duration: 20, start: 5}]});
        expect(await read([0, 5, 105, 110, 400]), 'pauses add up').toEqual({duration: 400, paused: 390, pauses: [{duration: 100, start: 5}, {duration: 290, start: 110}]})
    });

    test('the example opens in Neo Light when the address names it', async ({page}) => {
        await page.goto(`${EXAMPLE}?theme=neo-theme-neo-light`);

        await expect(page.locator('.neo-examples-data-pipeline-heartbeat', {hasText: `workerExecution: 'data'`})).toHaveAttribute('data-run', '1', {timeout: 30000});
        await expect(page.locator('.neo-viewport')).toHaveClass(/neo-theme-neo-light/)
    });
});
