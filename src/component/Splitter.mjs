import Component from './Base.mjs';
import DragZone  from '../draggable/DragZone.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * Splitters can get put into containers to make siblings resizable via drag & drop
 * @class Neo.component.Splitter
 * @extends Neo.component.Base
 */
class Splitter extends Component {
    /**
     * Valid values for direction
     * @member {String[]} directions=['horizontal','vertical']
     * @protected
     * @static
     */
    static directions = ['horizontal', 'vertical']
    /**
     * Valid values for resizeTarget
     * @member {String[]} resizeTargets=['next','previous']
     * @protected
     * @static
     */
    static resizeTargets = ['next', 'previous']

    static config = {
        /**
         * @member {String} className='Neo.component.Splitter'
         * @protected
         */
        className: 'Neo.component.Splitter',
        /**
         * @member {String} ntype='splitter'
         * @protected
         */
        ntype: 'splitter',
        /**
         * @member {String[]} baseCls=['neo-splitter','neo-draggable']
         */
        baseCls: ['neo-splitter', 'neo-draggable'],
        /**
         * Either 'horizontal' or 'vertical'
         * @member {String} direction_='vertical'
         * @reactive
         */
        direction_: 'vertical',
        /**
         * @member {Neo.draggable.DragZone|null} dragZone=null
         * @protected
         */
        dragZone: null,
        /**
         * @member {Object|null} dragZoneConfig=null
         */
        dragZoneConfig: null,
        /**
         * True resizes the selected sibling throughout the pointer gesture. False preserves the
         * proxy-first interaction and applies the resolved size on drag:end.
         * @member {Boolean} liveResize_=false
         * @reactive
         */
        liveResize_: false,
        /**
         * Choose which sibling to resize
         * Valid values: 'next' or 'previous'
         * @member {String} resizeTarget_='next'
         * @reactive
         */
        resizeTarget_: 'next',
        /**
         * Either height or with, depending on the direction.
         * Defaults to px
         * @member {Number} size_=10
         * @reactive
         */
        size_: 10
    }

    /**
     * Monotonic token which invalidates an asynchronous DragZone start after end, cancel, or destroy.
     * @member {Number} dragGeneration=0
     * @protected
     */
    dragGeneration = 0

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {'drag:end'  : me.onDragEnd,   scope: me},
            {'drag:start': me.onDragStart, scope: me}
        ]);

        me.createDragZone()
    }

    /**
     * Commits one main-thread-resolved size to the layout-owned sibling wrapper.
     * @param {Number} value
     * @param {String} axis
     * @param {String} targetId
     * @returns {Boolean}
     * @protected
     */
    applyResize(value, axis, targetId) {
        let me      = this,
            sibling = targetId
                ? me.parent?.items.find(item => me.getLayoutElementId(item) === targetId)
                : me.getResizeSibling();

        if (!sibling || !Number.isFinite(value) || !['height', 'width'].includes(axis)) {
            return false
        }

        sibling.wrapperStyle = {
            ...(sibling.wrapperStyle || {}),
            flex  : 'none',
            [axis]: `${value}px`
        };

        return true
    }

    /**
     * Creates and registers the shared gesture controller before the first pointer interaction.
     * @returns {Neo.draggable.DragZone}
     * @protected
     */
    createDragZone() {
        let me       = this,
            vertical = me.direction === 'vertical';

        me.dragZone = Neo.create({
            module: DragZone,
            ...me.dragZoneConfig,
            appName            : me.appName,
            bodyCursorStyle    : me.getCursorStyle(),
            boundaryContainerId: me.parentId,
            dragElement        : me.vdom,
            moveHorizontal     : vertical,
            moveVertical       : !vertical,
            owner              : me,
            resizeConfig       : me.getResizeConfig(),
            useProxy           : !me.liveResize,
            useProxyWrapper    : false,
            windowId           : me.windowId
        });

        me.dragZone.on('dragCancel', me.onDragCancel, me);

        return me.dragZone
    }

    /**
     * Clears App-Worker presentation state. Transient target geometry is main-thread-owned.
     * @protected
     */
    cleanupResize() {
        let me = this;

        if (me.parent) {
            me.parent.disabled = false
        }

        me.style = {...(me.style || {}), opacity: 1}
    }

    /**
     * Destroys the owned DragZone so its main-thread registration cannot outlive the Splitter.
     * @param {...*} args
     */
    destroy(...args) {
        let me         = this,
            {dragZone} = me;

        me.dragGeneration++;
        me.cleanupResize();

        if (dragZone && !dragZone.isDestroyed) {
            dragZone.dragProxy && dragZone.dragEnd({cancelled: true});
            dragZone.destroy()
        }

        me.dragZone = null;

        super.destroy(...args)
    }

    /**
     * Returns the cursor matching the current resize axis.
     * @returns {String}
     * @protected
     */
    getCursorStyle() {
        return this.direction === 'vertical' ? 'ew-resize !important' : 'ns-resize !important'
    }

    /**
     * Returns the outer DOM node which participates in the parent layout. Components with a custom
     * VDOM root keep their public id on an inner node and use the top-level VDOM node as a wrapper.
     * @param {Neo.component.Base} component
     * @returns {String}
     * @protected
     */
    getLayoutElementId(component) {
        return component.vdom?.id || component.id
    }

    /**
     * Builds the main-thread-only descriptor for the current target and resize axis.
     * @returns {Object|null}
     * @protected
     */
    getResizeConfig() {
        let me      = this,
            parent  = me.parent,
            sibling = me.getResizeSibling();

        if (!parent || !sibling) return null;

        return {
            axis        : me.direction === 'vertical' ? 'width' : 'height',
            parentId    : me.getLayoutElementId(parent),
            preview     : me.liveResize,
            resizeNext  : me.resizeTarget === 'next',
            splitterSize: me.size,
            targetId    : me.getLayoutElementId(sibling)
        }
    }

    /**
     * Returns the configured sibling target, if the Splitter still has one.
     * @returns {Neo.component.Base|null}
     * @protected
     */
    getResizeSibling() {
        let me     = this,
            parent = me.parent,
            index  = parent?.indexOf(me);

        return Number.isInteger(index) ? parent.items[me.resizeTarget === 'next' ? index + 1 : index - 1] || null : null
    }

    /**
     * Refreshes per-gesture facts while preserving the eagerly registered DragZone identity.
     * @returns {Promise<void>}
     * @protected
     */
    async refreshDragZone() {
        let me       = this,
            vertical = me.direction === 'vertical';

        if (!me.dragZone || me.dragZone.isDestroyed) return;

        me.dragZone.set({
            bodyCursorStyle    : me.getCursorStyle(),
            boundaryContainerId: me.parentId,
            dragElement        : me.vdom,
            moveHorizontal     : vertical,
            moveVertical       : !vertical,
            resizeConfig       : me.getResizeConfig(),
            useProxy           : !me.liveResize,
            windowId           : me.windowId
        });

        await me.dragZone.registerZone()
    }

    /**
     * Registers only after the complete sibling set exists, closing the first-gesture handshake gap.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        if (!this.isDestroyed) {
            await this.refreshDragZone()
        }
    }

    /**
     * Triggered after the direction config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDirection(value, oldValue) {
        let me          = this,
            {cls, size} = me,
            height      = value === 'vertical' ? null : size,
            width       = value !== 'vertical' ? null : size;

        NeoArray.add(cls, `neo-${value}`);

        if (oldValue) {
            NeoArray.remove(cls, `neo-${oldValue}`)
        }

        me.set({
            cls,
            height,
            minHeight: height,
            minWidth : width,
            width
        });

        me.dragZone && me.refreshDragZone()
    }

    /**
     * Keeps the DragZone embodiment mode aligned with the public interaction mode.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetLiveResize(value, oldValue) {
        if (this.dragZone) {
            this.refreshDragZone()
        }
    }

    /**
     * Refreshes the main-thread target descriptor after the selected sibling changes.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetResizeTarget(value, oldValue) {
        this.dragZone && this.refreshDragZone()
    }

    /**
     * Triggered after the size config got changed
     * @param {Boolean|null} value
     * @param {Boolean|null} oldValue
     * @protected
     */
    afterSetSize(value, oldValue) {
        this[this.direction === 'vertical' ? 'width' : 'height'] = value;
        this.dragZone && this.refreshDragZone()
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        let {dragZone} = this;

        if (dragZone) {
            dragZone.windowId = value;
            this.refreshDragZone()
        }
    }

    /**
     * Triggered before the direction config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String}
     */
    beforeSetDirection(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'direction')
    }

    /**
     * Triggered before the resizeTarget config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String}
     */
    beforeSetResizeTarget(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'resizeTarget')
    }

    /**
     * @param {Object} data
     */
    onDragEnd(data) {
        let me = this;

        me.dragGeneration++;

        if (!data.cancelled) {
            me.applyResize(Number(data.resizeSize), data.resizeAxis, data.resizeTargetId)
        }

        me.cleanupResize();
        me.dragZone.dragEnd(data)
    }

    /**
     * Restores owner and target state when Escape terminates the logical gesture before drag:end.
     * @param {Object} data
     * @protected
     */
    onDragCancel(data) {
        this.dragGeneration++;
        this.cleanupResize()
    }

    /**
     * @param data
     */
    async onDragStart(data) {
        let me         = this,
            generation = ++me.dragGeneration;

        await me.refreshDragZone();

        if (me.dragZone.useProxy) {
            me.parent.disabled = true
        }

        await me.dragZone.dragStart(data);

        if (generation !== me.dragGeneration || me.isDestroyed) {
            !me.dragZone.isDestroyed && me.dragZone.dragEnd({cancelled: true});
            return
        }

        if (me.dragZone.useProxy) {
            me.style = {...(me.style || {}), opacity: 0.5}
        }
    }
}

export default Neo.setupClass(Splitter);
