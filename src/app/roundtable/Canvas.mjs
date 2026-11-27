import MotionCanvas from '../MotionCanvas.mjs';

/**
 * @summary The App Worker half of a round table: an offscreen canvas handed to the canvas worker's
 * {@link Neo.canvas.RoundTable} renderer. It draws nothing itself. It hands the renderer its record, its look,
 * whether it is still, and the statement it draws around; each is forwarded alone when it changes, and a canvas
 * that becomes ready receives all of them.
 *
 * The statement is what the scene must leave readable: the components named by `blockIds` (nothing stands in their
 * boxes, and what crosses them is erased) and by `bandIds` (no seat stands in their rows). The host measures them
 * whenever the surface changes, relative to the canvas.
 *
 * Stillness is the motion vocabulary's own verdict: `--neo-duration-base` collapses to `0ms` under
 * `prefers-reduced-motion: reduce` (`resources/css/src/Global.css`), and the canvas reads it from its node each
 * time it mounts or the preference changes. Every mount starts still, and a failed read keeps it still.
 *
 * The measuring and the motion read follow `AgentOS.view.home.Canvas` of `neomjs/neo-agent-institution`.
 *
 * @class Neo.app.roundtable.Canvas
 * @extends Neo.app.MotionCanvas
 * @see Neo.canvas.RoundTable
 */
class Canvas extends MotionCanvas {
    static config = {
        /**
         * @member {String} className='Neo.app.roundtable.Canvas'
         * @protected
         */
        className: 'Neo.app.roundtable.Canvas',
        /**
         * The ids of the components whose rows hold no seat, like a headline that spans the table.
         * @member {String[]} bandIds=[]
         */
        bandIds: [],
        /**
         * The ids of the components nothing stands in: the scene is erased under their boxes.
         * @member {String[]} blockIds=[]
         */
        blockIds: [],
        /**
         * The look the scene is drawn in: `{palettes, measures, pace}`, see {@link Neo.canvas.RoundTable#setLook}.
         * The engine holds no colour, so a table without a look draws nothing.
         * @member {Object|null} look_=null
         * @reactive
         */
        look_: null,
        /**
         * The record the scene replays, see {@link Neo.canvas.RoundTable}, or `null`.
         * @member {Object|null} record_=null
         * @reactive
         */
        record_: null,
        /**
         * A JSON file to load the record from, relative to the App Worker. A file that is missing or holds no
         * record leaves the table without one.
         * @member {String|null} recordUrl_=null
         * @reactive
         */
        recordUrl_: null,
        /**
         * @member {String} rendererClassName='Neo.canvas.RoundTable'
         */
        rendererClassName: 'Neo.canvas.RoundTable',
        /**
         * @member {String} rendererImportPath='src/canvas/RoundTable.mjs'
         */
        rendererImportPath: 'src/canvas/RoundTable.mjs'
    }

    /**
     * The one size listener this host adds to the statement's components, kept so that `destroy()` takes back
     * exactly what `watchStatement()` added.
     * @member {Object|null} statementListener=null
     * @protected
     */
    statementListener = null
    /**
     * Counts the statement's measurements and the graph's lifetimes, so that only the latest measurement of the
     * current graph may answer.
     * @member {Number} statementRead=0
     * @protected
     */
    statementRead = 0
    /**
     * The ids of the statement's components this host already listens to.
     * @member {Set<String>} watched=new Set()
     * @protected
     */
    watched = new Set()

    /**
     * Triggered after the isCanvasReady config got changed: a ready canvas receives every input, and a graph that
     * ends or begins outdates a measurement still in flight.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetIsCanvasReady(value, oldValue) {
        const me = this;

        super.afterSetIsCanvasReady(value, oldValue);
        me.statementRead++;

        if (value && me.renderer) {
            const canvasId = me.getCanvasId(), {windowId} = me;

            me.renderer.setLook({...me.look, canvasId, windowId});
            me.renderer.setMotion({canvasId, still: me.still, windowId});
            me.renderer.setRecord({canvasId, record: me.record, windowId})
        }
    }

    /**
     * Triggered after the look config got changed.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetLook(value, oldValue) {
        const me = this;

        me.isCanvasReady && me.renderer?.setLook({...value, canvasId: me.getCanvasId(), windowId: me.windowId})
    }

    /**
     * @summary Invalidates pending statement measurements on unmount.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        if (!value) this.statementRead++;
        return super.afterSetMounted(value, oldValue)
    }

    /**
     * Triggered after the offscreenRegistered config got changed: a registered canvas starts to follow the
     * statement's components.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetOffscreenRegistered(value, oldValue) {
        await super.afterSetOffscreenRegistered(value, oldValue);
        value && !this.isDestroyed && this.watchStatement()
    }

    /**
     * Triggered after the record config got changed.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        const me = this;

        me.isCanvasReady && me.renderer?.setRecord({canvasId: me.getCanvasId(), record: value, windowId: me.windowId})
    }

    /**
     * Triggered after the recordUrl config got changed: loads the file and takes what it holds as the record.
     * Only the latest url answers. A file that cannot be read leaves the table without a record.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    async afterSetRecordUrl(value, oldValue) {
        const me = this;

        if (value) {
            let record = null;

            try {
                const response = await fetch(value);

                record = response.ok ? await response.json() : null
            } catch {}

            if (!me.isDestroyed && me.recordUrl === value) {
                me.record = record
            }
        }
    }

    /**
     * Triggered after the still config got changed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetStill(value, oldValue) {
        const me = this;

        me.isCanvasReady && me.renderer?.setMotion({canvasId: me.getCanvasId(), still: value, windowId: me.windowId})
    }

    /**
     * @summary Takes the size listeners back from the statement's components: they are not this host's, and one
     * that outlives it would go on calling a host that is gone.
     * @param {...*} args
     */
    destroy(...args) {
        const me = this;

        me.watched.forEach(id => Neo.getComponent(id)?.removeDomListeners(me.statementListener));
        me.watched.clear();

        super.destroy(...args)
    }

    /**
     * @summary Measures the statement 30 ms after the call, so a burst of calls measures once, and hands the
     * renderer the blocks and bands relative to the canvas. A caller that changed the statement calls this once
     * that render has landed. Only the latest measurement of the current graph answers; a read that fails
     * publishes nothing. A table without a statement names an empty one, which is what lets the scene draw.
     * @returns {Promise<void>}
     */
    async measureStatement() {
        const me = this, read = ++me.statementRead, current = () => read === me.statementRead && me.isCanvasReady && !me.isDestroyed;

        await me.timeout(30);

        if (!current() || !me.canvasRect) {
            return
        }

        const {bandIds, blockIds} = me, ids = [...blockIds, ...bandIds];

        let rects = [];

        if (ids.length) {
            try {
                rects = await me.getDomRect(ids) || []
            } catch {
                return
            }
        }

        if (current()) {
            const {x, y} = me.canvasRect, local = rect => rect && {height: rect.height, width: rect.width, x: rect.x - x, y: rect.y - y};

            me.renderer.setQuiet({
                bands   : rects.slice(blockIds.length).map(local).filter(Boolean),
                blocks  : rects.slice(0, blockIds.length).map(local).filter(Boolean),
                canvasId: me.getCanvasId(),
                windowId: me.windowId
            })
        }
    }

    /**
     * @summary The renderer's statistics, as the specs read them; `null` before the canvas is ready.
     * @returns {Promise<Object|null>} See {@link Neo.canvas.RoundTable#getStats}
     */
    async readStats() {
        const me = this;

        return me.isCanvasReady && me.renderer ? me.renderer.getStats({canvasId: me.getCanvasId(), windowId: me.windowId}) : null
    }

    /**
     * @summary Measures the node's viewport rect on every report, then the statement. A ResizeObserver report's
     * contentRect has its origin at 0,0, which would offset every pointer the host's owner hands on in client
     * coordinates by the canvas's place in the window.
     * @param {Object|null} [rect] Not used: the node is measured
     * @returns {Promise<void>}
     */
    async updateSize(rect) {
        await super.updateSize(null);
        this.measureStatement()
    }

    /**
     * @summary Listens to the size of every component the statement names, once each, and measures the statement
     * again when one changes: a web font that arrives after the first measurement wraps a line anew and moves
     * what stands below it, without resizing the canvas.
     */
    watchStatement() {
        const me = this, listener = me.statementListener ??= {resize: me.measureStatement, scope: me};

        [...me.blockIds, ...me.bandIds].forEach(id => {
            const component = Neo.getComponent(id);

            if (component && !me.watched.has(id)) {
                me.watched.add(id);
                component.addDomListeners(listener)
            }
        })
    }
}

export default Neo.setupClass(Canvas);
