import Component from '../../../src/component/Base.mjs';

/**
 * @summary What one pipeline run cost the app: the worker the run was on, the app's heartbeat during it as a bar, and
 * the time the app stood still as a number. The bar is filled for as long as the heartbeat went on and red wherever
 * two beats were at least `threshold` milliseconds apart.
 *
 * @class Neo.examples.data.pipeline.HeartbeatRow
 * @extends Neo.component.Base
 */
class HeartbeatRow extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.data.pipeline.HeartbeatRow'
         * @protected
         */
        className: 'Neo.examples.data.pipeline.HeartbeatRow',
        /**
         * @member {String[]} cls=['neo-examples-data-pipeline-heartbeat']
         * @reactive
         */
        cls: ['neo-examples-data-pipeline-heartbeat'],
        /**
         * The worker the row's runs are on: 'app' or 'data', the value of the pipeline's `workerExecution`.
         * @member {String} mode_='app'
         * @reactive
         */
        mode_: 'app',
        /**
         * The run: `{duration, paused, pauses, sequence}`, the first three in milliseconds: `paused` is the sum of
         * `pauses`, each a `{duration, start}` from the run's start, and `sequence` counts the page's runs from 1.
         * `null` before the first run.
         * @member {Object|null} run_=null
         * @reactive
         */
        run_: null,
        /**
         * The time the full width of the bar stands for, in milliseconds. Both rows share it, so their bars compare.
         * @member {Number} scale_=1
         * @reactive
         */
        scale_: 1,
        /**
         * From how many milliseconds on a gap between two beats is a pause. The row names it where a run had none.
         * @member {Number} threshold=20
         */
        threshold: 20,
        /**
         * @member {Object} _vdom
         */
        _vdom: {cn: [
            {cls: ['neo-examples-data-pipeline-heartbeat-run'], cn: [
                {tag: 'span', cls: ['neo-examples-data-pipeline-worker']},
                {tag: 'code'}
            ]},
            {cls: ['neo-examples-data-pipeline-heartbeat-bar'], cn: []},
            {cls: ['neo-examples-data-pipeline-heartbeat-result'], cn: [
                {tag: 'strong'},
                {tag: 'span'}
            ]}
        ]}
    }

    /**
     * Triggered after the mode config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetMode(value, oldValue) {
        this.updateBar()
    }

    /**
     * Triggered after the run config got changed
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetRun(value, oldValue) {
        this.updateBar()
    }

    /**
     * Triggered after the scale config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetScale(value, oldValue) {
        this.updateBar()
    }

    /**
     * @summary Writes the worker, the bar and the time the app stood still into the vdom.
     * @protected
     */
    updateBar() {
        const
            me                       = this,
            {mode, run, scale, vdom} = me,
            [head, bar, result]      = vdom.cn,
            [worker, config]         = head.cn,
            [number, sentence]       = result.cn,
            share                    = value => `${Math.min(100, value / scale * 100)}%`;

        worker.cls  = ['neo-examples-data-pipeline-worker', `neo-ran-on-${mode}`];
        worker.text = mode === 'data' ? 'Data worker' : 'App worker';
        config.text = `workerExecution: '${mode}'`;

        // The number behind the sentence and the run it belongs to, for a reader that is not a person
        vdom['data-paused'] = run ? Math.round(run.paused) : null;
        vdom['data-run']    = run ? run.sequence : null;

        if (run) {
            const count = run.pauses.length;

            bar.cn = [
                {cls: ['neo-examples-data-pipeline-heartbeat-alive'], style: {width: share(run.duration)}},
                ...run.pauses.map(pause => ({
                    cls  : ['neo-examples-data-pipeline-heartbeat-pause'],
                    style: {left: share(pause.start), width: share(pause.duration)}
                }))
            ];

            number.text   = `${Math.round(run.paused)} ms`;
            sentence.text = count ? `the app stood still, in ${count} ${count === 1 ? 'pause' : 'pauses'}` : `no pause of ${me.threshold} ms or more`
        } else {
            bar.cn        = [];
            number.text   = '–';
            sentence.text = 'not run yet'
        }

        me.update()
    }
}

export default Neo.setupClass(HeartbeatRow);
