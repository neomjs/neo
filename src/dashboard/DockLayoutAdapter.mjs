import Base         from '../core/Base.mjs';
import DockSplitter from './DockSplitter.mjs';

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
     * Preview-only fields must not leak into committed layout projection.
     * @member {Set<String>} forbiddenPreviewKeys
     * @protected
     * @static
     */
    static forbiddenPreviewKeys = new Set([
        'appName',
        'currentIndex',
        'draggedItem',
        'dockPreview',
        'domRect',
        'DOMRect',
        'isWindowDragging',
        'placement',
        'pointer',
        'pointerX',
        'pointerY',
        'previewId',
        'sourceSortZone',
        'targetSortZone',
        'windowId'
    ])

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
     * Returns the first preview-only key found in an arbitrary object graph.
     * @param {*} value
     * @returns {String|null}
     * @protected
     * @static
     */
    static findForbiddenPreviewKey(value) {
        if (!value || typeof value !== 'object') {
            return null
        }

        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                let match = this.findForbiddenPreviewKey(value[i]);

                if (match) {
                    return match
                }
            }

            return null
        }

        for (let key of Object.keys(value)) {
            if (this.forbiddenPreviewKeys.has(key)) {
                return key
            }

            let match = this.findForbiddenPreviewKey(value[key]);

            if (match) {
                return match
            }
        }

        return null
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
            applyDockZoneOperation    : context.applyDockZoneOperation,
            boundaryIndex,
            cls                       : ['neo-dashboard-dock-splitter', `neo-dashboard-dock-splitter-${orientation}`],
            data                      : {
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
     * @param {Object} model
     * @param {Object} [options={}]
     * @param {Function} [options.resolveComponentRef]
     * @returns {Object}
     * @static
     */
    static project(model, options={}) {
        let forbiddenKey = this.findForbiddenPreviewKey(model);

        if (forbiddenKey) {
            throw new Error(`DockLayoutAdapter input must be committed dock-zone model; preview-only field "${forbiddenKey}" is not allowed.`)
        }

        if (!model?.nodes || !model.root) {
            throw new Error('DockLayoutAdapter requires a model with `root` and `nodes`.')
        }

        return this.projectNode(model.root, {
            applyDockZoneOperation  : options.applyDockZoneOperation,
            dockZoneDocument        : options.dockZoneDocument || model,
            items                   : model.items || {},
            nodes                   : model.nodes,
            onDockZoneDocumentChange: options.onDockZoneDocumentChange,
            resolveComponentRef     : options.resolveComponentRef || (() => null)
        })
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
     * Projects one auto-hidden item id into a collapsed rail-tab affordance.
     *
     * The rail tab carries stable `dockItemId` + `dockEdge` metadata so a later reveal/pin slice
     * can convert a click into a transient reveal or a `setItemPinned` operation.
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
            cls         : ['neo-dashboard-dock-rail-tab'],
            data        : {dockEdge: edge, dockItemId: itemId, dockRailTab: true},
            dockEdge    : edge,
            dockItemId  : itemId,
            dockNodeType: 'edge-rail-tab',
            ntype       : 'button',
            text        : item.title || itemId
        }
    }

    /**
     * Projects a set of auto-hidden item ids into a thin edge-rail strip for the owning edge.
     * @param {String[]} itemIds
     * @param {String} edge One of `top`, `right`, `bottom`, `left`.
     * @param {Object} context
     * @returns {Object}
     * @protected
     * @static
     */
    static createEdgeRail(itemIds, edge, context) {
        let isVertical = edge === 'left' || edge === 'right';

        return {
            cls         : ['neo-dashboard-dock-edge-rail', `neo-dashboard-dock-edge-rail-${edge}`],
            dockEdge    : edge,
            dockNodeType: 'edge-rail',
            items       : itemIds.map(itemId => this.createRailTab(itemId, edge, context)),
            layout      : {ntype: isVertical ? 'vbox' : 'hbox', align: 'start'},
            ntype       : 'container'
        }
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
            rows         = [];

        if (railsByEdge.left)  middleItems.push(this.createEdgeRail(railsByEdge.left, 'left', context));
        if (zones.left)        middleItems.push(this.projectNode(zones.left, childContext));
        if (zones.center)      middleItems.push(this.projectNode(zones.center, childContext));
        if (zones.right)       middleItems.push(this.projectNode(zones.right, childContext));
        if (railsByEdge.right) middleItems.push(this.createEdgeRail(railsByEdge.right, 'right', context));

        if (railsByEdge.top) {
            rows.push(this.createEdgeRail(railsByEdge.top, 'top', context))
        }

        if (zones.top) {
            rows.push(this.projectNode(zones.top, childContext))
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
            rows.push(this.projectNode(zones.bottom, childContext))
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
            items.push({
                ...this.projectNode(childId, context),
                flex: flexValues[index]
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
        let allItems    = Array.isArray(node.items) ? node.items : [],
            items       = context.railedItemIds
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
            items       : items.map(itemId => this.projectItem(itemId, context)),
            ntype       : 'tab-container'
        }
    }
}

export default Neo.setupClass(DockLayoutAdapter);
