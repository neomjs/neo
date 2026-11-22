import Button             from '../../../src/button/Base.mjs';
import Component          from '../../../src/component/Base.mjs';
import Container          from '../../../src/container/Base.mjs';
import HeartbeatRow       from './HeartbeatRow.mjs';
import Report             from './Report.mjs';
import ReportModel        from './ReportModel.mjs';
import StageList          from './StageList.mjs';
import Table              from '../../../src/table/Container.mjs';
import ThemeSwitcher      from '../../../src/button/ThemeSwitcher.mjs';
import Viewport           from '../../../src/container/Viewport.mjs';
import {createOrdersBlob} from './Orders.mjs';
// The stages a pipeline names by class when it runs in this worker
import '../../../src/data/connection/Fetch.mjs';
import '../../../src/data/normalizer/Base.mjs';

const
    /** How far apart the app's heartbeats are, in milliseconds. */
    BEAT  = 5,
    /** A gap between two beats counts as a pause, and gets its mark in the bar, from this many milliseconds on. */
    PAUSE = 20,
    /** How long the heartbeat goes on after a run, in milliseconds, so that a bar ends on a living app. */
    TAIL  = 60;

/**
 * @summary One data pipeline, run on the data worker or on the app worker, with every stage on the page.
 *
 * The app generates a payload of fictional orders as one JSON document. A pipeline reads it, and the example's own
 * interceptor turns it into a report with one row per country. The page opens with a run on the data worker, and
 * two buttons run the same pipeline again, configured the same except for `workerExecution`. Each stage shows how
 * long it took on each worker, read from the pipeline's `telemetry` event, which names the worker itself. What a
 * run cost the app shows in two ways: a pulse the app moves on every frame, which stops while the app stands
 * still, and a heartbeat the app keeps beating in the App Worker during a run, drawn as a bar afterwards.
 *
 * @class Neo.examples.data.pipeline.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.data.pipeline.MainContainer'
         * @protected
         */
        className: 'Neo.examples.data.pipeline.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-data-pipeline']
         * @reactive
         */
        cls: ['neo-examples-data-pipeline'],
        /**
         * How many orders the payload holds. `null` takes a million where the device reports 8 GB of memory or
         * more, and half a million elsewhere.
         * @member {Number|null} orderCount=null
         */
        orderCount: null,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Component,
            cls   : ['neo-examples-data-pipeline-intro'],
            flex  : 'none',
            vdom  : {tag: 'header', cn: [
                {tag: 'h1', cls: ['neo-examples-data-pipeline-title'],       text: 'Where a data pipeline runs decides whether the app stands still'},
                {tag: 'p',  cls: ['neo-examples-data-pipeline-instruction'], text: 'This app runs in a worker, the app worker. The report below was just built by a data pipeline in a second one, the data worker. Run the same pipeline on the app worker and watch the pulse: the two runs differ in one config value, workerExecution.'}
            ]}
        }, {
            module: Container,
            cls   : ['neo-examples-data-pipeline-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},

            items: [{
                module   : Button,
                disabled : true,
                handler  : 'up.onRunAppButtonClick',
                iconCls  : 'fa-solid fa-play',
                reference: 'run-app',
                text     : 'Run on the app worker',
                ui       : 'primary'
            }, {
                module   : Button,
                disabled : true,
                handler  : 'up.onRunDataButtonClick',
                iconCls  : 'fa-solid fa-play',
                reference: 'run-data',
                text     : 'Run on the data worker'
            }, {
                module   : Component,
                cls      : ['neo-examples-data-pipeline-pulse'],
                reference: 'pulse',
                vdom     : {cn: [
                    {tag: 'span', text: 'The app\'s pulse'},
                    {cls: ['neo-examples-data-pipeline-pulse-track'], cn: [
                        {cls: ['neo-examples-data-pipeline-pulse-dot']}
                    ]}
                ]}
            }, {
                module  : ThemeSwitcher,
                showText: false
            }]
        }, {
            module   : Component,
            cls      : ['neo-examples-data-pipeline-payload'],
            flex     : 'none',
            reference: 'payload',
            tag      : 'p',
            text     : 'Generating the orders …'
        }, {
            // Only there after a run that did not finish
            module   : Component,
            cls      : ['neo-examples-data-pipeline-error'],
            flex     : 'none',
            hidden   : true,
            reference: 'error',
            role     : 'alert',
            tag      : 'p'
        }, {
            // What a run cost the app comes first, where the time went below it
            module   : HeartbeatRow,
            flex     : 'none',
            mode     : 'app',
            reference: 'heartbeat-app',
            threshold: PAUSE
        }, {
            module   : HeartbeatRow,
            flex     : 'none',
            mode     : 'data',
            reference: 'heartbeat-data',
            threshold: PAUSE
        }, {
            module   : Component,
            cls      : ['neo-examples-data-pipeline-legend'],
            flex     : 'none',
            reference: 'legend',
            tag      : 'p'
        }, {
            module   : StageList,
            flex     : 'none',
            reference: 'stages'
        }, {
            module   : Table,
            cls      : ['neo-examples-data-pipeline-report'],
            flex     : 'none',
            reference: 'report',
            store    : {keyProperty: 'country', model: ReportModel},

            columns: [
                {dataField: 'country',   text: 'Country'},
                {dataField: 'orders',    text: 'Orders',            renderer: data => MainContainer.formatNumber(data.value)},
                {dataField: 'revenue',   text: 'Revenue (€)',       renderer: data => MainContainer.formatNumber(data.value)},
                {dataField: 'average',   text: 'Average order (€)', renderer: data => MainContainer.formatNumber(data.value)},
                {dataField: 'customers', text: 'Customers',         renderer: data => MainContainer.formatNumber(data.value)},
                {dataField: 'bestMonth', text: 'Top month'}
            ]
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * @summary A number as the page writes all of them, with its thousands separated.
     * @param {Number} value
     * @returns {String}
     * @static
     */
    static formatNumber(value) {
        return value.toLocaleString('en-US')
    }

    /**
     * @summary Reads a heartbeat: how long it went on, and every pause in it.
     *
     * A pause is a gap of `PAUSE` milliseconds or more between two beats. Its length is the gap, because no beat
     * arrived in it.
     * @param {Number[]} beats The times the beats arrived at, in milliseconds
     * @returns {{duration: Number, paused: Number, pauses: Object[]}} A pause is `{duration, start}`, `start`
     * counted from the first beat; `paused` is the sum of the pauses
     * @static
     */
    static readHeartbeat(beats) {
        const
            start  = beats[0],
            pauses = [];
        let paused = 0;

        for (let index = 1; index < beats.length; index++) {
            const duration = beats[index] - beats[index - 1];

            if (duration >= PAUSE) {
                paused += duration;
                pauses.push({duration, start: beats[index - 1] - start})
            }
        }

        return {duration: beats.at(-1) - start, paused, pauses}
    }

    /**
     * The heartbeat of the run in flight, `null` between two runs.
     * @member {Object|null} heartbeat=null
     */
    heartbeat = null
    /**
     * The worker the store's pipeline runs on: 'app', 'data', or `null` before the first run and after a run that
     * did not finish.
     * @member {String|null} mode=null
     */
    mode = null
    /**
     * The size of the payload in bytes.
     * @member {Number} payloadBytes=0
     */
    payloadBytes = 0
    /**
     * The address a connection reads the payload from, once it exists.
     * @member {String|null} payloadUrl=null
     */
    payloadUrl = null
    /**
     * How many runs the page has finished.
     * @member {Number} runCount=0
     */
    runCount = 0
    /**
     * The sample of the attempt in flight. It stays apart from `samples` until the store's load has brought its
     * report, since a pipeline can finish and its store still fail. `null` between two runs.
     * @member {Object|null} attempt=null
     */
    attempt = null
    /**
     * The heartbeat of the last run on each worker, with its place among the page's runs: `{app, data}`.
     * @member {Object} runs={}
     */
    runs = {}
    /**
     * The sample the pipeline published for the last run on each worker, filed under the worker the sample names:
     * `{app, data}`.
     * @member {Object} samples={}
     */
    samples = {}

    /**
     * @summary Generates the payload and gives it an address, then builds the report once on the data worker.
     * @returns {Promise<void>}
     * @protected
     */
    async createPayload() {
        const me = this;

        try {
            me.orderCount ??= navigator.deviceMemory >= 8 ? 1000000 : 500000;

            const blob = await createOrdersBlob(me.orderCount, () => me.timeout(0));

            // The view can be gone by now, and an address made after `destroy()` would never be taken back
            if (me.isDestroyed) {
                return
            }

            me.payloadBytes = blob.size;
            me.payloadUrl   = URL.createObjectURL(blob);

            me.getReference('payload').text = `The payload: ${MainContainer.formatNumber(me.orderCount)} fictional orders in one JSON document of ${(blob.size / 1048576).toFixed(1)} MB, generated on this page and served from memory. Nothing goes over the network.`;

            await me.run('data')
        } catch (error) {
            if (error !== Neo.isDestroyed && !me.isDestroyed) {
                me.showError(`The orders could not be generated: ${error?.message || error}. Reload the page to try again.`)
            }
        }
    }

    /**
     * @summary Leaves the page as it was before a run that did not finish, and says so. The store's pipeline is
     * given up, so the next run builds a new one.
     * @param {String} mode 'app' or 'data'
     * @param {String} reason
     * @protected
     */
    failRun(mode, reason) {
        const me = this;

        me.mode = null;
        me.showError(`The run on the ${mode} worker did not finish: ${reason}. The numbers on this page are from the runs before it. Press a button to run again.`)
    }

    /**
     * @summary Lets the payload go.
     * @param {...*} args
     */
    destroy(...args) {
        this.payloadUrl && URL.revokeObjectURL(this.payloadUrl);
        super.destroy(...args)
    }

    /**
     * Starts the pulse and the payload once the items exist.
     */
    onConstructed() {
        super.onConstructed();

        this.runPulse();
        this.showLegend();
        this.createPayload()
    }

    /**
     * @param {Object} data
     */
    onRunAppButtonClick(data) {
        this.run('app')
    }

    /**
     * @param {Object} data
     */
    onRunDataButtonClick(data) {
        this.run('data')
    }

    /**
     * @summary Keeps the sample of the attempt in flight. `run()` files it once the store's load has succeeded.
     * @param {Object} data
     * @protected
     */
    onTelemetry(data) {
        // An attempt the pipeline itself rejected is no run
        if (data.status === 'fulfilled') {
            this.attempt = data
        }
    }

    /**
     * @summary Runs the pipeline on a worker and shows its stages and what it cost the app.
     *
     * The store gets a new pipeline when the worker changes: `workerExecution` decides at construction where the
     * connection and the interceptor live.
     *
     * A run counts when its load brought a report and the pipeline published a sample for it. A load that
     * throws, or that resolves with nothing, leaves the runs and the samples on the page as they were, and the
     * page says so; that holds for a store that fails after its pipeline has finished, too, because the attempt's
     * sample is filed only after the load. Either way the heartbeat stops and the buttons come back.
     * @param {String} mode 'app' or 'data'
     * @returns {Promise<void>}
     */
    async run(mode) {
        const
            me      = this,
            {store} = me.getReference('report');

        me.setButtonsDisabled(true);
        me.showError(null);

        try {
            if (me.mode !== mode) {
                store.pipeline = {
                    connection     : {className: 'Neo.data.connection.Fetch', url: me.payloadUrl},
                    interceptors   : [{module: Report, modulePath: 'examples/data/pipeline/Report.mjs'}],
                    normalizer     : {className: 'Neo.data.normalizer.Base'},
                    telemetry      : true,
                    workerExecution: mode
                };

                store.pipeline.on('telemetry', me.onTelemetry, me);

                me.mode = mode
            }

            me.attempt   = null;
            me.heartbeat = me.startHeartbeat();

            const report = await store.load();
            // A few beats after the run, so the bar shows the app alive again
            await me.timeout(TAIL);

            const
                run    = me.stopHeartbeat(),
                sample = me.attempt;

            if (report == null) {
                me.failRun(mode, 'its load brought no report')
            } else if (!sample) {
                me.failRun(mode, 'the pipeline published no sample for it')
            } else {
                // Under the worker the sample itself names, not under the button pressed
                me.samples[sample.worker === 'data' ? 'data' : 'app'] = sample;
                me.runs[mode] = {...run, sequence: ++me.runCount};
                me.showRuns()
            }
        } catch (error) {
            if (error !== Neo.isDestroyed && !me.isDestroyed) {
                me.failRun(mode, error?.message || String(error))
            }
        } finally {
            me.attempt = null;
            me.stopHeartbeat();
            me.isDestroyed || me.setButtonsDisabled(false)
        }
    }

    /**
     * @summary Moves the pulse on every frame, for as long as this instance lives. The app does it in the App
     * Worker, so the pulse stops for exactly as long as that worker is busy with something else.
     * @returns {Promise<void>}
     * @protected
     */
    async runPulse() {
        const
            me    = this,
            pulse = me.getReference('pulse'),
            dot   = pulse.vdom.cn[1].cn[0];

        try {
            for (;;) {
                // One swing to the right and back takes 1.2 s
                dot.style = {left: `${50 + 46 * Math.sin(performance.now() / 1200 * 2 * Math.PI)}%`};
                pulse.update();

                await me.timeout(16)
            }
        } catch (error) {
            if (error !== Neo.isDestroyed) {
                throw error
            }
        }
    }

    /**
     * @param {Boolean} disabled
     * @protected
     */
    setButtonsDisabled(disabled) {
        this.getReference('run-app') .disabled = disabled;
        this.getReference('run-data').disabled = disabled
    }

    /**
     * @summary Says that a run did not finish, or takes that line off the page.
     * @param {String|null} message
     * @protected
     */
    showError(message) {
        this.getReference('error').set({hidden: !message, text: message || ''})
    }

    /**
     * @summary Says what the bars are and, once a run exists, how much time their full width stands for.
     * @param {Number} [scale]
     * @protected
     */
    showLegend(scale) {
        this.getReference('legend').text = `A bar is the app's heartbeat from the start of a run until ${TAIL} ms after it: a timer the app sets every ${BEAT} ms. Red marks every gap of ${PAUSE} ms or more between two beats: a pause, in which the app could answer nothing.${scale ? ` Full width: ${Math.round(scale)} ms.` : ''}`
    }

    /**
     * @summary Writes both runs onto the page: their heartbeats into the bars, on one scale, and the stages'
     * durations into the list, from the samples the pipeline published.
     * @protected
     */
    showRuns() {
        const
            me              = this,
            {runs, samples} = me,
            sample          = samples[me.mode],
            megabytes       = (me.payloadBytes / 1048576).toFixed(1),
            scale           = Math.max(...Object.values(runs).map(run => run.duration)),
            // A stage that did not run has no times, and neither has a worker that has not run yet
            duration        = (mode, stage) => samples[mode]?.[`${stage}Start`] == null ? null : samples[mode][`${stage}End`] - samples[mode][`${stage}Start`];

        for (const mode of ['app', 'data']) {
            me.getReference(`heartbeat-${mode}`).set({run: runs[mode] || null, scale})
        }

        me.showLegend(scale);

        if (sample) {
            const
                orders = MainContainer.formatNumber(sample.rawSize.records),
                rows   = MainContainer.formatNumber(sample.parsedSize.records);

            me.getReference('stages').store.data = [
                {id: 'request',    name: 'Request hook',    detail: 'took the paging params off the request'},
                {id: 'connection', name: 'Connection',      detail: `read ${megabytes} MB from memory and parsed their JSON`},
                {id: 'response',   name: 'Response hook',   detail: `unwrapped ${orders} orders from the response`},
                {id: 'postParse',  name: 'Post-parse hook', detail: `turned ${orders} orders into ${rows} report rows, parsing every order's date`},
                {id: 'normalizer', name: 'Normalizer',      detail: `handed ${rows} rows and their count to the store`}
            ].map(stage => ({...stage, app: duration('app', stage.id), data: duration('data', stage.id)}))
        }
    }

    /**
     * @summary Beats in the App Worker until stopped, and reports where the beat stopped.
     *
     * A beat is a timer: it fires only when the App Worker is free. While the worker parses or shapes data, no beat
     * arrives, and the gap between two beats is the time the app could answer nothing.
     * @returns {{stop: Function}} `stop()` ends the beat and returns what {@link #readHeartbeat} reads from it
     * @protected
     */
    startHeartbeat() {
        const
            me    = this,
            beats = [performance.now()];
        let running = true;

        (async () => {
            try {
                while (running) {
                    await me.timeout(BEAT);
                    running && beats.push(performance.now())
                }
            } catch (error) {
                if (error !== Neo.isDestroyed) {
                    throw error
                }
            }
        })();

        return {
            stop() {
                running = false;

                return MainContainer.readHeartbeat(beats)
            }
        }
    }

    /**
     * @summary Ends the heartbeat of the run in flight, if there is one.
     * @returns {Object|null} What the heartbeat held, `null` when none was beating
     * @protected
     */
    stopHeartbeat() {
        const
            me   = this,
            read = me.heartbeat?.stop() || null;

        me.heartbeat = null;

        return read
    }
}

export default Neo.setupClass(MainContainer);
