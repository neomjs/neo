import ComponentController           from '../../../src/controller/Component.mjs';
import {createFeed, METRICS, WINDOW} from './metrics.mjs';

/**
 * @summary Runs the sparkline example's feed. Each metric keeps its last thirty readings; a tick appends one
 * reading per metric and drops the oldest, then hands the window to its sparkline as `values`. The feed timer
 * has one creator (`startFeed`) and one destructor (`stopFeed`), which `destroy` calls too.
 *
 * @class Neo.examples.component.sparkline.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.sparkline.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.component.sparkline.MainContainerController'
    }

    /**
     * Each metric's feed, keyed by the metric id.
     * @member {Object} feeds={}
     * @protected
     */
    feeds = {}
    /**
     * The interval id of the running feed, or `null`.
     * @member {Number|null} feedTimer=null
     * @protected
     */
    feedTimer = null
    /**
     * Each metric's last readings, keyed by the metric id.
     * @member {Object} readings={}
     * @protected
     */
    readings = {}

    /**
     * @param {...*} args
     */
    destroy(...args) {
        this.stopFeed();
        super.destroy(...args)
    }

    /**
     * @summary Fills every card with its opening readings and starts the feed.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        this.restart();
        this.startFeed()
    }

    /**
     * @param {Object} data
     */
    onFeedChange(data) {
        data.value ? this.startFeed() : this.stopFeed()
    }

    /**
     * @param {Object} data
     */
    onPulseChange(data) {
        this.setSparklines({usePulse: data.value})
    }

    /**
     * @summary Replays the opening readings; a running feed carries on from them.
     */
    onRestartClick() {
        this.restart()
    }

    /**
     * @param {Object} data
     */
    onTransitionChange(data) {
        this.setSparklines({useTransition: data.value})
    }

    /**
     * @summary Shows a metric's readings: the newest one as text, all of them in the sparkline.
     * @param {Object} metric
     * @protected
     */
    publish(metric) {
        const
            me        = this,
            readings  = me.readings[metric.id],
            sparkline = me.getReference(`${metric.id}-sparkline`),
            value     = me.getReference(`${metric.id}-value`);

        value.text       = metric.format(readings.at(-1));
        sparkline.values = [...readings]
    }

    /**
     * @summary New feeds from their seeds and thirty readings each, the same ones on every restart.
     * @protected
     */
    restart() {
        const me = this;

        METRICS.forEach((metric, index) => {
            const feed = createFeed(metric, index);

            me.feeds[metric.id]    = feed;
            me.readings[metric.id] = Array.from({length: WINDOW}, () => feed.next());
            me.publish(metric)
        })
    }

    /**
     * @summary Sets the same configs on every sparkline.
     * @param {Object} configs
     * @protected
     */
    setSparklines(configs) {
        METRICS.forEach(metric => this.getReference(`${metric.id}-sparkline`).set(configs))
    }

    /**
     * @summary Starts the one-second feed, unless it runs already.
     * @protected
     */
    startFeed() {
        const me = this;

        me.feedTimer ??= setInterval(() => me.tick(), 1000)
    }

    /**
     * @summary Stops the feed; the readings stay where they are.
     * @protected
     */
    stopFeed() {
        const me = this;

        clearInterval(me.feedTimer);
        me.feedTimer = null
    }

    /**
     * @summary One reading more for every metric, the oldest one less.
     * @protected
     */
    tick() {
        const me = this;

        METRICS.forEach(metric => {
            const values = me.readings[metric.id];

            values.push(me.feeds[metric.id].next());
            values.shift();
            me.publish(metric)
        })
    }
}

export default Neo.setupClass(MainContainerController);
