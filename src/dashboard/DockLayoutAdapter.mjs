import Base from '../core/Base.mjs';

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
            cls       : ['neo-dashboard-dock-placeholder'],
            data      : {
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
            items              : model.items || {},
            nodes              : model.nodes,
            resolveComponentRef: options.resolveComponentRef || (() => null)
        })
    }

    /**
     * Projects an edge-zone node into nested ordinary container configs.
     * @param {String} nodeId
     * @param {Object} node
     * @param {Object} context
     * @returns {Object}
     * @protected
     * @static
     */
    static projectEdgeZoneNode(nodeId, node, context) {
        let {zones={}} = node,
            middleItems = ['left', 'center', 'right']
                .filter(zone => zones[zone])
                .map(zone => this.projectNode(zones[zone], context)),
            rows = [];

        if (zones.top) {
            rows.push(this.projectNode(zones.top, context))
        }

        if (middleItems.length === 1) {
            rows.push(middleItems[0])
        } else if (middleItems.length > 1) {
            rows.push({
                cls          : ['neo-dashboard-dock-edge-row'],
                dockNodeType : 'edge-zone-row',
                items        : middleItems,
                layout       : {ntype: 'hbox', align: 'stretch'},
                ntype        : 'container'
            })
        }

        if (zones.bottom) {
            rows.push(this.projectNode(zones.bottom, context))
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
            orientation = node.orientation === 'vertical' ? 'vertical' : 'horizontal',
            layoutNtype = orientation === 'vertical' ? 'vbox' : 'hbox';

        return {
            cls         : ['neo-dashboard-dock-split', `neo-dashboard-dock-split-${orientation}`],
            dockNodeId  : nodeId,
            dockNodeType: 'split',
            items       : children.map((childId, index) => ({
                ...this.projectNode(childId, context),
                flex: flexValues[index]
            })),
            layout      : {ntype: layoutNtype, align: 'stretch'},
            ntype       : 'container'
        }
    }

    /**
     * Projects a tabs node into a tab.Container-compatible config.
     * @param {String} nodeId
     * @param {Object} node
     * @param {Object} context
     * @returns {Object}
     * @protected
     * @static
     */
    static projectTabsNode(nodeId, node, context) {
        let items       = Array.isArray(node.items) ? node.items : [],
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
