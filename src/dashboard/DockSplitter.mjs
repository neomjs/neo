import Component     from '../component/Base.mjs';
import DragZone      from '../draggable/DragZone.mjs';
import DockZoneModel from './DockZoneModel.mjs';
import NeoArray      from '../util/Array.mjs';

/**
 * @summary Runtime splitter affordance that converts drag completion into a `resizeSplit` operation.
 *
 * `Neo.component.Splitter` resizes sibling styles directly. The dock-zone model is persisted JSON, so
 * this component keeps pointer geometry runtime-only and commits through `DockZoneModel.applyOperation()`
 * or a supplied owning reducer callback.
 *
 * @class Neo.dashboard.DockSplitter
 * @extends Neo.component.Base
 * @see Neo.dashboard.DockLayoutAdapter
 * @see Neo.dashboard.DockZoneModel
 * @see learn/agentos/HarnessDockZoneModel.md
 */
class DockSplitter extends Component {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockSplitter'
         * @protected
         */
        className: 'Neo.dashboard.DockSplitter',
        /**
         * @member {String} ntype='dashboard-dock-splitter'
         * @protected
         */
        ntype: 'dashboard-dock-splitter',
        /**
         * @member {String[]} baseCls=['neo-dashboard-dock-splitter','neo-draggable']
         */
        baseCls: ['neo-dashboard-dock-splitter', 'neo-draggable'],
        /**
         * Callback for an owning Harness/dashboard reducer. Receives `(descriptor, splitter)`.
         * @member {Function|null} applyDockZoneOperation=null
         */
        applyDockZoneOperation: null,
        /**
         * Index of the split boundary between adjacent model children.
         * @member {Number|null} boundaryIndex_=null
         * @reactive
         */
        boundaryIndex_: null,
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
         * Current committed dock-zone document. Used when no reducer callback is supplied.
         * @member {Object|null} dockZoneDocument_=null
         * @reactive
         */
        dockZoneDocument_: null,
        /**
         * Notified after a successful local document commit.
         * @member {Function|null} onDockZoneDocumentChange=null
         */
        onDockZoneDocumentChange: null,
        /**
         * Split orientation from the dock-zone model (`horizontal` means side-by-side children).
         * @member {String} orientation_='horizontal'
         * @reactive
         */
        orientation_: 'horizontal',
        /**
         * Visual splitter extent in px.
         * @member {Number} size_=6
         * @reactive
         */
        size_: 6,
        /**
         * Dock-zone split node id.
         * @member {String|null} splitNodeId_=null
         * @reactive
         */
        splitNodeId_: null
    }

    /**
     * @member {Object|null} dragStartState=null
     * @protected
     */
    dragStartState = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {'drag:end'  : me.onDragEnd,   scope: me},
            {'drag:start': me.onDragStart, scope: me}
        ])
    }

    /**
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetBoundaryIndex(value, oldValue) {
        this.data = {
            ...(this.data || {}),
            boundaryIndex: value
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetOrientation(value, oldValue) {
        let me          = this,
            orientation = me.getValidatedOrientation(value),
            cls         = me.cls || [],
            height      = orientation === 'vertical' ? me.size : null,
            width       = orientation === 'vertical' ? null    : me.size;

        if (oldValue) {
            NeoArray.remove(cls, `neo-dashboard-dock-splitter-${oldValue}`)
        }

        NeoArray.add(cls, `neo-dashboard-dock-splitter-${orientation}`);

        me.set({
            cls,
            height,
            minHeight: height,
            minWidth : width,
            width
        })
    }

    /**
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetSize(value, oldValue) {
        let me     = this,
            height = me.getValidatedOrientation(me.orientation) === 'vertical' ? value : null,
            width  = height === null ? value : null;

        me.set({
            height,
            minHeight: height,
            minWidth : width,
            width
        })
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetSplitNodeId(value, oldValue) {
        this.data = {
            ...(this.data || {}),
            dockNodeId : value,
            splitNodeId: value
        }
    }

    /**
     * Captures child sizes at drag start so drag completion can stay model-order based.
     * @param {Object} data
     * @returns {Promise<Object>}
     */
    async captureDragStart(data={}) {
        let me       = this,
            children = me.getSplitChildItems(),
            ids      = [me.parent?.id, ...children.map(item => item.id)].filter(Boolean),
            rects    = [],
            axis     = me.getSizeAxis(),
            sizes;

        if (ids.length && me.parent?.getDomRect) {
            try {
                rects = await me.parent.getDomRect(ids)
            } catch (error) {
                rects = []
            }
        }

        sizes = children.map((item, index) => {
            let rect  = rects[index + 1],
                value = rect?.[axis];

            return Number.isFinite(value) && value > 0 ? value : Number(item.flex) || 1
        });

        me.dragStartState = {
            clientX: data.clientX,
            clientY: data.clientY,
            sizes
        };

        return me.dragStartState
    }

    /**
     * @param {Object} descriptor
     * @returns {{document:(Object|null), errors:String[]}}
     * @protected
     */
    commitResizeSplit(descriptor) {
        let me     = this,
            result = null;

        if (typeof me.applyDockZoneOperation === 'function') {
            result = me.applyDockZoneOperation(descriptor, me) || null
        } else if (me.dockZoneDocument) {
            result = DockZoneModel.applyOperation(me.dockZoneDocument, descriptor)
        }

        if (!result) {
            result = {
                document: me.dockZoneDocument,
                errors  : ['DockSplitter requires `dockZoneDocument` or `applyDockZoneOperation` to commit resizeSplit.']
            }
        }

        if (!result.errors?.length && result.document) {
            me.dockZoneDocument = result.document;

            if (typeof me.onDockZoneDocumentChange === 'function') {
                me.onDockZoneDocumentChange(result.document, descriptor, me)
            }
        }

        return result
    }

    /**
     * @param {Object} data
     * @returns {Object}
     * @protected
     */
    createResizeSplitDescriptor(data={}) {
        return Neo.dashboard.DockLayoutAdapter.createResizeSplitOperation(this, this.resolveSizeVector(data))
    }

    /**
     * @returns {String}
     * @protected
     */
    getCursorStyle() {
        return this.getValidatedOrientation(this.orientation) === 'vertical'
            ? 'ns-resize !important'
            : 'ew-resize !important'
    }

    /**
     * @returns {String}
     * @protected
     */
    getSizeAxis() {
        return this.getValidatedOrientation(this.orientation) === 'vertical' ? 'height' : 'width'
    }

    /**
     * @returns {Object[]}
     * @protected
     */
    getSplitChildItems() {
        return (this.parent?.items || []).filter(item => item && item.dockNodeType !== 'splitter')
    }

    /**
     * @param {String} orientation
     * @returns {String}
     * @protected
     */
    getValidatedOrientation(orientation) {
        return orientation === 'vertical' ? 'vertical' : 'horizontal'
    }

    /**
     * @param {Object} data
     * @returns {Object}
     */
    onDragEnd(data={}) {
        let me         = this,
            descriptor = me.createResizeSplitDescriptor(data),
            result;

        if (me.parent) {
            me.parent.disabled = false
        }

        if (me.dragZone) {
            me.dragZone.dragEnd(data)
        }

        me.style = {
            ...(me.style || {}),
            opacity: 1
        };

        result = me.commitResizeSplit(descriptor);

        me.fire(result.errors?.length ? 'dockSplitterResizeRejected' : 'dockSplitterResize', {
            descriptor,
            result,
            splitter: me
        });

        me.dragStartState = null;

        return result
    }

    /**
     * @param {Object} data
     */
    async onDragStart(data={}) {
        let me         = this,
            orientation = me.getValidatedOrientation(me.orientation),
            vertical    = orientation === 'vertical';

        if (me.parent) {
            me.parent.disabled = true
        }

        if (!me.dragZone) {
            me.dragZone = Neo.create({
                module             : DragZone,
                appName            : me.appName,
                bodyCursorStyle    : me.getCursorStyle(),
                boundaryContainerId: me.parent?.id,
                dragElement        : me.vdom,
                moveHorizontal     : !vertical,
                moveVertical       : vertical,
                owner              : me,
                useProxyWrapper    : false,
                windowId           : me.windowId,
                ...me.dragZoneConfig
            })
        } else {
            me.dragZone.set({
                bodyCursorStyle: me.getCursorStyle(),
                moveHorizontal : !vertical,
                moveVertical   : vertical
            })
        }

        await me.captureDragStart(data);
        await me.dragZone.dragStart(data);

        me.style = {
            ...(me.style || {}),
            opacity: 0.5
        }
    }

    /**
     * @param {Object} data
     * @returns {Number[]|null}
     * @protected
     */
    resolveSizeVector(data={}) {
        if (Array.isArray(data.sizes)) {
            return data.sizes.slice()
        }

        let me             = this,
            boundaryIndex  = Number(me.boundaryIndex ?? me.data?.boundaryIndex),
            dragStartState = me.dragStartState,
            sizes          = dragStartState?.sizes?.map(Number) || me.getSplitChildItems().map(item => Number(item.flex) || 1),
            coordinate     = me.getValidatedOrientation(me.orientation) === 'vertical' ? 'clientY' : 'clientX',
            start          = Number(dragStartState?.[coordinate]),
            end            = Number(data[coordinate]),
            delta          = Number.isFinite(start) && Number.isFinite(end) ? end - start : 0,
            output         = sizes.slice();

        if (!Number.isInteger(boundaryIndex) || boundaryIndex < 0 || boundaryIndex + 1 >= output.length) {
            return null
        }

        output[boundaryIndex]     += delta;
        output[boundaryIndex + 1] -= delta;

        return output
    }
}

export default Neo.setupClass(DockSplitter);
