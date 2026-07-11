import Base            from '../core/Base.mjs';
import DockRail        from './DockRail.mjs';
import DockSplitter    from './DockSplitter.mjs';
import DockTabSortZone from './DockTabSortZone.mjs';
import DockZoneModel   from './DockZoneModel.mjs';

/**
 * @summary Projects Agent Harness dock-zone model nodes into existing Neo layout and tab configs.
 *
 * The adapter consumes committed dock-zone state only. Transient drag preview fields such as `dockPreview`,
 * pointer coordinates, window geometry, or DOM rectangles belong to the drag/drop pipeline and are rejected here.
 *
 * @class Neo.dashboard.DockLayoutAdapter
 * @extends Neo.core.Base
 * @see learn/agentos/HarnessDockZoneModel.md
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
            header    : {text: title},
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

        data.componentRef = item.componentRef || null;
        data.dockItemId   = itemId;

        config.data       = data;
        config.dockItemId = itemId;
        config.header     = config.header || {text: item.title || itemId};

        return config
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
     * @param {Function} [options.resolveComponentRef]
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

        let config = this.projectNode(model.root, {
            applyDockZoneOperation: options.applyDockZoneOperation,
            autoHideRevealOnHover : options.autoHideRevealOnHover === true,
            // Cross-WINDOW participation (docking design record §2.3, additive + opt-in): a composition that
            // supplies a sortGroup makes every projected tab sort zone a coordinator-registered
            // drag SOURCE (the workspace id rides the drag payload for the receiving window's
            // `transferItem` resolution). Absent = fully in-window, the unchanged default.
            crossWindowSortGroup    : options.crossWindowSortGroup ?? null,
            defaultRevealFraction   : Number.isFinite(options.defaultRevealFraction) ? options.defaultRevealFraction : null,
            dockZoneDocument        : options.dockZoneDocument || model,
            items                   : model.items || {},
            nodes                   : model.nodes,
            onDockCrossZoneDragMove : options.onDockCrossZoneDragMove,
            onDockCrossZoneDrop     : options.onDockCrossZoneDrop,
            onDockZoneDocumentChange: options.onDockZoneDocumentChange,
            resolveComponentRef     : options.resolveComponentRef || (() => null),
            workspaceId             : options.workspaceId ?? null
        });

        config.cls = [...new Set([...(config.cls || []), 'neo-dashboard'])];

        return config
    }

    /**
     * Collects the ids of auto-hidden items within a node subtree, in document order.
     *
     * Walks edge-zone / split / tabs nodes recursively and returns every item whose record carries
     * `autoHidden === true`. `projectEdgeZoneNode` uses this to surface those items as a thin edge rail
     * instead of a full pane — the QT-parity auto-hide affordance (see learn/agentos/HarnessDockZoneModel.md).
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
     * JSON-first guardrail (HarnessDockZoneModel.md §Serializable vs Runtime).
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
            module                  : DockRail,
            ntype                   : 'dashboard-dock-rail',
            onDockZoneDocumentChange: context.onDockZoneDocumentChange,
            railItems               : itemIds.map(itemId => this.createRailTab(itemId, edge, context)),
            resolveComponentRef     : context.resolveComponentRef
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

        if (railsByEdge.left)  middleItems.push(this.createEdgeRail(railsByEdge.left, 'left', context));
        if (zones.left)        middleItems.push(this.projectEdgeBand(zones.left, 'left', childContext));

        if (zones.center) {
            centerConfig      = this.projectNode(zones.center, childContext);
            centerConfig.flex = 1;
            middleItems.push(centerConfig)
        }

        if (zones.right)       middleItems.push(this.projectEdgeBand(zones.right, 'right', childContext));
        if (railsByEdge.right) middleItems.push(this.createEdgeRail(railsByEdge.right, 'right', context));

        if (railsByEdge.top) {
            rows.push(this.createEdgeRail(railsByEdge.top, 'top', context))
        }

        if (zones.top) {
            rows.push(this.projectEdgeBand(zones.top, 'top', childContext))
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
            rows.push(this.projectEdgeBand(zones.bottom, 'bottom', childContext))
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
            activeIndex = items.length ? items.indexOf(node.activeItemId) : null;

        if (activeIndex < 0) {
            activeIndex = items.length ? 0 : null
        }

        return {
            activeIndex,
            cls         : ['neo-dashboard-dock-tabs'],
            dockNodeId  : nodeId,
            dockNodeType: 'tabs',
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
                sortZoneConfig: {
                    module          : DockTabSortZone,
                    dockItemIds     : items,
                    dockSourceNodeId: nodeId,
                    // §2.3 source identity (opt-in): the coordinator gates registration on
                    // sortGroup, so a null group keeps this zone in-window exactly as before.
                    dockWorkspaceId: context.workspaceId,
                    sortGroup      : context.crossWindowSortGroup
                }
            },
            items    : items.map(itemId => this.projectItem(itemId, context)),
            listeners: {
                // Live-drag hover: the dock-aware SortZone streams `dockCrossZoneDragMove` per frame; the
                // owner renders the transient affordance tier (indicator menu / preview) from it. Same
                // closure-captured context seam as the drop below.
                dockCrossZoneDragMove: data => context.onDockCrossZoneDragMove?.(data),
                // Cross-zone: the dock-aware SortZone fires `dockCrossZoneDrop` on this tab.Container; the
                // closure holds `context` (captured here, not serialized), so the reducer survives config
                // cloning and needs no component-tree walk. The reducer hit-tests the target zone + commits.
                dockCrossZoneDrop: data => context.onDockCrossZoneDrop?.(data),
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
