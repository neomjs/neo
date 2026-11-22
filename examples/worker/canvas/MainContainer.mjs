import Button        from '../../../src/button/Base.mjs';
import Component     from '../../../src/component/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import PointsCanvas  from './PointsCanvas.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @summary The proof that a blocked main thread does not stop the picture. A million points move in a canvas the
 * canvas worker draws. One button blocks the page's main thread for five seconds: the clock, which is DOM text,
 * stands still, and the points keep moving. Afterwards the page says how long the main thread was away and how many
 * frames the canvas worker painted in that time.
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
                    {tag: 'h1', cls: ['neo-examples-worker-canvas-title'],       text: 'Stop the main thread'},
                    {tag: 'p',  cls: ['neo-examples-worker-canvas-instruction'], text: 'Press the button. The clock is text in the page and stands still for five seconds. The points are drawn in a canvas worker and keep moving.'}
                ]}
            }, {
                module   : Component,
                cls      : ['neo-examples-worker-canvas-clock'],
                reference: 'clock',
                text     : 'Page clock'
            }, {
                module   : Button,
                handler  : 'up.onBlockButtonClick',
                iconCls  : 'fa-solid fa-hand',
                reference: 'block-button',
                text     : 'Block the main thread for 5 s'
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
     * @param {Object} data
     */
    async onBlockButtonClick(data) {
        const
            me       = this,
            button   = data.component,
            canvas   = me.getReference('canvas'),
            result   = me.getReference('result'),
            duration = me.blockDuration;

        button.disabled = true;

        // The disabled button and the clock's last tick reach the screen before the page stops
        await me.timeout(100);

        const before = await canvas.getStats();

        await canvas.announceBlock(duration);

        const
            {duration: blocked} = await Neo.main.addon.MainThreadBlocker.block({duration, windowId: me.windowId}),
            frames              = (await canvas.getStats()).frames - before.frames;

        result.vdom['data-result'] = JSON.stringify({blockedMs: Math.round(blocked), frames});
        result.text = `The main thread was blocked for ${(blocked / 1000).toFixed(1)} s. In that time the canvas worker painted ${frames} frames.`;

        button.disabled = false
    }

    /**
     * Starts the clock once the items exist.
     */
    onConstructed() {
        super.onConstructed();
        this.runClock()
    }

    /**
     * @summary Writes the time into the clock ten times a second, as DOM text. A main thread that is busy applies
     * none of these writes, which is what the visitor watches.
     * @returns {Promise<void>} Ends with this instance
     * @protected
     */
    async runClock() {
        const
            me    = this,
            clock = me.getReference('clock');

        try {
            for (;;) {
                const now = new Date();

                clock.text = `Page clock ${now.toTimeString().slice(0, 8)}.${Math.floor(now.getMilliseconds() / 100)}`;

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
