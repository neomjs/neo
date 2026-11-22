import Button        from '../../../src/button/Base.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import PointsCanvas  from './PointsCanvas.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @summary The proof that a blocked main thread stops neither the picture nor the app. A million points move in a
 * canvas the canvas worker draws. The app, which runs in the App Worker, sends the time to two places ten times a
 * second: to the page clock, which is DOM text, and to the canvas, worker to worker. One button blocks the page's
 * main thread for five seconds: the page clock stands still, the clock in the canvas runs on, and the points keep
 * moving. Afterwards the page says how long the main thread was away, how many frames the canvas worker painted in
 * that time, and whether the app's clock ever stood.
 *
 * @class Neo.examples.worker.canvas.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.worker.canvas.MainContainer'
         * @protected
         */
        className: 'Neo.examples.worker.canvas.MainContainer',
        /**
         * How long the button blocks the main thread, in milliseconds.
         * @member {Number} blockDuration=5000
         */
        blockDuration: 5000,
        /**
         * @member {String[]} cls=['neo-examples-worker-canvas']
         * @reactive
         */
        cls: ['neo-examples-worker-canvas'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['neo-examples-worker-canvas-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},

            items: [{
                module: Component,
                cls   : ['neo-examples-worker-canvas-intro'],
                vdom  : {tag: 'header', cn: [
                    {tag: 'h1', cls: ['neo-examples-worker-canvas-title'],       text: 'A canvas keeps moving while the main thread is blocked'},
                    {tag: 'p',  cls: ['neo-examples-worker-canvas-instruction'], text: 'Press the button. The page clock is ordinary page text, so it stops for 5 seconds. The app runs in a worker and sends the same time to the canvas, where it runs on. Try the theme button meanwhile: the page answers only when the 5 seconds are over.'}
                ]}
            }, {
                module   : Button,
                handler  : 'up.onBlockButtonClick',
                iconCls  : 'fa-solid fa-hand',
                reference: 'block-button',
                text     : 'Block the main thread for 5 seconds',
                ui       : 'primary'
            }, {
                module  : ThemeSwitcher,
                showText: false
            }]
        }, {
            module   : Component,
            cls      : ['neo-examples-worker-canvas-result'],
            flex     : 'none',
            reference: 'result',
            tag      : 'p'
        }, {
            // Right above the canvas, where the app's clock is drawn: the two are read as a pair
            module   : Component,
            cls      : ['neo-examples-worker-canvas-clock'],
            flex     : 'none',
            reference: 'clock',
            text     : 'Page clock'
        }, {
            module   : PointsCanvas,
            flex     : 1,
            reference: 'canvas'
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * @summary Blocks the main thread and says what happened meanwhile. The canvas is told first, so it can count
     * the seconds itself: for the length of the block this page cannot change a single node.
     *
     * The engine reports an update that stays in flight for five seconds as wedged, its reply as lost. This page
     * stops its main thread on purpose, so the clock's write that leaves as the block begins is late, not lost:
     * the watchdog gets room for the block that is about to come, and its own value back afterwards.
     * @param {Object} data
     */
    async onBlockButtonClick(data) {
        const
            me        = this,
            button    = data.component,
            canvas    = me.getReference('canvas'),
            result    = me.getReference('result'),
            duration  = me.blockDuration,
            updates   = Neo.manager.VDomUpdate,
            threshold = updates.watchdogThreshold;

        updates.watchdogThreshold = Math.max(threshold, duration * 2);

        try {
            button.disabled = true;

            // The disabled button and the clock's last tick reach the screen before the page stops
            await me.timeout(100);

            const
                before = await canvas.getStats(),
                writes = me.clockWrites;

            await canvas.announceBlock(duration);

            const
                {duration: blocked} = await Neo.main.addon.MainThreadBlocker.block({duration, windowId: me.windowId}),
                clockWrites         = me.clockWrites - writes,
                after               = await canvas.getStats(),
                {clockGap}          = after,
                frames              = after.frames - before.frames,
                // Two ticks in a row may be late; a clock that missed more than that stood
                clock               = clockGap < 500 ? `the app's clock never stopped` : `the app's clock stood for ${(clockGap / 1000).toFixed(1)} s`;

            result.vdom['data-result'] = JSON.stringify({blockedMs: Math.round(blocked), clockGap, clockWrites, frames});
            result.text = `The main thread was blocked for ${(blocked / 1000).toFixed(1)} s. Meanwhile the canvas worker painted ${frames} frames, and ${clock}. The page caught up when its main thread came back.`;

            button.disabled = false
        } finally {
            updates.watchdogThreshold = threshold
        }
    }

    /**
     * How often the clock's text has been set. The app runs in the App Worker, so the count goes on while the
     * main thread is blocked.
     * @member {Number} clockWrites=0
     */
    clockWrites = 0

    /**
     * Starts the clock once the items exist.
     */
    onConstructed() {
        super.onConstructed();
        this.runClock()
    }

    /**
     * @summary Sends the time to the page clock and to the canvas, ten times a second. The page clock is DOM text: a
     * main thread that is busy applies none of these writes. The canvas gets the same value worker to worker and
     * draws it, which is what the visitor watches.
     * @returns {Promise<void>} Ends with this instance
     * @protected
     */
    async runClock() {
        const
            me     = this,
            canvas = me.getReference('canvas'),
            clock  = me.getReference('clock');

        try {
            for (;;) {
                const
                    now  = new Date(),
                    time = `${now.toTimeString().slice(0, 8)}.${Math.floor(now.getMilliseconds() / 100)}`;

                clock.text = `Page clock ${time}`;
                canvas.setClock(time);
                me.clockWrites++;

                await me.timeout(100)
            }
        } catch (error) {
            if (error !== Neo.isDestroyed) {
                throw error
            }
        }
    }
}

export default Neo.setupClass(MainContainer);
