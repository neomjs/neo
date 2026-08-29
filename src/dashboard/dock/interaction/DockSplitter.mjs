import Splitter   from '../../../component/Splitter.mjs';
import Operations from '../model/Operations.mjs';
import NeoArray   from '../../../util/Array.mjs';

/**
 * @summary Dock splitter affordance: generic Splitter mechanics, one dock-document semantic commit.
 *
 * The generic parent owns every gesture mechanic — eager DragZone creation and registration,
 * per-gesture refresh, proxy handling, generation fencing, Escape/cancel restoration, and
 * teardown. This class adds ONLY the dock semantics on top: pointer geometry stays runtime-only,
 * the terminal converts captured runtime geometry into one `resizeSplit` or `resizeEdgeZone`
 * descriptor, and
 * the commit flows through `Operations.applyOperation()` or a supplied owning reducer callback.
 * Split-node affordances keep the deferred proxy presentation and register no main-thread resize;
 * edge-zone affordances reuse the generic live sibling-resize path, then commit only its bounded
 * terminal fraction. Live adjacent-pair split preview remains a separate feature seam.
 *
 * The public split vocabulary stays dock-shaped: `orientation` describes the SPLIT NODE
 * (`horizontal` = side-by-side children), which maps onto the generic parent's `direction`
 * (the divider bar axis) as its inverse.
 *
 * @class Neo.dashboard.dock.interaction.DockSplitter
 * @extends Neo.component.Splitter
 * @see Neo.dashboard.dock.projection.LayoutAdapter
 * @see Neo.dashboard.dock.model.Document
 * @see learn/agentos/DockZoneModel.md
 */
class DockSplitter extends Splitter {
    /**
     * @summary The `--dock-splitter-*` contract, projected onto the drag proxy by
     * {@link Neo.dashboard.dock.interaction.DockSplitter#projectProxyTokens}.
     *
     * The SSOT is the `.neo-dashboard` token block in `resources/scss/src/dashboard/Container.scss`;
     * this is a restatement, and a restatement drifts. The guard is the parity spec, which parses
     * that block and fails when the two sets diverge — so an engine token added without a line here
     * turns a test red instead of silently dropping out of every drag proxy.
     * @member {String[]} proxyProjectedTokens
     * @static
     */
    static proxyProjectedTokens = [
        '--dock-splitter-background',
        '--dock-splitter-background-active',
        '--dock-splitter-background-hover',
        '--dock-splitter-handle-color',
        '--dock-splitter-handle-color-active',
        '--dock-splitter-handle-color-hover',
        '--dock-splitter-handle-glow-hover',
        '--dock-splitter-handle-size',
        '--dock-splitter-handle-thickness',
        '--dock-splitter-radius',
        '--dock-splitter-ring',
        '--dock-splitter-ring-active',
        '--dock-splitter-ring-hover'
    ]

    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.interaction.DockSplitter'
         * @protected
         */
        className: 'Neo.dashboard.dock.interaction.DockSplitter',
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
         * Callback for an owning dashboard reducer. Receives `(descriptor, splitter)`.
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
         * Current committed dock-zone document. Used when no reducer callback is supplied.
         * @member {Object|null} dockZoneDocument_=null
         * @reactive
         */
        dockZoneDocument_: null,
        /**
         * View-sync callback. Notified after a successful local document commit; an edge-terminal
         * rejection receives the unchanged committed document so its main-thread preview is restored.
         * @member {Function|null} onDockZoneDocumentChange=null
         */
        onDockZoneDocumentChange: null,
        /**
         * Split orientation from the dock-zone model (`horizontal` means side-by-side children).
         * Maps onto the generic `direction` config as its inverse.
         * @member {String} orientation_='horizontal'
         * @reactive
         */
        orientation_: 'horizontal',
        /**
         * Visual splitter extent in px (default override of the inherited reactive config).
         * @member {Number} size=6
         */
        size: 6,
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
     * @summary Carries the splitter's resolved paint onto its drag proxy, which mounts outside the
     * cascade that produced it.
     *
     * The proxy is a clone mounted at `document.body` ({@link Neo.draggable.DragZone#proxyParentId}),
     * so it keeps the splitter's classes and loses every ancestor. That breaks the paint twice over:
     * the engine declares its `--dock-splitter-*` defaults on `.neo-dashboard`, and each consumer
     * declares its values as a DESCENDANT rule. Detached from both, every token resolves empty and
     * the proxy renders transparent with a zero-sized handle — the affordance disappears at exactly
     * the moment it is telling the user they are moving something.
     *
     * Reading the SOURCE element's computed values is what makes this consumer-agnostic: the source
     * has already been through the real cascade, so the projection never needs to know which class
     * carried a value or how deeply it was nested.
     *
     * Best-effort by contract: a failed read must never block a drag. Losing the paint costs an
     * affordance; throwing here would cost the gesture.
     *
     * @returns {Promise<void>}
     * @protected
     */
    async projectProxyTokens() {
        let me = this;

        try {
            const styles = await Neo.main.DomAccess.getComputedStyle({
                id   : me.id,
                style: DockSplitter.proxyProjectedTokens
            });

            const projected = Object.entries(styles || {}).reduce((acc, [token, value]) => {
                // An unresolved custom property reads as an empty string. Projecting it would pin
                // the proxy to "explicitly nothing" and shadow the engine floor it could otherwise
                // still inherit, so an absent value must stay absent.
                value?.trim() && (acc[token] = value.trim());
                return acc
            }, {});

            Object.keys(projected).length > 0 && me.dragZone?.set({
                dragProxyConfig: {
                    ...(me.dragZone.dragProxyConfig || {}),
                    style: {
                        ...(me.dragZone.dragProxyConfig?.style || {}),
                        ...projected
                    }
                }
            })
        } catch {
            // Unmounted, destroyed, or a main-thread round trip that lost its node: the drag
            // proceeds unpainted rather than not at all.
        }
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
     * Maps the dock split orientation onto the generic divider direction (its inverse) and keeps
     * the dock modifier class in sync. The parent's `afterSetDirection` then owns the axis
     * dimension pair and the per-gesture DragZone refresh.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetOrientation(value, oldValue) {
        let me          = this,
            orientation = me.getValidatedOrientation(value),
            cls         = me.cls || [];

        if (oldValue) {
            NeoArray.remove(cls, `neo-dashboard-dock-splitter-${oldValue}`);
            me.cls = cls
        }

        // dock 'horizontal' (side-by-side children) = a vertical divider bar
        me.direction = orientation === 'vertical' ? 'horizontal' : 'vertical'
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
     * Captures the parent axis plus child sizes at drag start. Split terminals stay model-order
     * based; edge terminals normalize their CSS-bounded pixel result against the same parent box.
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
            clientX   : data.clientX,
            clientY   : data.clientY,
            parentSize: Number(rects[0]?.[axis]),
            sizes
        };

        return me.dragStartState
    }

    /**
     * @param {Object} descriptor
     * @returns {{document:(Object|null), errors:String[]}}
     * @protected
     */
    commitResizeOperation(descriptor) {
        let me     = this,
            result = null;

        if (typeof me.applyDockZoneOperation === 'function') {
            result = me.applyDockZoneOperation(descriptor, me) || null
        } else if (me.dockZoneDocument) {
            result = Operations.applyOperation(me.dockZoneDocument, descriptor)
        }

        if (!result) {
            result = {
                document: me.dockZoneDocument,
                errors  : ['DockSplitter requires `dockZoneDocument` or `applyDockZoneOperation` to commit a resize operation.']
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
     * @summary Creates the one semantic resize descriptor matching this projected affordance.
     * @param {Object} data Main-thread terminal payload.
     * @returns {Object}
     * @protected
     */
    createResizeDescriptor(data={}) {
        return this.isEdgeZoneResize()
            ? Neo.dashboard.dock.projection.LayoutAdapter.createResizeEdgeZoneOperation(this, this.resolveEdgeExtent(data))
            : this.createResizeSplitDescriptor(data)
    }

    /**
     * @param {Object} data
     * @returns {Object}
     * @protected
     */
    createResizeSplitDescriptor(data={}) {
        return Neo.dashboard.dock.projection.LayoutAdapter.createResizeSplitOperation(this, this.resolveSizeVector(data))
    }

    /**
     * Split-node affordances register no main-thread resize: the committed document is the sole size
     * authority, so the deferred proxy presentation carries the gesture and the terminal commits
     * semantically. Edge affordances use the inherited main-thread descriptor because their adjacent
     * band must preview live under CSS min/max bounds; only the normalized terminal enters the document.
     * @returns {Object|null}
     * @protected
     */
    getResizeConfig() {
        return this.isEdgeZoneResize() ? super.getResizeConfig() : null
    }

    /**
     * @summary Whether this projection commits the extent of an edge-zone descriptor.
     * @returns {Boolean}
     * @protected
     */
    isEdgeZoneResize() {
        return this.data?.operation === 'resizeEdgeZone'
            || (typeof this.edgeZoneId === 'string' && typeof this.edge === 'string')
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
     * The orientation modifier rides the read-time class union rather than a stored cls write:
     * construct-order between this class's configs and the inherited direction processing must
     * never decide whether the paint-bearing modifier exists.
     * @returns {String[]}
     */
    getBaseClass() {
        const result = super.getBaseClass();

        result.push(`neo-dashboard-dock-splitter-${this.getValidatedOrientation(this.orientation)}`);

        return result
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
     * The dock terminal: generic teardown first (generation fence, presentation restore, zone
     * end), then EXACTLY one semantic commit derived from captured runtime geometry — never a
     * sibling `wrapperStyle` write, which is the generic parent's terminal and stays overridden here.
     * @param {Object} data
     * @returns {Object}
     */
    onDragEnd(data={}) {
        let me         = this,
            hasCapture = Boolean(me.dragStartState) || Array.isArray(data.sizes),
            descriptor = null,
            result;

        me.dragGeneration++;
        me.cleanupResize();
        me.dragZone?.dragEnd(data);

        if (data.cancelled) {
            me.dragStartState = null;
            return {document: me.dockZoneDocument, errors: []}
        }

        // The end-overtakes-start race: a real-pointer release can land while the async start
        // path is still capturing. A terminal without capture state (and no explicit vector) is
        // not a gesture — committing would write a zero-delta operation; reject loudly instead.
        if (!hasCapture) {
            result = {
                document: me.dockZoneDocument ?? null,
                errors  : ['DockSplitter received a terminal without capture state; no semantic resize was committed.']
            }
        } else {
            descriptor = me.createResizeDescriptor(data);
            result     = me.commitResizeOperation(descriptor);

            // Main-thread live resize intentionally retains its terminal pixels on success. A rejected
            // semantic edge descriptor owns no such pixels, so re-project the unchanged committed document
            // through the existing view-sync seam to restore the prior band geometry.
            if (me.isEdgeZoneResize() && result.errors?.length && typeof me.onDockZoneDocumentChange === 'function') {
                me.onDockZoneDocumentChange(me.dockZoneDocument, descriptor, me)
            }
        }

        me.fire(result.errors?.length ? 'dockSplitterResizeRejected' : 'dockSplitterResize', {
            descriptor,
            result,
            splitter: me
        });

        me.dragStartState = null;

        return result
    }

    /**
     * Clears the dock-only geometry snapshot when Escape closes the logical gesture. The generic
     * parent restores presentation; the native sensor suppresses its later drag:end after cancel,
     * so this state cannot rely on the cancelled onDragEnd() branch for retirement.
     * @param {Object} data
     * @protected
     */
    onDragCancel(data={}) {
        super.onDragCancel(data);
        this.dragStartState = null
    }

    /**
     * Captures the adjacent-pair geometry and projects the proxy paint BEFORE the generic parent
     * refreshes the zone and starts the gesture (the proxy is created inside the parent's start).
     * The armed generation fences those awaits: the parent arms its own fence only inside
     * `super.onDragStart()`, so a cancel, destroy, terminal, or newer start landing during the
     * capture/projection awaits must invalidate the pending start here, before the real gesture
     * can open. Taking the increment (not a read) makes a superseded start bail without ever
     * opening the zone.
     * @param {Object} data
     */
    async onDragStart(data={}) {
        let me         = this,
            generation = ++me.dragGeneration;

        await me.captureDragStart(data);
        await me.projectProxyTokens();

        if (generation !== me.dragGeneration || me.isDestroyed) {
            me.dragStartState = null;
            return
        }

        await super.onDragStart(data)
    }

    /**
     * @summary Normalizes the CSS-bounded terminal pixel size against the captured parent axis.
     * @param {Object} data Main-thread terminal payload.
     * @returns {Number} Fractional extent; invalid geometry deliberately reaches the reducer as `NaN`.
     * @protected
     */
    resolveEdgeExtent(data={}) {
        const parentSize = Number(this.dragStartState?.parentSize),
              size       = Number(data.resizeSize);

        return Number.isFinite(parentSize) && parentSize > 0 && Number.isFinite(size)
            ? size / parentSize
            : Number.NaN
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
