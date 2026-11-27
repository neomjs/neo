import Base from '../core/Base.mjs';

const STEP_MS = 16;

/**
 * @summary Moves the bars and links of the tasks a Gantt cascade changed, from their previous to their final dates,
 * on one app-worker clock.
 * @description Bars ({@link Neo.gantt.Column#getDrawnSpan}) and links ({@link Neo.gantt.DependencyLayer#project})
 * both map a task's dates through the time axis. While a move runs, both read the task's in-flight span from the
 * chart's {@link Neo.gantt.Container#drawnSpans}, which only this class writes, so a link never leaves its bar.
 * The records hold their final dates throughout.
 *
 * The steps follow the chart's `--motion-panel` duration and `--ease-out-soft` easing, which {@link #readTokens}
 * reads from its node ahead of the moves. {@link #start} runs inside the chart's synchronous edit, after the
 * cascade's writes, and moves the tasks only on a positive tier: a `0ms` tier (reduced motion), or a read that
 * failed, found no tier or has not answered yet, leaves the edit's own repaint as the one update. When it moves
 * them, the rows those writes repainted send their update only after the current task, so its repaint at the
 * previous spans is what the browser shows first. {@link #end} lands a move at once; the chart calls it on a
 * scroll, a zoom, a store load, filter or sort, and before the next move. {@link #stop} drops it unpainted.
 * @class Neo.gantt.CascadeMotion
 * @extends Neo.core.Base
 */
class CascadeMotion extends Base {
    /**
     * @summary Returns CSS `cubic-bezier(x1, y1, x2, y2)` as a function from elapsed fraction to progress.
     * @param {Number} x1 The first control point's x, in [0, 1]
     * @param {Number} y1 The first control point's y
     * @param {Number} x2 The second control point's x, in [0, 1]
     * @param {Number} y2 The second control point's y
     * @returns {Function}
     */
    static cubicBezier(x1, y1, x2, y2) {
        let curve = (t, p1, p2) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;

        return x => {
            let low  = 0,
                high = 1,
                t    = x;
            // x1 and x2 lie in [0, 1], so the curve's x rises with t: bisection finds the t for x
            for (let i = 0; i < 24; i++) {
                t = (low + high) / 2;
                curve(t, x1, x2) < x ? low = t : high = t
            }
            return curve(t, y1, y2)
        }
    }

    static config = {
        /**
         * @member {String} className='Neo.gantt.CascadeMotion'
         * @protected
         */
        className: 'Neo.gantt.CascadeMotion',
        /**
         * The chart whose cascades this moves.
         * @member {Neo.gantt.Container|null} chart=null
         */
        chart: null
    }

    /**
     * The moving tasks by span key: their store key and the spans they move between, in ms.
     * @member {Map} #moves
     * @private
     */
    #moves = new Map()
    /**
     * Counts token reads, so only the latest one answers.
     * @member {Number} #read=0
     * @private
     */
    #read = 0
    /**
     * Counts starts and ends, so a step of an earlier move leaves a later one alone.
     * @member {Number} #run=0
     * @private
     */
    #run = 0
    /**
     * The timeout that runs the next step, null while the clock stands.
     * @member {Number|null} #timer=null
     * @private
     */
    #timer = null
    /**
     * The tokens the latest read found: `{duration, ease}`, null until one answers.
     * @member {Object|null} #tokens=null
     * @private
     */
    #tokens = null

    /**
     * @summary Stops the clock without painting.
     * @param {...*} args Passed on to the base class
     */
    destroy(...args) {
        this.#run++;
        clearTimeout(this.#timer);
        super.destroy(...args)
    }

    /**
     * @summary Lands every moving task at its final dates in one update and stops the clock.
     */
    end() {
        let me = this;

        me.chart.drawnSpans.clear();
        me.#moves.size && me.#paint();
        me.stop()
    }

    /**
     * @summary Stops the clock and forgets the moving tasks without painting them, for a chart about to draw
     * other records under the same keys.
     */
    stop() {
        let me = this;

        me.#run++;
        clearTimeout(me.#timer);
        me.#timer = null;
        me.#moves.clear();
        me.chart.drawnSpans.clear()
    }

    /**
     * @summary Repaints the moving tasks' rows and re-projects the links: one body update carries both.
     * @description The layer's update merges into the body's, which renders every mounted row component.
     * @private
     */
    #paint() {
        let {chart} = this,
            {body}  = chart;

        chart.dependencyLayer?.project();

        body && !body.isDestroyed && body.onStoreRowsChange({
            fields: [chart.startDateField, chart.endDateField],
            keys  : [...this.#moves.values()].map(move => move.key)
        })
    }

    /**
     * @summary Reads the chart's motion tokens from its node, for the moves that follow. The chart reads them when
     * it switches the transition on and when it mounts, and {@link #start} after each move. Only the latest read
     * answers; one that fails or finds no tier keeps the tasks still, and lands a move that is running.
     * @returns {Promise<void>}
     */
    async readTokens() {
        let me      = this,
            {chart} = me,
            read    = ++me.#read,
            tokens  = {duration: 0};

        try {
            let styles = await Neo.main.DomAccess.getComputedStyle({
                    id: chart.id, style: ['--motion-panel', '--ease-out-soft'], windowId: chart.windowId
                }),
                tier   = String(styles?.['--motion-panel'] ?? '').trim(),
                points = /cubic-bezier\(([^)]*)\)/.exec(styles?.['--ease-out-soft'] ?? '')?.[1].split(',').map(Number),
                value  = parseFloat(tier);

            tokens = {
                duration: !Number.isFinite(value) ? 0 : tier.endsWith('ms') ? value : tier.endsWith('s') ? value * 1000 : value,
                ease    : points?.length === 4 && points.every(Number.isFinite) ? CascadeMotion.cubicBezier(...points) : x => x
            }
        } catch {}

        if (read === me.#read && !me.isDestroyed) {
            me.#tokens = tokens;
            tokens.duration > 0 || me.end()
        }
    }

    /**
     * @summary Lands a running move, then moves the given tasks from their previous to their current dates, when the
     * latest token read found a positive tier and `Neo.config.prefersReducedMotion` is off.
     * @param {Object[]} changed `{record, previous}` per changed task: `previous` holds the fields the edit changed
     */
    start(changed) {
        let me      = this,
            {chart} = me,
            spans   = chart.drawnSpans,
            start   = chart.startDateField,
            end     = chart.endDateField,
            toMs    = value => value instanceof Date ? value.getTime() : new Date(value).getTime(),
            // The preference is known now; a tier read before it changed is not
            {duration = 0, ease} = Neo.config.prefersReducedMotion ? {} : me.#tokens || {};

        me.end();

        for (let {record, previous} of duration > 0 ? changed : []) {
            let key     = record && chart.store.getKey(record),
                spanKey = String(key);

            if (record && !me.#moves.has(spanKey)) {
                let from = [toMs(previous?.[start] ?? record[start]), toMs(previous?.[end] ?? record[end])],
                    to   = [toMs(record[start]), toMs(record[end])];

                if (from.concat(to).every(Number.isFinite) && (from[0] !== to[0] || from[1] !== to[1])) {
                    me.#moves.set(spanKey, {from, key, to});
                    spans.set(spanKey, from)
                }
            }
        }

        if (me.#moves.size) {
            let run       = me.#run,
                startTime = performance.now();

            me.#paint();
            me.#timer = setTimeout(() => me.#step(run, startTime, duration, ease), STEP_MS)
        }

        me.readTokens()
    }

    /**
     * @summary Draws the moving tasks at the eased progress of the elapsed time, until the duration has passed.
     * @param {Number}   run       The run this step belongs to; a later start or end retires it
     * @param {Number}   startTime `performance.now()` when the move started
     * @param {Number}   duration  The move's duration in ms
     * @param {Function} ease      Maps the elapsed fraction to progress
     * @private
     */
    #step(run, startTime, duration, ease) {
        let me      = this,
            elapsed = (performance.now() - startTime) / duration;

        if (run !== me.#run) return;

        if (elapsed >= 1 || Neo.config.prefersReducedMotion) {
            me.end();
            return
        }

        let progress = ease(elapsed);

        for (let [key, {from, to}] of me.#moves) {
            me.chart.drawnSpans.set(key, [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress])
        }

        me.#paint();
        me.#timer = setTimeout(() => me.#step(run, startTime, duration, ease), STEP_MS)
    }
}

export default Neo.setupClass(CascadeMotion);
