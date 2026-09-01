import Base              from '../../../core/Base.mjs';
import Rail              from '../interaction/Rail.mjs';
import DockSplitter      from '../interaction/DockSplitter.mjs';
import TabEnterButton    from '../interaction/TabEnterButton.mjs';
import TabSortZone       from '../interaction/TabSortZone.mjs';
import Document          from '../model/Document.mjs';
import TabOverflowPlugin from '../../../tab/plugin/Overflow.mjs';

// Private runtime restoration slot for live component instances projected through the popup
// stack grip. Symbol-keyed so it can never collide with application config or persisted data.
const stackHeaderSource = Symbol('dockStackHeaderSource');

/**
 * @summary Projects dock-zone model nodes into existing Neo layout and tab configs.
 *
 * The adapter consumes committed dock-zone state only. Transient drag preview fields such as `dockPreview`,
 * pointer coordinates, window geometry, or DOM rectangles belong to the drag/drop pipeline and are rejected here.
 *
 * @class Neo.dashboard.dock.projection.LayoutAdapter
 * @extends Neo.core.Base
 * @see learn/agentos/DockZoneModel.md
 */
class LayoutAdapter extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.projection.LayoutAdapter'
         * @protected
         */
        className: 'Neo.dashboard.dock.projection.LayoutAdapter'
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
                module: TabEnterButton
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
     * nested handle instead of bypassing {@link Neo.dashboard.dock.interaction.TabSortZone#isStackHandleDrag}.
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
     * @summary Creates the semantic descriptor emitted after an edge splitter resolves.
     * @param {Object} splitter Projected splitter config, or its data payload.
     * @param {Number} extent Final CSS-bounded normalized edge extent.
     * @returns {Object}
     * @static
     */
    static createResizeEdgeZoneOperation(splitter, extent) {
        let edgeZoneId = splitter?.edgeZoneId || splitter?.dockNodeId,
            edge       = splitter?.edge,
            metadata   = !edgeZoneId || !edge ? splitter?.data || {} : {};

        return {
            operation : 'resizeEdgeZone',
            edgeZoneId: edgeZoneId || metadata.edgeZoneId || metadata.dockNodeId,
            edge      : edge || metadata.edge,
            extent
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
     * @summary Projects the resize affordance between one resizable edge band and the center.
     *
     * The generic splitter owns pointer/live-preview mechanics. This metadata selects the adjacent
     * band and gives DockSplitter only the semantic terminal descriptor it adds on release.
     * @param {String} edgeZoneId
     * @param {String} edge One of top/right/bottom/left.
     * @param {Object} descriptor Nested edge descriptor.
     * @param {Object} context
     * @returns {Object}
     * @protected
     * @static
     */
    static createEdgeSplitterAffordance(edgeZoneId, edge, descriptor, context={}) {
        let orientation  = edge === 'left' || edge === 'right' ? 'horizontal' : 'vertical',
            resizeTarget = edge === 'left' || edge === 'top' ? 'previous' : 'next',
            vertical     = orientation === 'vertical';

        return {
            applyDockZoneOperation: context.applyDockZoneOperation,
            cls                   : ['neo-dashboard-dock-splitter', `neo-dashboard-dock-splitter-${orientation}`],
            data                  : {
                dockNodeId  : edgeZoneId,
                dockSplitter: true,
                edge,
                edgeZoneId,
                operation   : 'resizeEdgeZone',
                orientation
            },
            dockNodeId                     : edgeZoneId,
            dockNodeType                   : 'splitter',
            dockZoneDocument               : context.dockZoneDocument,
            edge,
            edgeZoneId,
            liveResize                     : true,
            module                         : DockSplitter,
            ntype                          : 'dashboard-dock-splitter',
            onDockZoneDocumentChange       : context.onDockZoneDocumentChange,
            orientation,
            resizeTarget,
            size                           : this.splitterSize,
            [vertical ? 'height' : 'width']: this.splitterSize
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
     *     boundary whose exit starts a tear-out. When present, this takes precedence over
     *     {@link options.dockWorkspaceBoundaryContainerId}.
     * @param {String|String[]|null} [options.dockWorkspaceBoundaryContainerId] Main-thread DOM
     *     boundary for ordinary in-workspace cross-zone tab drags. A
     *     {@link Neo.dashboard.dock.Workspace} supplies its own component id; direct adapter
     *     consumers own supplying this option. Omitting both boundary options retains the generic
     *     tab-toolbar clamp.
     * @param {Boolean} [options.enableVesselConversion=false] Arms the optional source-owned
     *     conversion policy. Consumers keep this false until their physical lifecycle is ready.
     * @param {Boolean} [options.enableStackDrag=false] Decorate the model-resolved stack root
     *     with one runtime-only whole-stack grip and arm its existing dock SortZone.
     * @param {Boolean} [options.enableDockCloseAction=true] Project the persistent close action.
     * @param {Boolean} [options.enableDockLockAction=false] Projects one engine-owned lock toggle
     *     into every tabs header. The workspace owns committed-state dispatch and presentation sync.
     * @param {Boolean} [options.enableDockMaximizeAction=true] Project the maximize toggle.
     * @param {Boolean} [options.enableDockPinAction=true] Project the collapse-to-rail action.
     * @param {Boolean} [options.enableDockPopOutAction=true] Project the pop-out action; capability
     *     still controls its hidden state through `dockPopOutActionAvailable`.
     * @param {Boolean} [options.enableDockReloadAction=true] Project the reload action.
     * @param {String} [options.dockLockIconCls='fa fa-lock'] Icon while the active item is unlocked.
     * @param {String} [options.dockUnlockIconCls='fa fa-lock-open'] Icon while it is locked.
     * @param {String} [options.dockMaximizeIconCls='far fa-window-maximize'] Icon of the projected
     *     maximize action in its un-maximized state; the workspace flips it per toggle.
     * @param {Boolean} [options.dockPopOutActionAvailable=false] Whether the owner currently has one
     *     effective tear-out handler/admission bundle. The stable pop-out action always projects;
     *     capability changes its hidden state rather than node-level action membership.
     * @param {String} [options.dockPopOutIconCls='far fa-window-restore'] Icon of the projected
     *     pop-out action.
     * @param {Function} [options.onDockActiveIndexChange] Runtime active-item signal for action policy.
     * @param {Function} [options.onDockHeaderAction] Runtime Dock action intent; never persisted.
     * @param {Function} [options.resolveDockHeaderActions] Host resolver for additional tab-header
     *     actions, called per tabs node as `(nodeId)` and returning an array of action configs (or
     *     nothing). The set is **node-static**: it is resolved per tabs node and lives for that
     *     node's retained lifetime, so per-active-item behaviour belongs on the action instance
     *     (`hidden` / `disabled`), never in a changing list. Actions project BEFORE the engine set,
     *     their intent arrives through `onDockHeaderAction` like any other, and focus gating is the
     *     tab header's own default. Semantic names must be unique per node, and every engine-owned
     *     default-rail name is reserved while its default-on flag is not explicitly false; `lock`
     *     joins the reserved set only while `enableDockLockAction` is on.
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
     * @param {Function} [options.syncDockLockPane] Workspace-owned lock presentation for a resolved
     *     rail reveal pane: `(pane, itemId) => void`.
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
        let forbiddenKey = Document.findForbiddenPreviewKey(model);

        if (forbiddenKey) {
            throw new Error(`LayoutAdapter input must be committed dock-zone model; preview-only field "${forbiddenKey}" is not allowed.`)
        }

        if (!model?.nodes || !model.root) {
            throw new Error('DockLayoutAdapter requires a model with `root` and `nodes`.')
        }

        let stackDragNodeId = options.enableStackDrag === true
                ? Document.resolveStackRoot(model)
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
            // The explicit tear-out boundary wins, but the ordinary Workspace-backed projection
            // no longer needs to opt into tear-out merely to let a tab leave its source toolbar.
            // Direct adapter consumers still get the generic toolbar clamp when both options are
            // absent — the adapter owns no component and cannot manufacture a DOM boundary id.
            dockTabSortBoundaryContainerId   : options.dockTearOutBoundaryContainerId
                || options.dockWorkspaceBoundaryContainerId
                || null,
            dockLockIconCls                  : options.dockLockIconCls || 'fa fa-lock',
            dockMaximizeIconCls              : options.dockMaximizeIconCls || 'far fa-window-maximize',
            dockPopOutActionAvailable        : options.dockPopOutActionAvailable === true,
            dockPopOutIconCls                : options.dockPopOutIconCls || 'far fa-window-restore',
            dockUnlockIconCls                : options.dockUnlockIconCls || 'fa fa-lock-open',
            enableDockCloseAction            : options.enableDockCloseAction !== false,
            enableDockLockAction             : options.enableDockLockAction === true,
            enableDockMaximizeAction         : options.enableDockMaximizeAction !== false,
            enableDockPinAction              : options.enableDockPinAction !== false,
            enableDockPopOutAction           : options.enableDockPopOutAction !== false,
            enableDockReloadAction           : options.enableDockReloadAction !== false,
            enableDockTearOut                : options.enableDockTearOut === true,
            enableVesselConversion           : options.enableVesselConversion === true,
            items                            : model.items || {},
            nodes                            : model.nodes,
            onDockCrossZoneDragCancel        : options.onDockCrossZoneDragCancel,
            onDockCrossZoneDragMove          : options.onDockCrossZoneDragMove,
            onDockCrossZoneDrop              : options.onDockCrossZoneDrop,
            onDockActiveIndexChange          : options.onDockActiveIndexChange,
            onDockHeaderAction               : options.onDockHeaderAction,
            resolveDockHeaderActions         : options.resolveDockHeaderActions,
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
            syncDockLockPane                  : options.syncDockLockPane,
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
            Object.values(node.zones || {}).map(Document.getZoneNodeId).forEach(childId => {
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
     * Projects one auto-hidden item id into the rail-tab metadata `Rail` renders.
     *
     * The metadata carries stable `dockItemId` + `dockEdge` so the rail's click (and the follow-up
     * reveal/pin slice) can address the item semantically, plus the `restorable` policy projection
     * (`pinnable !== false`) — a tab whose restore the model would reject renders disabled instead
     * of lying about the affordance. Lock never removes the rail affordance; Workspace derives inert
     * reveal presentation directly from committed item truth rather than duplicating it here.
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
     * Projects a set of auto-hidden item ids into a `Neo.dashboard.dock.interaction.Rail` affordance for the
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
            module                  : Rail,
            ntype                   : 'dashboard-dock-rail',
            onDockZoneDocumentChange: context.onDockZoneDocumentChange,
            railItems               : itemIds.map(itemId => this.createRailTab(itemId, edge, context)),
            resolveComponentRef     : context.resolveRevealComponentRef,
            syncDockLockPane        : context.syncDockLockPane
        }
    }

    /**
     * Resolves the reveal overlay's free-dimension extent from the item's owning edge descriptor.
     * Split sizes govern split children only; they must never be borrowed as edge-band authority.
     * Returns `null` when the owning edge has never committed an extent, so the overlay uses its
     * workspace-configurable pre-commit fallback. Never reads DOM geometry.
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

                if (node.type === 'edge-zone') {
                    for (const descriptor of Object.values(node.zones || {})) {
                        if (Document.getZoneNodeId(descriptor) === id) {
                            return {descriptor, nodeId, split: false}
                        }
                    }
                }
            }
            return null
        };

        while (childId) {
            parent = findParent(childId);

            if (!parent) {
                return null
            }

            if (!parent.split) {
                let extent = Number(parent.descriptor?.extent);

                return Number.isFinite(extent) && extent > 0 && extent < 1 ? extent : null
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
     *
     * **An ancestor's claim is inherited, not restarted.** `collectAutoHiddenItems` recurses through
     * nested edge-zones, so an item two edge-zones deep is collected by BOTH the outer band and the
     * inner one. {@link Neo.dashboard.dock.model.Document#findOwningEdge} answers that contest with the
     * OUTERMOST edge, and this projection is the behavior that answer describes. The `inheritedIds`
     * filter is what enforces it: without it a nested zone re-claims an item its ancestor already owns
     * and the item renders on two rails. `DockZoneModel.spec` reds on exactly that.
     *
     * Seeding `railedItemIds` from the inherited set is a second, WEAKER guarantee, and it is honest to
     * say no fixture currently reds on it. With the filter in place a band-nested zone can never claim
     * anything new — its whole subtree was already collected by the ancestor — so `railedItemIds` stays
     * empty and the `: context` fallback below preserves the ancestor's set anyway. The seed is kept
     * because it makes the ternary's two branches mean the same thing: `railedItemIds` is "everything
     * claimed at or above this node" in both. Without it the true branch REPLACES while the false branch
     * INHERITS, and the code is correct only via a non-local argument about which items can appear
     * beneath which zone — the kind of argument a later refactor breaks silently.
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
            inheritedIds  = context.railedItemIds || null,
            railedItemIds = new Set(inheritedIds);

        ['top', 'right', 'bottom', 'left'].forEach(edge => {
            let zoneId = Document.getZoneNodeId(zones[edge]);

            if (zoneId) {
                let itemIds = this.collectAutoHiddenItems(zoneId, context)
                    .filter(itemId => !inheritedIds?.has(itemId));

                if (itemIds.length) {
                    railsByEdge[edge] = itemIds;
                    itemIds.forEach(itemId => railedItemIds.add(itemId))
                }
            }
        });

        // Pass the railed set down so projectTabsNode drops those items from the tab flow. The set is
        // the UNION of what an ancestor claimed and what this node just claimed, so a descendant tab
        // flow drops every railed item above it, not only the nearest zone's.
        let childContext = railedItemIds.size ? {...context, railedItemIds} : context,
            middleItems  = [],
            rows         = [],
            centerConfig;

        // Band pushes are null-guarded: an all-railed zone projects rail-only (projectEdgeBand
        // returns null for an empty tab flow — see its constraint comment).
        let band;

        if (railsByEdge.left) middleItems.push(this.createEdgeRail(railsByEdge.left, 'left', context));

        if (zones.left && (band = this.projectEdgeBand(zones.left, 'left', childContext))) {
            middleItems.push(band);
            zones.left.resizable === true && middleItems.push(this.createEdgeSplitterAffordance(nodeId, 'left', zones.left, context))
        }

        if (Document.getZoneNodeId(zones.center)) {
            centerConfig      = this.projectNode(Document.getZoneNodeId(zones.center), childContext);
            centerConfig.flex = 1;
            middleItems.push(centerConfig)
        }

        if (zones.right && (band = this.projectEdgeBand(zones.right, 'right', childContext))) {
            zones.right.resizable === true && middleItems.push(this.createEdgeSplitterAffordance(nodeId, 'right', zones.right, context));
            middleItems.push(band)
        }

        if (railsByEdge.right) middleItems.push(this.createEdgeRail(railsByEdge.right, 'right', context));

        if (railsByEdge.top) {
            rows.push(this.createEdgeRail(railsByEdge.top, 'top', context))
        }

        if (zones.top && (band = this.projectEdgeBand(zones.top, 'top', childContext))) {
            rows.push(band);
            zones.top.resizable === true && rows.push(this.createEdgeSplitterAffordance(nodeId, 'top', zones.top, context))
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

        if (zones.bottom && (band = this.projectEdgeBand(zones.bottom, 'bottom', childContext))) {
            zones.bottom.resizable === true && rows.push(this.createEdgeSplitterAffordance(nodeId, 'bottom', zones.bottom, context));
            rows.push(band)
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
     * @param {Object} descriptor Nested edge descriptor.
     * @param {String} edge One of `top`, `right`, `bottom`, `left`.
     * @param {Object} context
     * @returns {Object|null}
     * @protected
     * @static
     */
    static projectEdgeBand(descriptor, edge, context) {
        let zoneId = Document.getZoneNodeId(descriptor),
            config = zoneId ? this.projectNode(zoneId, context) : null;

        if (!config) {
            return null
        }

        // An edge band whose live flow is EMPTY (every descendant railed away as autoHidden) must not
        // hold layout. The fixed cross-extent below exists to protect the CENTER from an unsized
        // band — an empty band inverts that purpose and eats the geometry itself: a dead gutter
        // at desktop, and in narrow vessel windows the center split starves toward zero width
        // (band + rail can exceed the whole row). Reveals ride the absolute overlay, never the
        // band, so an empty band serves nothing; any pin / un-autohide operation re-runs the
        // projection and the band returns with its first live item. `projectSplitNode()` removes
        // empty leaves recursively, so this predicate covers direct tabs and nested splits alike.
        if (this.isEmptyProjection(config)) {
            return null
        }

        config.cls  = [...(config.cls || []), 'neo-dashboard-dock-edge-band', `neo-dashboard-dock-edge-band-${edge}`];
        config.flex = 'none';

        if (Number.isFinite(descriptor.extent)) {
            config[edge === 'left' || edge === 'right' ? 'width' : 'height'] = `${descriptor.extent * 100}%`
        }

        return config
    }

    /**
     * @summary Whether a projected Dock subtree has no live pane flow after rail extraction.
     *
     * This inspects projected truth, never the committed document: an auto-hidden item stays in its
     * original tabs/split model position so pin restores the exact layout, while the runtime tree
     * omits the empty chrome that would otherwise render beside the rail.
     * @param {Object|null} config
     * @returns {Boolean}
     * @protected
     * @static
     */
    static isEmptyProjection(config) {
        if (!config) {
            return true
        }

        if (config.dockNodeType === 'tabs') {
            return !(config.items?.length > 0)
        }

        if (config.dockNodeType === 'split') {
            return !(config.items || []).some(item => item.dockNodeType !== 'splitter'
                && !this.isEmptyProjection(item))
        }

        return false
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
            throw new Error(`LayoutAdapter could not find dock-zone node "${nodeId}".`)
        }

        switch (node.type) {
            case 'edge-zone':
                return this.projectEdgeZoneNode(nodeId, node, context)
            case 'split':
                return this.projectSplitNode(nodeId, node, context)
            case 'tabs':
                return this.projectTabsNode(nodeId, node, context)
            default:
                throw new Error(`LayoutAdapter does not support dock-zone node type "${node.type}".`)
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
        let children          = Array.isArray(node.children) ? node.children : [],
            hasAuthoredSizes  = Array.isArray(node.sizes) && node.sizes.length === children.length,
            items             = [],
            orientation       = node.orientation === 'vertical' ? 'vertical' : 'horizontal',
            layoutNtype       = orientation === 'vertical' ? 'vbox' : 'hbox',
            projectedChildren = children.map((childId, index) => ({
                index,
                projected: this.projectNode(childId, context)
            })).filter(entry => !this.isEmptyProjection(entry.projected)),
            flexValues = this.getFlexValues(
                hasAuthoredSizes ? projectedChildren.map(entry => node.sizes[entry.index]) : null,
                projectedChildren.length
            );

        projectedChildren.forEach((entry, projectedIndex) => {
            const {index, projected} = entry;

            items.push({
                ...projected,
                flex : flexValues[projectedIndex],
                // The committed sizes are the SOLE geometry authority. Flexbox's default
                // `min-height/min-width: auto` lets a zone's min-content floor cap the
                // distribution — the rendered split then silently deviates from the
                // document (rects freeze while the flex values are correct). Zone content
                // clips or scrolls internally instead of overruling the document.
                style: {...projected.style, minHeight: 0, minWidth: 0}
            });

            // Resize grammar names a boundary in the COMMITTED child array. When rail extraction
            // makes non-adjacent model children visually adjacent, there is no single boundary a
            // drag could truthfully resize, so fail closed. Adjacent surviving children retain the
            // original boundary index and exact operation semantics.
            if (projectedIndex < projectedChildren.length - 1
                && projectedChildren[projectedIndex + 1].index === index + 1) {
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

        // Host actions precede the ENGINE SET, and `close` stays the rightmost control. The frozen
        // order is
        // `[tab overflow] → [host actions] → [lock · reload · pin · pop-out · maximize] → [close]`;
        // lock remains opt-in, while the five greenfield rail identities default on and retain an
        // explicit-false compatibility escape. Per-item and host capability changes their state,
        // never this node-static array.
        //
        // The resolver receives the node id ALONE, deliberately. Handing it the active item would
        // invite a per-item action LIST, and a list that changes between projections replaces the
        // action group — destroying the stable instances `actionVisibilityChange` consumers such as
        // tab Overflow depend on. The engine's own close action varies per active item without that
        // cost by keeping one instance and moving `hidden` (`Workspace#syncDockCloseAction`); a host
        // needing per-item behaviour has the same mechanism, on actions it owns.
        const hostActions = context.resolveDockHeaderActions?.(nodeId) || [],
              seen        = new Set(),
              // Every action name is reserved exactly while its projection flag is on. A Map (not
              // an object literal) because
              // the key is host-supplied — `constructor` and `__proto__` must miss, exactly as they do
              // in `Operations.applyOperation`'s own-key dispatch.
              reservedActionNames = new Map([
                  ['close',    context.enableDockCloseAction    ? 'enableDockCloseAction'    : null],
                  ['maximize', context.enableDockMaximizeAction ? 'enableDockMaximizeAction' : null],
                  ['pin',      context.enableDockPinAction      ? 'enableDockPinAction'      : null],
                  ['pop-out',  context.enableDockPopOutAction   ? 'enableDockPopOutAction'   : null],
                  ['reload',   context.enableDockReloadAction   ? 'enableDockReloadAction'   : null],
                  ['lock',     context.enableDockLockAction ? 'enableDockLockAction' : null]
              ]);

        for (const action of hostActions) {
            const name = action?.action;

            // Semantic names address actions: `getActionItem(name)` returns the FIRST match, and
            // intents are routed by name. A duplicate makes one of them unaddressable; a host `close`
            // while the engine's is enabled would additionally capture the engine's own policy sync
            // and its intent. Both are host programming errors, and both are silent — so they throw
            // here, as malformed action configs already do in `toolbar.Base#createActionItemConfig`.
            if (!name) {
                throw new Error('Neo.dashboard.dock.projection.LayoutAdapter: a host header action requires a semantic `action` name')
            }

            if (seen.has(name)) {
                throw new Error(`Neo.dashboard.dock.projection.LayoutAdapter: duplicate host header action "${name}" on dock node "${nodeId}"`)
            }

            const reservedBy = reservedActionNames.get(name);

            if (reservedBy) {
                throw new Error(`Neo.dashboard.dock.projection.LayoutAdapter: host header action "${name}" is reserved by ${reservedBy} (dock node "${nodeId}")`)
            }

            seen.add(name)
        }

        const headerActions = [
            ...hostActions,
            // Lock leads the frozen engine set. The ordinary lock gesture inherits focus gating;
            // while the protective state persists, its UNLOCK reversal stays persistent too, so
            // discoverability never depends on re-entering a transient focus context.
            ...(context.enableDockLockAction ? [{
                action : 'lock',
                hidden : !activeItemId || context.items[activeItemId]?.lockable === false,
                iconCls: context.items[activeItemId]?.locked === true
                    ? context.dockUnlockIconCls
                    : context.dockLockIconCls,
                showOnFocus: context.items[activeItemId]?.locked !== true,
                vdom       : {
                    'aria-label': context.items[activeItemId]?.locked === true ? 'unlock' : 'lock'
                }
            }] : []),
            // Reload follows lock in the frozen family order (lock · reload · pin · maximize — close
            // always last). Not a toggle, so the icon is fixed like pin's. `hidden` is a
            // CONSTANT true here — per-item availability must ride the ONE retained instance's
            // runtime state (`Workspace#syncDockReloadAction`, the `syncDockCloseAction`
            // pattern), never this config: a row that varies between projections changes the
            // actions array, and replacing the action group mid-reconcile is exactly what the
            // stable-instance note below forbids. Fresh boots reveal through the workspace's
            // shell-walk sync, which reaches chrome the reconciler retained nothing of.
            ...(context.enableDockReloadAction ? [{
                action : 'reload',
                hidden : true,
                iconCls: 'fa fa-rotate-right'
            }] : []),
            ...(context.enableDockPinAction ? [{
                action    : 'pin',
                // No `contextual` key, deliberately: the engine set inherits the tab header's
                // `showOnFocus` default and is focus-gated like a host action. Opting OUT is the
                // CLOSE action's own choice — close must stay reachable on an unfocused pane —
                // and copying that opt-out here would put a permanently-visible control on every
                // header in the workspace.
                //
                // Hidden wherever the gesture could not complete, so the header never offers a
                // collapse the model or the projection would refuse: no active item, an item whose
                // policy forbids pinning (`Operations.setItemAutoHidden` rejects `pinnable: false`),
                // or a center-owned item (§2.7 — center never rails, main content does not auto-hide).
                // `Workspace#syncDockPinAction` recomputes exactly this on every active-item change.
                hidden    : !activeItemId
                    || context.items[activeItemId]?.pinnable === false
                    || !Document.findOwningEdge({nodes: context.nodes}, activeItemId),
                // Like maximize → minimize, the glyph names the NEXT action, not current state:
                // this one-way command unpins into the rail; the reveal toolbar owns the inverse
                // thumbtack that pins the pane back into flow.
                iconCls   : 'fa fa-thumbtack-slash',
                vdom      : {'aria-label': 'unpin'}
            }] : []),
            // Pop-out sits between pin and maximize per the family's frozen ordering. Same
            // focus-gating default as the rest of the engine set — no `contextual` key.
            //
            // Hidden without an active item, and on nothing else: unlike pin, every docked item is
            // detachable, so there is no per-item policy to consult. Admission is the real gate and
            // it lives at the host's vessel seam, where a refusal leaves the pane untouched — a
            // header that pre-guessed the host's answer would hide a control that would have worked.
            ...(context.enableDockPopOutAction ? [{
                action : 'pop-out',
                hidden : !activeItemId || !context.dockPopOutActionAvailable,
                iconCls: context.dockPopOutIconCls
            }] : []),
            // Maximize inherits the same focus-gating default; the family ordering contract keeps
            // the engine set between host actions and the always-visible, always-last `close`.
            ...(context.enableDockMaximizeAction ? [{
                action : 'maximize',
                iconCls: context.dockMaximizeIconCls
            }] : []),
            ...(context.enableDockCloseAction ? [{
                action    : 'close',
                contextual: false,
                hidden    : !activeItemId
                    || context.items[activeItemId]?.closable === false
                    || context.items[activeItemId]?.locked === true,
                iconCls   : 'fa fa-times'
            }] : [])
        ];

        return {
            activeIndex,
            cls         : ['neo-dashboard-dock-tabs'],
            dockNodeId  : nodeId,
            dockNodeType: 'tabs',
            // A dock tab strip is embedded pane chrome, not a free-standing tab card. `ui` is the
            // existing component-level styling seam; nothing enters the committed dock document.
            ui          : 'inline',
            ...(headerActions.length > 0 && {headerActions}),
            ...(context.enableDockCloseAction && {
                // The empty-tabs fallback receives focus after its last close. A plain div cannot
                // own programmatic focus, so the close-capable projected root is focusable.
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
                // overflowing tabs collapse behind the first stable header action whose menu reaches them
                // (Neo.tab.plugin.Overflow — a generic tab-subsystem plugin the dock only consumes). The
                // generic default stays floating; composed dock headers opt into their owned action rail.
                // Zero new model state: menu selection routes through tab.Container's existing activeIndex.
                plugins       : [{module: TabOverflowPlugin, projectAsAction: true}],
                sortZoneConfig: {
                    module: TabSortZone,
                    // A dock host spans multiple tab strips. Workspace-backed compositions supply
                    // their root boundary for ordinary cross-zone motion; an explicit tear-out
                    // boundary has already won during context construction. Direct adapter
                    // consumers that supply neither option retain the generic toolbar clamp.
                    ...(context.dockTabSortBoundaryContainerId
                        ? {boundaryContainerId: context.dockTabSortBoundaryContainerId}
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
                // Every action intent is forwarded, not just `close`. Filtering here made the slot
                // unusable for a host: an action could be projected and pressing it would reach
                // nothing. The owner decides what it handles — the workspace already ignores actions
                // it does not own — so the filter belonged there, never in the wire.
                headerAction: data => context.onDockHeaderAction?.({...data, dockNodeId: nodeId}),
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

export default Neo.setupClass(LayoutAdapter);
