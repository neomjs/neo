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
 * {@link #start} runs inside the chart's synchronous edit, after the cascade's writes. The rows those writes
 * repainted send their update only after the current task, so its repaint at the previous spans is what the
 * browser shows first. The steps follow the chart's `--motion-panel` duration and `--ease-out-soft` easing,
 * read from its node. A `0ms` tier (reduced motion), or a read that fails or finds no tier, lands the tasks in
 * one update. {@link #end} lands them at once; the chart calls it on a scroll, a zoom, a store load, filter or
 * sort, and before the next move.
 * @class Neo.gantt.CascadeMotion
 * @extends Neo.core.Base
 */
class CascadeMotion extends Base {
    /**
     * @summary Returns CSS `cubic-bezier(x1, y1, x2, y2)` as a function from elapsed fraction to progress.
     * @param {Number} x1
     * @param {Number} y1
     * @param {Number} x2
     * @param {Number} y2
     * @returns {Function}
     */
    static cubicBezier(x1, y1, x2, y2) {
        const curve = (t, p1, p2) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3;

        return x => {
            let low = 0, high = 1, t = x;
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

    /** The moving tasks by span key: their store key and the spans they move between, in ms. */
    #moves = new Map()
    /** Counts starts and ends, so a token read or a step of an earlier move leaves a later one alone. */
    #run = 0
    #timer = null

    /** @summary Stops the clock without painting. @param {...*} args */
    destroy(...args) {
        this.#run++;
        clearTimeout(this.#timer);
        super.destroy(...args)
    }

    /**
     * @summary Lands every moving task at its final dates in one update and stops the clock.
     */
    end() {
        const me = this;

        me.#run++;
        clearTimeout(me.#timer);
        me.#timer = null;
        me.chart.drawnSpans.clear();

        if (me.#moves.size) {
            me.#paint();
            me.#moves.clear()
        }
    }

    /**
     * @summary Repaints the moving tasks' rows and re-projects the links: one body update carries both.
     * @description The layer's update merges into the body's, which renders every mounted row component.
     */
    #paint() {
        const {chart} = this, {body} = chart;

        chart.dependencyLayer?.project();

        body && !body.isDestroyed && body.onStoreRowsChange({
            fields: [chart.startDateField, chart.endDateField],
            keys  : [...this.#moves.values()].map(move => move.key)
        })
    }

    /**
     * @summary Reads the chart's motion tokens: the duration in ms, 0 when the read fails or finds no tier.
     * @returns {Promise<{duration: Number, ease: Function}>}
     */
    async #readTokens() {
        const {chart} = this;

        try {
            const
                styles = await Neo.main.DomAccess.getComputedStyle({
                    id: chart.id, style: ['--motion-panel', '--ease-out-soft'], windowId: chart.windowId
                }),
                tier   = String(styles?.['--motion-panel'] ?? '').trim(),
                points = /cubic-bezier\(([^)]*)\)/.exec(styles?.['--ease-out-soft'] ?? '')?.[1].split(',').map(Number),
                value  = parseFloat(tier);

            return {
                duration: !Number.isFinite(value) ? 0 : tier.endsWith('ms') ? value : tier.endsWith('s') ? value * 1000 : value,
                ease    : points?.length === 4 && points.every(Number.isFinite) ? CascadeMotion.cubicBezier(...points) : x => x
            }
        } catch {
            return {duration: 0}
        }
    }

    /**
     * @summary Lands a running move, then moves the given tasks from their previous to their current dates.
     * @param {Object[]} changed `{record, previous}` per changed task: `previous` holds the fields the edit changed
     */
    start(changed) {
        const
            me      = this,
            {chart} = me,
            spans   = chart.drawnSpans,
            start   = chart.startDateField,
            end     = chart.endDateField,
            toMs    = value => value instanceof Date ? value.getTime() : new Date(value).getTime();

        me.end();

        for (const {record, previous} of changed) {
            const key = record && chart.store.getKey(record), spanKey = String(key);

            if (record && !me.#moves.has(spanKey)) {
                const
                    from = [toMs(previous?.[start] ?? record[start]), toMs(previous?.[end] ?? record[end])],
                    to   = [toMs(record[start]), toMs(record[end])];

                if (from.concat(to).every(Number.isFinite) && (from[0] !== to[0] || from[1] !== to[1])) {
                    me.#moves.set(spanKey, {from, key, to});
                    spans.set(spanKey, from)
                }
            }
        }

        if (me.#moves.size) {
            const run = me.#run;

            me.#paint();

            me.#readTokens().then(({duration, ease}) => {
                if (run === me.#run && !me.isDestroyed) {
                    duration > 0 ? me.#step(run, performance.now(), duration, ease) : me.end()
                }
            })
        }
    }

    /**
     * @summary Draws the moving tasks at the eased progress of the elapsed time, until the duration has passed.
     * @param {Number} run
     * @param {Number} startTime
     * @param {Number} duration
     * @param {Function} ease
     */
    #step(run, startTime, duration, ease) {
        const me = this, elapsed = (performance.now() - startTime) / duration;

        if (run !== me.#run) return;

        if (elapsed >= 1) {
            me.end();
            return
        }

        const progress = ease(elapsed);

        for (const [key, {from, to}] of me.#moves) {
            me.chart.drawnSpans.set(key, [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress])
        }

        me.#paint();
        me.#timer = setTimeout(() => me.#step(run, startTime, duration, ease), STEP_MS)
    }
}

export default Neo.setupClass(CascadeMotion);
