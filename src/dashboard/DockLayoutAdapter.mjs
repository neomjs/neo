import Base               from '../core/Base.mjs';
import DockRail           from './DockRail.mjs';
import DockSplitter       from './DockSplitter.mjs';
import DockTabEnterButton from './DockTabEnterButton.mjs';
import DockTabSortZone    from './DockTabSortZone.mjs';
import DockZoneModel      from './DockZoneModel.mjs';
import TabOverflowPlugin  from '../tab/plugin/Overflow.mjs';

// Private runtime restoration slot for live component instances projected through the popup
// stack grip. Symbol-keyed so it can never collide with application config or persisted data.
const stackHeaderSource = Symbol('dockStackHeaderSource');

/**
 * @summary Projects dock-zone model nodes into existing Neo layout and tab configs.
 *
 * The adapter consumes committed dock-zone state only. Transient drag preview fields such as `dockPreview`,
 * pointer coordinates, window geometry, or DOM rectangles belong to the drag/drop pipeline and are rejected here.
 *
 * @class Neo.dashboard.DockLayoutAdapter
 * @extends Neo.core.Base
 * @see learn/agentos/DockZoneModel.md
 */
class DockLayoutAdapter extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockLayoutAdapter'
         * @protected
         */
        className: 'Neo.dashboard.DockLayoutAdapter'
    }

    /**
     * Default visual extent for projected splitter affordances.
     * @member {Number} splitterSize=6
     * @protected
     * @static
     */
    static splitterSize = 6

    /**
     * Builds a recoverable placeholder config for a dock item whose live component and blueprint cannot be resolved.
     * @param {String} itemId
     * @param {Object|null} item
     * @returns {Object}
     * @protected
     * @static
     */
    static createPlaceholder(itemId, item) {
        let title = item?.title || itemId;

        return {
            cls : ['neo-dashboard-dock-placeholder'],
            data: {
                componentRef       : item?.componentRef || null,
                dockItemId         : itemId,
                missingComponentRef: true
            },
            dockItemId: itemId,
            header    : {text: title, dockItemId: itemId},
            ntype     : 'dashboard-panel'
        }
    }

    /**
     * Returns a cloned config object for JSON-compatible configs.
     * @param {*} value
     * @returns {*}
     * @protected
     * @static
     */
    static cloneConfig(value) {
        if (Array.isArray(value)) {
            return value.map(item => this.cloneConfig(item))
        }

        if (value && value.constructor === Object) {
            let clone = {};

            Object.entries(value).forEach(([key, val]) => {
                clone[key] = this.cloneConfig(val)
            });

            return clone
        }

        return value
    }

    /**
     * Decorates a resolved component config with stable dock-item metadata without mutating the source item record.
     * @param {*} component
     * @param {String} itemId
     * @param {Object} item
     * @returns {*}
     * @protected
     * @static
     */
    static decorateItemConfig(component, itemId, item) {
        if (!component || component.constructor !== Object) {
            return component
        }

        let config = {...component},
            data   = {...(config.data || {})};

        data.componentRef = item?.componentRef || null;
        data.dockItemId   = itemId;

        config.data       = data;
        config.dockItemId = itemId;
        // The stamp must reach the HEADER too: tab.Container builds each header button from this
        // object, so the button instance then carries the identity structurally — the keyboard
        // focus path never has to map header position back into document order. (Live panes skip
        // this decorator by design; their identity resolves through the committed document.)
        config.header     = {
            ...(config.header || {text: item?.title || itemId}),
            dockItemId: itemId
        };

        return config
    }

    /**
     * @summary Applies adapter-owned item metadata and one-use add-tab decoration to a pane config.
     *
     * Reconciliation discovers live panes before consulting its app resolver. When a pane is genuinely
     * absent, this helper lets that resolver prepare the same config the normal projection path
     * would have emitted without copying dashboard-owned header policy into the consuming workspace.
     * Add-tab animation remains plain-config-only. The stack handle also supports a LIVE component
     * instance through a symbol-keyed runtime header overlay whose exact prior ownership/value is
     * restored as soon as that instance projects without the handle; the popup affordance therefore
     * cannot leak into the main workspace or persisted item state.
     * @param {*} component Resolved pane config or live component instance.
     * @param {String} itemId Stable item identity.
     * @param {Object} item Persisted item record.
     * @param {Object} [options={}]
     * @param {String|null} [options.nodeId=null] Owning projected tabs-node id.
     * @param {Boolean} [options.stackHandle=false] Decorate this exact header with the runtime grip.
     * @param {Object|null} [options.tabInsertDescriptor=null] One-use normalized `addTab` correlation.
     * @returns {*}
     * @static
     */
    static decorateProjectedItem(component, itemId, item, {nodeId=null, stackHandle=false, tabInsertDescriptor=null}={}) {
        let config = this.decorateItemConfig(component, itemId, item),
            header;

        if (config instanceof Base) {
            let source = config[stackHeaderSource];

            if (stackHandle) {
                source ||= config[stackHeaderSource] = {
                    hadOwn: Object.hasOwn(config, 'header'),
                    value : config.header
                };
                config.header = this.createStackHeader(source.value, itemId, item)
            } else if (source) {
                if (source.hadOwn) {
                    config.header = source.value
                } else {
                    delete config.header
                }

                delete config[stackHeaderSource]
            }

            return config
        }

        if (config?.constructor === Object
            && tabInsertDescriptor?.operation === 'addTab'
            && tabInsertDescriptor.itemId === itemId
            && tabInsertDescriptor.tabsNodeId === nodeId) {
            header = config.header || {text: item?.title || itemId};
            config.header = {
                ...header,
                cls: [...new Set([
                    ...(Array.isArray(header.cls) ? header.cls : header.cls ? [header.cls] : []),
                    'neo-dashboard-dock-tab-enter',
                    `dock-tab-enter-item-${encodeURIComponent(itemId)}`
                ])],
                module: DockTabEnterButton
            }
        }

        if (config?.constructor === Object && stackHandle) {
            config.header = this.createStackHeader(config.header, itemId, item)
        }

        return config
    }

    /**
     * @summary Creates the runtime-only whole-stack header overlay from an untouched source.
     * @param {Object|null} header Existing header config.
     * @param {String} itemId Stable item identity.
     * @param {Object} item Persisted item record.
     * @returns {Object}
     * @protected
     * @static
     */
    static createStackHeader(header, itemId, item) {
        let source = header?.constructor === Object ? header : {text: header ?? item?.title ?? itemId},
            text   = source.text;

        return {
            ...source,
            text: [
                ...(Array.isArray(text)
                    ? text
                    : [text?.constructor === Object ? text : {vtype: 'text', text: text ?? item?.title ?? itemId}]),
                {
                    'aria-hidden': true,
                    cls          : ['neo-dock-stack-handle'],
                    id           : this.stackHandleDomId(itemId),
                    tag          : 'span',
                    text         : '⠿',
                    title        : 'Drag whole stack'
                }
            ]
        }
    }

    /**
     * @summary Returns the stable DOM identity of one projected whole-stack grip.
     *
     * The grip is runtime projection state, not document state. Its semantic item id makes the
     * address stable across re-projections so app-owned pointer choreography can target the real
     * nested handle instead of bypassing {@link Neo.dashboard.DockTabSortZone#isStackHandleDrag}.
     * @param {String} itemId Stable item identity.
     * @returns {String|null}
     * @static
     */
    static stackHandleDomId(itemId) {
        return typeof itemId === 'string' && itemId
            ? `neo-dock-stack-handle-${encodeURIComponent(itemId)}`
            : null
    }

    /**
     * Returns normalized flex values for split children.
     * @param {Number[]} sizes
     * @param {Number} count
     * @returns {Number[]}
     * @protected
     * @static
     */
    static getFlexValues(sizes, count) {
        if (!Array.isArray(sizes) || sizes.length !== count) {
            return Array(count).fill(1)
        }

        let values = sizes.map(Number);

        if (values.some(value => !Number.isFinite(value) || value <= 0)) {
            return Array(count).fill(1)
        }

        return values
    }

    /**
     * @summary Creates the semantic operation descriptor emitted after a splitter drag resolves.
     *
     * Pointer handlers own pixel math. This helper keeps the adapter/model seam semantic by converting
     * projected splitter metadata plus resolved child sizes into the existing `resizeSplit` descriptor.
     * @param {Object} splitter Projected splitter config, or its `data` payload.
     * @param {Number[]} sizes Positive values mapped to the split node's child order.
     * @returns {Object}
     * @static
     */
    static createResizeSplitOperation(splitter, sizes) {
        let metadata = splitter?.data || splitter || {};

        return {
            operation  : 'resizeSplit',
            sizes      : Array.isArray(sizes) ? sizes.slice() : sizes,
            splitNodeId: metadata.splitNodeId || metadata.dockNodeId || splitter?.dockNodeId
        }
    }

    /**
     * @summary Projects the stable resize affordance between two adjacent split children.
     * @param {String} splitNodeId
     * @param {String} orientation
     * @param {Number} boundaryIndex
     * @returns {Object}
     * @protected
     * @static
     */
    static createSplitterAffordance(splitNodeId, orientation, boundaryIndex, context={}) {
        let isVertical = orientation === 'vertical';

        return {
            applyDockZoneOperation: context.applyDockZoneOperation,
            boundaryIndex,
            cls                   : ['neo-dashboard-dock-splitter', `neo-dashboard-dock-splitter-${orientation}`],
            data                  : {
                boundaryIndex,
                dockNodeId  : splitNodeId,
                dockSplitter: true,
                operation   : 'resizeSplit',
                orientation,
                splitNodeId
            },
            dockNodeId                       : splitNodeId,
            dockZoneDocument                 : context.dockZoneDocument,
            dockNodeType                     : 'splitter',
            dockSplitBoundaryIndex           : boundaryIndex,
            dockSplitOrientation             : orientation,
            module                           : DockSplitter,
            ntype                            : 'dashboard-dock-splitter',
            onDockZoneDocumentChange         : context.onDockZoneDocumentChange,
            orientation,
            size                             : this.splitterSize,
            splitNodeId,
            [isVertical ? 'height' : 'width']: this.splitterSize
        }
    }

    /**
     * Projects the model root into a Neo-compatible config tree.
     *
     * The returned ROOT config carries the dock token SCOPE with it: the `--dock-transition-*`
     * tokens, reveal keyframes and splitter cursors all live in the `Neo.dashboard.Container`
     * theme file, scoped to `.neo-dashboard` — but a projected dock tree is plain containers,
     * so no element ever carried the scope and the motion contract was invisible on every
     * dock-zone surface. The projection root stamps the scope class itself, so it rides every
     * re-projection by construction. The CSS-LOADING half cannot ride the projection — the
     * worker reads `additionalThemeFiles` from the class prototype, never from instance
     * configs — so each consuming workspace declares
     * `additionalThemeFiles: ['Neo.dashboard.Container']` in its own static config (one line;
     * the `DemoAWorkspace` token-bridge precedent). A workspace whose refresh loop awaits the
     * FLIP addon (`Neo.main.addon.DockFlip.captureFirst`) must ALSO declare `"DockFlip"` in its
     * app's `mainThreadAddons` — a remote call into an addon the app never loaded does not
     * reject, it never settles, which silently hangs the awaiting view-sync (the whole
     * re-projection loop) with no error surfacing anywhere.
     * @param {Object} model
     * @param {Object} [options={}]
     * @param {String|String[]|null} [options.dockTearOutBoundaryContainerId] Main-thread DOM
     *     boundary whose exit starts a tear-out; omitted values retain the tab-toolbar boundary.
     * @param {Boolean} [options.enableVesselConversion=false] Arms the optional source-owned
     *     conversion policy. Consumers keep this false until their physical lifecycle is ready.
     * @param {Boolean} [options.enableStackDrag=false] Decorate the model-resolved stack root
     *     with one runtime-only whole-stack grip and arm its existing dock SortZone.
     * @param {Boolean} [options.enableDockCloseAction=false] Projects one persistent close action
     *     into every tabs header. The workspace owns the effect and policy synchronization.
     * @param {Function} [options.onDockActiveIndexChange] Runtime active-item signal for action policy.
     * @param {Function} [options.onDockHeaderAction] Runtime Dock action intent; never persisted.
     * @param {Function} [options.onDockVesselConversionIn] Source-owned strict park admission.
     * @param {Function} [options.onDockVesselConversionOut] Source-owned strict re-show admission.
     * @param {Function} [options.onDockVesselConversionTerminal] Source-owned parked-vessel
     *     disposition after the coordinator resolves the gesture outcome.
     * @param {Function} [options.onDockVesselConversionRetired] Clear-only acknowledgement when
     *     another owning lifecycle has already retired the same source vessel.
     * @param {Function} [options.resolveVesselConversionSourceRect] Synchronous owner resolver for
     *     the exact dragged vessel's live global inner rect; threaded through a clone-safe listener.
     * @param {Function} [options.resolveComponentRef]
     * @param {Function} [options.resolveRevealComponentRef] Durable resolver retained by edge rails.
     * @param {Object|null} [options.tabInsertDescriptor] Runtime-only normalized `addTab`
     * correlation consumed by this projection; never part of `model`.
     * @param {Number} [options.vesselConversionConvertThreshold] Provisional convert-in threshold;
     *     omitted values leave the SortZone default intact.
     * @param {Number} [options.vesselConversionPointerExitGraceMs] Binding-owned visual-only grace;
     *     commit eligibility still drops on the first raw claim miss.
     * @param {Number} [options.vesselConversionRevertThreshold] Provisional convert-out threshold.
     * @returns {Object}
     * @static
     */
    static project(model, options={}) {
        let forbiddenKey = DockZoneModel.findForbiddenPreviewKey(model);

        if (forbiddenKey) {
            throw new Error(`DockLayoutAdapter input must be committed dock-zone model; preview-only field "${forbiddenKey}" is not allowed.`)
        }

        if (!model?.nodes || !model.root) {
            throw new Error('DockLayoutAdapter requires a model with `root` and `nodes`.')
        }

        let stackDragNodeId = options.enableStackDrag === true
                ? DockZoneModel.resolveStackRoot(model)
                : null,
            config = this.projectNode(model.root, {
            applyDockZoneOperation: options.applyDockZoneOperation,
            autoHideRevealOnHover : options.autoHideRevealOnHover === true,
            // Cross-WINDOW participation (docking design record §2.3, additive + opt-in): a composition that
            // supplies a sortGroup makes every projected tab sort zone a coordinator-registered
            // drag SOURCE (the workspace id rides the drag payload for the receiving window's
            // `transferItem` resolution). Absent = fully in-window, the unchanged default.
            crossWindowSortGroup : options.crossWindowSortGroup ?? null,
            defaultRevealFraction: Number.isFinite(options.defaultRevealFraction) ? options.defaultRevealFraction : null,
            dockZoneDocument     : options.dockZoneDocument || model,
            // Tear-out (docking design record §2.8, additive + opt-in): a composition that enables
            // it makes every projected tab sort zone fire the inherited window-boundary hysteresis,
            // re-fired as dock gesture events (exit / entry / terminal / cancel) on the projected
            // tab.Container. The HOST owns vessel acquisition + the `detachItem` commit at the
            // terminal; the projection only threads the opt-in + the closure seams. Absent = fully
            // in-window, the unchanged default.
            dockTearOutBoundaryContainerId   : options.dockTearOutBoundaryContainerId ?? null,
            enableDockCloseAction            : options.enableDockCloseAction === true,
            enableDockTearOut                : options.enableDockTearOut === true,
            enableVesselConversion           : options.enableVesselConversion === true,
            items                            : model.items || {},
            nodes                            : model.nodes,
            onDockCrossZoneDragCancel        : options.onDockCrossZoneDragCancel,
            onDockCrossZoneDragMove          : options.onDockCrossZoneDragMove,
            onDockCrossZoneDrop              : options.onDockCrossZoneDrop,
            onDockActiveIndexChange          : options.onDockActiveIndexChange,
            onDockHeaderAction               : options.onDockHeaderAction,
            onDockStackDragTerminal          : options.onDockStackDragTerminal,
            onDockTearOutCancel              : options.onDockTearOutCancel,
            onDockTearOutEntry               : options.onDockTearOutEntry,
            onDockTearOutExit                : options.onDockTearOutExit,
            onDockTearOutTerminal            : options.onDockTearOutTerminal,
            onDockVesselConversionIn         : options.onDockVesselConversionIn,
            onDockVesselConversionOut        : options.onDockVesselConversionOut,
            onDockVesselConversionTerminal   : options.onDockVesselConversionTerminal,
            onDockVesselConversionRetired    : options.onDockVesselConversionRetired,
            onDockZoneDocumentChange         : options.onDockZoneDocumentChange,
            resolveComponentRef              : options.resolveComponentRef || (() => null),
            resolveVesselConversionSourceRect: options.resolveVesselConversionSourceRect,
            resolveRevealComponentRef        : options.resolveRevealComponentRef
                || options.resolveComponentRef
                || (() => null),
            stackDragNodeId,
            tabInsertDescriptor               : options.tabInsertDescriptor ?? null,
            vesselConversionConvertThreshold  : options.vesselConversionConvertThreshold,
            vesselConversionPointerExitGraceMs: options.vesselConversionPointerExitGraceMs,
            vesselConversionRevertThreshold   : options.vesselConversionRevertThreshold,
            workspaceId                       : options.workspaceId ?? null
        });

        config.cls = [...new Set([...(config.cls || []), 'neo-dashboard'])];

        return config
    }

    /**
     * Collects the ids of auto-hidden items within a node subtree, in document order.
     *
     * Walks edge-zone / split / tabs nodes recursively and returns every item whose record carries
     * `autoHidden === true`. `projectEdgeZoneNode` uses this to surface those items as a thin edge rail
     * instead of a full pane — the QT-parity auto-hide affordance (see learn/agentos/DockZoneModel.md).
     * @param {String} nodeId
     * @param {Object} context
     * @returns {String[]}
     * @protected
     * @static
     */
    static collectAutoHiddenItems(nodeId, context) {
        let node   = context.nodes[nodeId],
            result = [];

        if (!node) {
            return result
        }

        if (node.type === 'edge-zone') {
            Object.values(node.zones || {}).forEach(childId => {
                result.push(...this.collectAutoHiddenItems(childId, context))
            })
        } else if (node.type === 'split') {
            (Array.isArray(node.children) ? node.children : []).forEach(childId => {
                result.push(...this.collectAutoHiddenItems(childId, context))
            })
        } else if (node.type === 'tabs') {
            (Array.isArray(node.items) ? node.items : []).forEach(itemId => {
                if (context.items[itemId]?.autoHidden === true) {
                    result.push(itemId)
                }
            })
        }

        return result
    }

    /**
     * Projects one auto-hidden item id into the rail-tab metadata `DockRail` renders.
     *
     * The metadata carries stable `dockItemId` + `dockEdge` so the rail's click (and the follow-up
     * reveal/pin slice) can address the item semantically, plus the `restorable` policy projection
     * (`pinnable !== false`) — a tab whose restore the model would reject renders disabled instead
     * of lying about the affordance.
     * No DOMRect, hover, or open geometry is emitted — reveal/open state stays runtime-only per the
     * JSON-first guardrail (DockZoneModel.md §Serializable vs Runtime).
     * @param {String} itemId
     * @param {String} edge
     * @param {Object} context
     * @returns {Object}
     * @protected
     * @static
     */
    static createRailTab(itemId, edge, context) {
        let item = context.items[itemId] || {};

        return {
            dockEdge  : edge,
            dockItemId: itemId,
            restorable: item.pinnable !== false,
            title     : item.title || itemId
        }
    }

    /**
     * Projects a set of auto-hidden item ids into a `Neo.dashboard.DockRail` affordance for the
     * owning edge.
     *
     * Mirrors `createSplitterAffordance()`: the reducer callbacks thread from projection context into
     * the component so restore commits ride the workspace's single operation path — no parallel
     * mutation grammar. Rail extent and tab writing-mode are CSS concerns keyed off the per-edge cls
     * hook (JSON-first: no pixel geometry in the projection).
     * @param {String[]} itemIds
     * @param {String} edge One of `top`, `right`, `bottom`, `left`.
     * @param {Object} context
     * @returns {Object}
     * @protected
     * @static
     */
    static createEdgeRail(itemIds, edge, context) {
        return {
            applyDockZoneOperation  : context.applyDockZoneOperation,
            autoHideRevealOnHover   : context.autoHideRevealOnHover === true,
            defaultRevealFraction   : context.defaultRevealFraction ?? null,
            dockEdge                : edge,
            dockNodeType            : 'edge-rail',
            dockZoneDocument        : context.dockZoneDocument,
            edge,
            flex                    : 'none',
            module                  : DockRail,
            ntype                   : 'dashboard-dock-rail',
            onDockZoneDocumentChange: context.onDockZoneDocumentChange,
            railItems               : itemIds.map(itemId => this.createRailTab(itemId, edge, context)),
            resolveComponentRef     : context.resolveRevealComponentRef
        }
    }

    /**
     * Resolves the reveal overlay's free-dimension extent for an item: the share its owning
     * subtree holds at the nearest ancestor split, per that split's committed `sizes` — the
     * "last committed extent, still in the document" rule. Returns `null` when no ancestor split
     * carries usable sizes (e.g. a tabs node sitting directly in an edge-zone slot); the overlay
     * then falls back to its workspace-configurable default fraction. Never reads DOM geometry.
     * @param {Object} model Committed dock-zone document.
     * @param {String} itemId
     * @returns {Number|null} Fraction in `(0, 1]`, or `null`.
     * @static
     */
    static resolveRevealExtent(model, itemId) {
        let nodes   = model?.nodes || {},
            childId = Object.keys(nodes).find(nodeId =>
                nodes[nodeId].type === 'tabs' && (nodes[nodeId].items || []).includes(itemId)),
            parent;

        const findParent = id => {
            for (const [nodeId, node] of Object.entries(nodes)) {
                if (node.type === 'split' && (node.children || []).includes(id)) {
                    return {index: node.children.indexOf(id), nodeId, split: true}
                }
                if (node.type === 'edge-zone' && Object.values(node.zones || {}).includes(id)) {
                    return {nodeId, split: false}
                }
            }
            return null
        };

        while (childId) {
            parent = findParent(childId);

            if (!parent) {
                return null
            }

            if (parent.split) {
                let sizes = nodes[parent.nodeId].sizes;

                if (Array.isArray(sizes) && sizes.length) {
                    let total = sizes.reduce((sum, value) => sum + (Number(value) || 0), 0),
                        share = Number(sizes[parent.index]);

                    return total > 0 && Number.isFinite(share) && share > 0 ? share / total : null
                }

                return null
            }

            childId = parent.nodeId
        }

        return null
    }

    /**
     * Projects an edge-zone node into nested ordinary container configs, surfacing auto-hidden items as edge rails.
     *
     * Items committed as `autoHidden` within an edge band (top/right/bottom/left) are dropped from their tab flow
     * and collected into a thin rail strip on that edge. Center never collapses to a rail — main content
     * does not auto-hide — so a center-zone `autoHidden` item is left in the tab flow as a fail-safe (never vanishes).
     * The reveal overlay + pin control that act on a rail tab are follow-up slices; this projection makes an
     * auto-hidden item visible (as a rail tab) instead of invisible.
     * @param {String} nodeId
     * @param {Object} node
     * @param {Object} context
     * @returns {Object}
     * @protected
     * @static
     */
    static projectEdgeZoneNode(nodeId, node, context) {
        let {zones={}} = node,
            railsByEdge   = {},
            railedItemIds = new Set();

        ['top', 'right', 'bottom', 'left'].forEach(edge => {
            if (zones[edge]) {
                let itemIds = this.collectAutoHiddenItems(zones[edge], context);

                if (itemIds.length) {
                    railsByEdge[edge] = itemIds;
                    itemIds.forEach(itemId => railedItemIds.add(itemId))
                }
            }
        });

        // Pass the railed set down so projectTabsNode drops those items from the tab flow.
        let childContext = railedItemIds.size ? {...context, railedItemIds} : context,
            middleItems  = [],
            rows         = [],
            centerConfig;

        // Band pushes are null-guarded: an all-railed zone projects rail-only (projectEdgeBand
        // returns null for an empty tab flow — see its constraint comment).
        let band;

        if (railsByEdge.left)  middleItems.push(this.createEdgeRail(railsByEdge.left, 'left', context));
        if (zones.left)        (band = this.projectEdgeBand(zones.left, 'left', childContext)) && middleItems.push(band);

        if (zones.center) {
            centerConfig      = this.projectNode(zones.center, childContext);
            centerConfig.flex = 1;
            middleItems.push(centerConfig)
        }

        if (zones.right)       (band = this.projectEdgeBand(zones.right, 'right', childContext)) && middleItems.push(band);
        if (railsByEdge.right) middleItems.push(this.createEdgeRail(railsByEdge.right, 'right', context));

        if (railsByEdge.top) {
            rows.push(this.createEdgeRail(railsByEdge.top, 'top', context))
        }

        if (zones.top) {
            (band = this.projectEdgeBand(zones.top, 'top', childContext)) && rows.push(band)
        }

        if (middleItems.length === 1) {
            rows.push(middleItems[0])
        } else if (middleItems.length > 1) {
            rows.push({
                cls         : ['neo-dashboard-dock-edge-row'],
                dockNodeType: 'edge-zone-row',
                items       : middleItems,
                layout      : {ntype: 'hbox', align: 'stretch'},
                ntype       : 'container'
            })
        }

        if (zones.bottom) {
            (band = this.projectEdgeBand(zones.bottom, 'bottom', childContext)) && rows.push(band)
        }

        if (railsByEdge.bottom) {
            rows.push(this.createEdgeRail(railsByEdge.bottom, 'bottom', context))
        }

        return {
            cls         : ['neo-dashboard-dock-edge-zone'],
            dockNodeId  : nodeId,
            dockNodeType: 'edge-zone',
            items       : rows,
            layout      : {ntype: 'vbox', align: 'stretch'},
            ntype       : 'container'
        }
    }

    /**
     * Marks an edge-band zone projection: bands keep a fixed cross-extent (the
     * `neo-dashboard-dock-edge-band(-edge)` CSS hooks) instead of flexing against the center —
     * an unsized band silently eats workspace geometry the center owns.
     * @param {String} zoneId
     * @param {String} edge One of `top`, `right`, `bottom`, `left`.
     * @param {Object} context
     * @returns {Object}
     * @protected
     * @static
     */
    static projectEdgeBand(zoneId, edge, context) {
        let config = this.projectNode(zoneId, context);

        // An edge band whose tab flow is EMPTY (every item railed away as autoHidden) must not
        // hold layout. The fixed cross-extent below exists to protect the CENTER from an unsized
        // band — an empty band inverts that purpose and eats the geometry itself: a dead gutter
        // at desktop, and in narrow vessel windows the center split starves toward zero width
        // (band + rail can exceed the whole row). Reveals ride the absolute overlay, never the
        // band, so an empty band serves nothing; any pin / un-autohide operation re-runs the
        // projection and the band returns with its first live item. Split-node bands and
        // populated tab flows project unchanged.
        if (config.dockNodeType === 'tabs' && !(config.items?.length > 0)) {
            return null
        }

        config.cls  = [...(config.cls || []), 'neo-dashboard-dock-edge-band', `neo-dashboard-dock-edge-band-${edge}`];
        config.flex = 'none';

        return config
    }

    /**
     * Projects one dock item id into a Neo config or recoverable placeholder.
     * @param {String} itemId
     * @param {Object} context
     * @returns {*}
     * @protected
     * @static
     */
    static projectItem(itemId, context) {
        let item      = context.items[itemId],
            component = null;

        if (!item) {
            return this.createPlaceholder(itemId, null)
        }

        component = context.resolveComponentRef(item.componentRef, item, itemId);

        if (!component && item.blueprint) {
            component = this.cloneConfig(item.blueprint)
        }

        return component ? this.decorateItemConfig(component, itemId, item) : this.createPlaceholder(itemId, item)
    }

    /**
     * Projects a dock-zone node by id.
     * @param {String} nodeId
     * @param {Object} context
     * @returns {Object}
     * @protected
     * @static
     */
    static projectNode(nodeId, context) {
        let node = context.nodes[nodeId];

        if (!node) {
            throw new Error(`DockLayoutAdapter could not find dock-zone node "${nodeId}".`)
        }

        switch (node.type) {
            case 'edge-zone':
                return this.projectEdgeZoneNode(nodeId, node, context)
            case 'split':
                return this.projectSplitNode(nodeId, node, context)
            case 'tabs':
                return this.projectTabsNode(nodeId, node, context)
            default:
                throw new Error(`DockLayoutAdapter does not support dock-zone node type "${node.type}".`)
        }
    }

    /**
     * Projects a split node into an ordinary container using hbox or vbox.
     * @param {String} nodeId
     * @param {Object} node
     * @param {Object} context
     * @returns {Object}
     * @protected
     * @static
     */
    static projectSplitNode(nodeId, node, context) {
        let children    = Array.isArray(node.children) ? node.children : [],
            flexValues  = this.getFlexValues(node.sizes, children.length),
            items       = [],
            orientation = node.orientation === 'vertical' ? 'vertical' : 'horizontal',
            layoutNtype = orientation === 'vertical' ? 'vbox' : 'hbox';

        children.forEach((childId, index) => {
            const projected = this.projectNode(childId, context);

            items.push({
                ...projected,
                flex : flexValues[index],
                // The committed sizes are the SOLE geometry authority. Flexbox's default
                // `min-height/min-width: auto` lets a zone's min-content floor cap the
                // distribution — the rendered split then silently deviates from the
                // document (rects freeze while the flex values are correct). Zone content
                // clips or scrolls internally instead of overruling the document.
                style: {...projected.style, minHeight: 0, minWidth: 0}
            });

            if (index < children.length - 1) {
                items.push(this.createSplitterAffordance(nodeId, orientation, index, context))
            }
        });

        return {
            cls         : ['neo-dashboard-dock-split', `neo-dashboard-dock-split-${orientation}`],
            dockNodeId  : nodeId,
            dockNodeType: 'split',
            items,
            layout      : {ntype: layoutNtype, align: 'stretch'},
            ntype       : 'container'
        }
    }

    /**
     * Projects a tabs node into a tab.Container-compatible config.
     *
     * Items present in `context.railedItemIds` (committed auto-hidden, surfaced as an edge rail by the owning
     * edge-zone) are dropped from the tab flow; `activeItemId` falls back to the first remaining item.
     * @param {String} nodeId
     * @param {Object} node
     * @param {Object} context
     * @returns {Object}
     * @protected
     * @static
     */
    static projectTabsNode(nodeId, node, context) {
        let allItems = Array.isArray(node.items) ? node.items : [],
            items    = context.railedItemIds
                ? allItems.filter(itemId => !context.railedItemIds.has(itemId))
                : allItems,
            activeIndex = items.length ? items.indexOf(node.activeItemId) : null,
            projectedItems,
            activeItemId;

        if (activeIndex < 0) {
            activeIndex = items.length ? 0 : null
        }

        activeItemId = Number.isInteger(activeIndex) ? items[activeIndex] : null;

        // One-use operation correlation: only a real addTab's exact target header receives
        // the dashboard-owned producer. Whole-stack projection additionally overlays the active
        // root header (plain config OR live instance) with exact restoration on its next item-only
        // projection; no broad selector or committed-document mutation is used as a fallback.
        projectedItems = items.map((itemId, index) => this.decorateProjectedItem(
            this.projectItem(itemId, context),
            itemId,
            context.items[itemId],
            {
                nodeId,
                stackHandle        : nodeId === context.stackDragNodeId && index === activeIndex,
                tabInsertDescriptor: context.tabInsertDescriptor
            }
        ));

        return {
            activeIndex,
            cls         : ['neo-dashboard-dock-tabs'],
            dockNodeId  : nodeId,
            dockNodeType: 'tabs',
            ...(context.enableDockCloseAction && {
                headerActions: [{
                    action    : 'close',
                    contextual: false,
                    hidden    : !activeItemId || context.items[activeItemId]?.closable === false,
                    iconCls   : 'fa fa-times'
                }],
                // The empty-tabs fallback receives focus after its last close. A plain div cannot
                // own programmatic focus, so the opt-in makes the projected root focusable.
                vdom: {tabIndex: -1}
            }),
            // Reuse the EXISTING tab-header SortZone for the gesture — no parallel drag system:
            // `dragResortable` makes the headers draggable, and the `moveTo` the container fires on drop
            // commits the reorder into the COMMITTED dock model through the landed operation seam. The
            // tab.Container drags; the model owns the result. (Cross-zone drag rides the dashboard SortZone
            // in a follow-up slice.)
            dragResortable: true,
            // The header toolbar's SortZone is the dock-aware subclass: within-toolbar drops fire `moveTo`
            // (below), cross-zone drops report their release point to `onDockCrossZoneDrop` so the owner can
            // hit-test the target zone and commit a `moveItem`. Still one drag system — no parallel pipeline.
            headerToolbar : {
                // Tab-overflow affordance: when the projected headers exceed the toolbar width, the
                // overflowing tabs collapse behind a floating overflow control whose menu reaches them
                // (Neo.tab.plugin.Overflow — a generic tab-subsystem plugin the dock only consumes). Zero
                // new model state: a menu selection routes through the tab.Container's existing activeIndex.
                plugins       : [{module: TabOverflowPlugin}],
                sortZoneConfig: {
                    module: DockTabSortZone,
                    // A dock host spans multiple tab strips. Its composition can therefore name
                    // the app/window boundary whose EXIT means tear-out; retaining the toolbar
                    // fallback keeps consumers that omit the option byte-identical.
                    ...(context.dockTearOutBoundaryContainerId
                        ? {boundaryContainerId: context.dockTearOutBoundaryContainerId}
                        : null),
                    dockGroupNodeId : nodeId === context.stackDragNodeId ? nodeId : null,
                    dockItemIds     : items,
                    dockSourceNodeId: nodeId,
                    // §2.3 source identity (opt-in): the coordinator gates registration on
                    // sortGroup, so a null group keeps this zone in-window exactly as before.
                    dockWorkspaceId: context.workspaceId,
                    // Tear-out opt-in (§2.8): arms the INHERITED window-boundary hysteresis on
                    // this zone's drags. Only the serializable flag rides here — the gesture
                    // handlers live on the tab.Container listeners block below, the clone-safe
                    // closure home this projection already uses for its cross-zone events.
                    // `allowOverdrag` MUST pair with it (mirrors src/dashboard/Container.mjs): the
                    // boundary-exit grammar reads the LIVE proxy rect, and while the proxy is clamped
                    // to the tab-strip boundary the intersection ratio never drops — the exit cannot
                    // fire. The tear-out gesture is the proxy LEAVING the strip, so it must overdrag.
                    allowOverdrag         : context.enableDockTearOut === true,
                    enableVesselConversion: context.enableVesselConversion === true,
                    enableProxyToPopup    : context.enableDockTearOut === true,
                    sortGroup             : context.crossWindowSortGroup,
                    ...(Number.isFinite(context.vesselConversionConvertThreshold)
                        ? {vesselConversionConvertThreshold: context.vesselConversionConvertThreshold}
                        : null),
                    ...(Number.isFinite(context.vesselConversionPointerExitGraceMs)
                        ? {vesselConversionPointerExitGraceMs: context.vesselConversionPointerExitGraceMs}
                        : null),
                    ...(Number.isFinite(context.vesselConversionRevertThreshold)
                        ? {vesselConversionRevertThreshold: context.vesselConversionRevertThreshold}
                        : null)
                }
            },
            items    : projectedItems,
            listeners: {
                activeIndexChange: data => context.onDockActiveIndexChange?.({
                    ...data,
                    dockNodeId  : nodeId,
                    tabContainer: data.item?.parent?.parent ?? null
                }),
                headerAction: data => {
                    if (data.action === 'close') {
                        context.onDockHeaderAction?.({...data, dockNodeId: nodeId})
                    }
                },
                // Cancel is a gesture lifecycle signal, not a synthetic drop: the workspace clears
                // transient affordances while the sort zone restores its captured layout.
                dockCrossZoneDragCancel: data => context.onDockCrossZoneDragCancel?.(data),
                // Live-drag hover: the dock-aware SortZone streams `dockCrossZoneDragMove` per frame; the
                // owner renders the transient affordance tier (indicator menu / preview) from it. Same
                // closure-captured context seam as the drop below.
                dockCrossZoneDragMove: data => context.onDockCrossZoneDragMove?.(data),
                // Cross-zone: the dock-aware SortZone fires `dockCrossZoneDrop` on this tab.Container; the
                // closure holds `context` (captured here, not serialized), so the reducer survives config
                // cloning and needs no component-tree walk. The reducer hit-tests the target zone + commits.
                dockCrossZoneDrop: data => context.onDockCrossZoneDrop?.(data),
                // Whole-stack terminal: exactly one committed/cancelled/refused outcome leaves
                // the generic SortZone. The host composes its vessel-park policy at this closure;
                // no app callback enters sortZoneConfig or committed dock state.
                dockStackDragTerminal: data => context.onDockStackDragTerminal?.(data),
                // Clone-safe live-vessel authority: the SortZone mutates this synchronous request
                // record; the workspace closure resolves its exact item→window join. No function
                // enters sortZoneConfig and the generic coordinator remains dock-blind.
                dockVesselConversionSourceRectRequest: data => {
                    data.sourceRect = context.resolveVesselConversionSourceRect?.(data) ?? null
                },
                // Strict lifecycle admission rides the same mutable-record pattern as the
                // synchronous rect request: the projected zone owns decision state; the host
                // owns platform effects. Promise settlement remains behind the source policy.
                dockVesselConversionIn: data => {
                    data.admission = context.onDockVesselConversionIn?.(data) ?? false
                },
                dockVesselConversionOut: data => {
                    data.admission = context.onDockVesselConversionOut?.(data) ?? false
                },
                dockVesselConversionTerminal: data => {
                    data.settlement = context.onDockVesselConversionTerminal?.(data) ?? false
                },
                dockVesselConversionRetired: data => {
                    data.settlement = context.onDockVesselConversionRetired?.(data) ?? false
                },
                // Tear-out gesture seams (§2.8): the zone re-fires the inherited boundary events here.
                // Cancel retires the host's vessel with zero model mutation; entry is a resumed
                // in-window gesture (vessel closes, no outcome); exit is where the host acquires its
                // vessel per the admission contract (Boolean `windowOpen`, fail-closed) and engages
                // `startWindowDrag`; terminal is the ONE seam a host may commit `detachItem` on.
                dockTearOutCancel  : data => {
                    const settlement = context.onDockTearOutCancel?.(data) ?? false;

                    Object.hasOwn(data, 'settlement') && (data.settlement = settlement)
                },
                dockTearOutEntry   : data => context.onDockTearOutEntry?.(data),
                dockTearOutExit    : data => context.onDockTearOutExit?.(data),
                dockTearOutTerminal: data => context.onDockTearOutTerminal?.(data),
                // Within-container reorder rides the container's own `moveTo` event.
                moveTo: data => {
                    let itemId = items[data.fromIndex],
                        result = context.applyDockZoneOperation?.({operation: 'addTab', itemId, tabsNodeId: nodeId, index: data.toIndex});

                    if (result && !result.errors?.length && result.document) {
                        context.onDockZoneDocumentChange?.(result.document, {operation: 'addTab', itemId, tabsNodeId: nodeId, index: data.toIndex}, null)
                    }
                }
            },
            ntype: 'tab-container'
        }
    }
}

export default Neo.setupClass(DockLayoutAdapter);
