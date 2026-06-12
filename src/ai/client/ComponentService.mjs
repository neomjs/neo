import Service     from './Service.mjs';
import TreeBuilder from '../../util/vdom/TreeBuilder.mjs';
import VdomUtil    from '../../util/VDom.mjs';

/**
 * Handles component-related Neural Link requests.
 * @class Neo.ai.client.ComponentService
 * @extends Neo.ai.client.Service
 */
class ComponentService extends Service {
    static config = {
        /**
         * @member {String} className='Neo.ai.client.ComponentService'
         * @protected
         */
        className: 'Neo.ai.client.ComponentService'
    }

    /**
     * @param {Object}   params
     * @param {String}   params.componentId
     * @param {String[]} params.variables
     * @returns {Object}
     */
    async getComputedStyles({componentId, variables}) {
        const component = Neo.getComponent(componentId);

        if (!component) {
            throw new Error(`Component not found: ${componentId}`)
        }

        const styles = await Neo.main.DomAccess.getComputedStyle({
            id   : component.id,
            style: variables
        });

        return {styles}
    }

    /**
     * @param {Object}   params
     * @param {String[]} params.componentIds
     * @returns {Object}
     */
    async getDomRect({componentIds}) {
        if (!Array.isArray(componentIds) || componentIds.length === 0) {
            throw new Error('componentIds must be a non-empty array')
        }

        // Use the first component to resolve the windowId context
        const component = Neo.getComponent(componentIds[0]);

        if (!component) {
            throw new Error(`Component not found: ${componentIds[0]}`)
        }

        const rects = await component.getDomRect(componentIds);

        return {
            rects: Array.isArray(rects) ? rects : [rects]
        }
    }

    /**
     * Samples component and raw DOM-node client rects over a time window, returning a rendered
     * geometry motion trace. The perception side of drag verification: an agent drives the
     * interaction through any dispatch path while this recorder observes where elements actually
     * render per tick. Duration is clamped below the bridge rpc timeout; chain calls for longer
     * windows.
     * @param {Object}         params
     * @param {String[]}       [params.componentIds]
     * @param {{rowId:String}} [params.cellsOf] Expands a row's current child node ids
     * @param {Number}         [params.durationMs=2000] clamped to [100, 8000]
     * @param {Number}         [params.intervalMs=100]  clamped to [16, 1000]
     * @param {String[]}       [params.nodeIds] Raw DOM element ids to sample
     * @param {String}         [params.windowId] Required for deterministic node-only multi-window sampling
     * @returns {Object} {componentIds, nodeIds, targetIds, samples: [{t, rects}]}
     */
    async observeMotion({cellsOf, componentIds, durationMs = 2000, intervalMs = 100, nodeIds, windowId}) {
        componentIds = ComponentService.normalizeIdArray(componentIds, 'componentIds');
        nodeIds      = ComponentService.normalizeIdArray(nodeIds,      'nodeIds');

        const components = componentIds.map(id => {
            const component = Neo.getComponent(id);

            if (!component) {
                throw new Error(`Component not found: ${id}`)
            }

            return component
        });

        windowId ??= components[0]?.windowId;

        if (cellsOf?.rowId) {
            const rowNodeIds = await Neo.main.DomAccess.getChildNodeIds({id: cellsOf.rowId, windowId});

            if (rowNodeIds === null) {
                throw new Error(`Row node not found: ${cellsOf.rowId}`)
            }

            nodeIds.push(...rowNodeIds)
        }

        if (componentIds.length === 0 && nodeIds.length === 0) {
            throw new Error('componentIds, nodeIds, or cellsOf must provide at least one target')
        }

        durationMs = Math.max(100, Math.min(durationMs, 8000));
        intervalMs = Math.max(16,  Math.min(intervalMs, 1000));

        const
            samples   = [],
            start     = Date.now(),
            targetIds = componentIds.concat(nodeIds);

        while (Date.now() - start < durationMs) {
            const
                t     = Date.now() - start,
                rects = componentIds.length > 0 && nodeIds.length === 0 && !cellsOf ?
                    await components[0].getDomRect(componentIds) :
                    await Neo.main.DomAccess.getBoundingClientRect({id: targetIds, windowId});

            samples.push({
                t,
                rects: (Array.isArray(rects) ? rects : [rects]).map(ComponentService.serializeMotionRect)
            });

            await this.timeout(intervalMs)
        }

        return {componentIds, nodeIds, targetIds, samples}
    }

    /**
     * Compares a container's three child-order surfaces — logical items, vdom child nodes,
     * and the rendered DOM — and reports mismatches (count, order, membership, duplicates).
     * The duplication detector: a column/item existing twice is a surface disagreement.
     * @param {Object} params
     * @param {String} params.componentId
     * @returns {Object}
     */
    async verifyComponentConsistency({componentId}) {
        const component = Neo.getComponent(componentId);

        if (!component) {
            throw new Error(`Component not found: ${componentId}`)
        }

        const
            itemIds = (component.items || []).map(item => item?.id).filter(Boolean),
            vdomIds = (component.getVdomItemsRoot?.()?.cn || component.vdom?.cn || [])
                .map(node => node?.componentId || node?.id).filter(Boolean),
            rootId  = component.getVdomItemsRoot?.()?.id || componentId;

        const domIds = await Neo.main.DomAccess.getChildNodeIds({id: rootId, windowId: component.windowId});

        return ComponentService.diffChildSurfaces({componentId, domIds, itemIds, vdomIds})
    }

    /**
     * Pure differ for the three child-order surfaces. Static for direct unit coverage.
     * @param {Object}        data
     * @param {String}        data.componentId
     * @param {String[]|null} data.domIds null when the root node was not found in the DOM
     * @param {String[]}      data.itemIds
     * @param {String[]}      data.vdomIds
     * @returns {Object}
     */
    static diffChildSurfaces({componentId, domIds, itemIds, vdomIds}) {
        const
            mismatches = [],
            dupes      = ids => ids.filter((id, index) => id && ids.indexOf(id) !== index);

        if (domIds === null) {
            mismatches.push({type: 'dom-root-missing'})
        }

        [['items', itemIds], ['vdom', vdomIds], ['dom', domIds || []]].forEach(([surface, ids]) => {
            const duplicates = dupes(ids);

            if (duplicates.length > 0) {
                mismatches.push({type: 'duplicates', surface, ids: duplicates})
            }
        });

        if (itemIds.join() !== vdomIds.join()) {
            mismatches.push({type: 'order-or-membership', surfaces: ['items', 'vdom'], a: itemIds, b: vdomIds})
        }

        if (domIds !== null && vdomIds.join() !== domIds.join()) {
            mismatches.push({type: 'order-or-membership', surfaces: ['vdom', 'dom'], a: vdomIds, b: domIds})
        }

        return {
            componentId,
            consistent: mismatches.length === 0,
            counts    : {dom: domIds === null ? null : domIds.length, items: itemIds.length, vdom: vdomIds.length},
            domIds,
            itemIds,
            mismatches,
            vdomIds
        }
    }

    /**
     * @param {*} ids
     * @param {String} name
     * @returns {String[]}
     * @protected
     */
    static normalizeIdArray(ids, name) {
        if (ids === undefined || ids === null) {
            return []
        }

        if (!Array.isArray(ids)) {
            throw new Error(`${name} must be an array`)
        }

        ids.forEach(id => {
            if (typeof id !== 'string' || id.length === 0) {
                throw new Error(`${name} must contain non-empty strings`)
            }
        });

        return [...ids]
    }

    /**
     * @param {Object|null|undefined} rect
     * @returns {Object|null}
     * @protected
     */
    static serializeMotionRect(rect) {
        return typeof rect?.left === 'number' ?
            {left: rect.left, top: rect.top, width: rect.width, height: rect.height} :
            null
    }

    /**
     * @param {Object} params
     * @param {String} params.componentId
     * @param {Object} [params.options]
     * @returns {Object}
     */
    highlightComponent({componentId, options}) {
        let component = Neo.getComponent(componentId),
            originalStyle;

        if (!component) {
            throw new Error(`Component not found: ${componentId}`)
        }

        options = options || {};

        const
            color    = options.color    || 'red',
            duration = options.duration || 2000,
            mode     = options.style    || 'outline'; // 'outline' or 'box-shadow'

        originalStyle = component.style || {};

        let highlightStyle = {};

        if (mode === 'outline') {
            highlightStyle.outline       = `2px solid ${color}`;
            highlightStyle.outlineOffset = '-2px'
        } else {
            highlightStyle.boxShadow = `0 0 10px ${color}, inset 0 0 10px ${color}`
        }

        component.style = {...originalStyle, ...highlightStyle};

        this.timeout(duration).then(() => {
            component.style = originalStyle
        });

        return {success: true}
    }

    /**
     * @param {Object}  params
     * @param {Number}  [params.depth]
     * @param {Boolean} [params.lean=true]
     * @param {String}  [params.rootId]
     * @returns {Object}
     */
    getComponentTree({depth, lean=true, rootId}) {
        return {
            tree: this.serializeComponent({
                component: this.getComponentRoot(rootId),
                lean,
                maxDepth : depth || -1
            })
        }
    }

    /**
     * @param {Object} params
     * @param {Number} [params.depth]
     * @param {String} [params.rootId]
     * @returns {Object}
     */
    getVdomTree({depth, rootId}) {
        const component = this.getComponentRoot(rootId);
        if (!component) throw new Error('Root component not found');
        return {vdom: TreeBuilder.getVdomTree(component.vdom, depth)}
    }

    /**
     * @param {Object} params
     * @param {Number} [params.depth]
     * @param {String} [params.rootId]
     * @returns {Object}
     */
    getVnodeTree({depth, rootId}) {
        const component = this.getComponentRoot(rootId);
        if (!component) throw new Error('Root component not found');
        return {vnode: TreeBuilder.getVnodeTree(component.vnode, depth)}
    }

    /**
     * @param {Object} params
     * @param {Number} [params.depth]
     * @param {String} [params.rootId]
     * @returns {Object}
     */
    getVdomVnode({depth, rootId}) {
        const component = this.getComponentRoot(rootId);
        if (!component) throw new Error('Root component not found');
        return {
            vdom : TreeBuilder.getVdomTree(component.vdom, depth),
            vnode: TreeBuilder.getVnodeTree(component.vnode, depth)
        }
    }

    /**
     * @param {Object}   params
     * @param {String}   [params.rootId]
     * @param {Object}   params.selector
     * @param {String[]} [params.returnProperties]
     * @returns {Object}
     */
    queryComponent({rootId, selector, returnProperties}) {
        let matches;

        if (rootId) {
            const component = Neo.getComponent(rootId);
            if (!component) throw new Error(`Root component not found: ${rootId}`);
            matches = component.down(selector, false)
        } else {
            matches = Neo.manager.Component.find(selector)
        }

        const components = matches.map(c => {
            if (Array.isArray(returnProperties) && returnProperties.length > 0) {
                const props = {};
                returnProperties.forEach(prop => {
                    props[prop] = this.safeSerialize(c[prop])
                });

                return {
                    className : c.className,
                    id        : c.id,
                    properties: props
                }
            }

            return c.toJSON()
        });

        return {components}
    }

    /**
     * @param {Object} params
     * @param {String} [params.rootId]
     * @param {Object} params.selector
     * @returns {Object}
     */
    queryVdom({rootId, selector}) {
        const component = this.getComponentRoot(rootId);
        if (!component) throw new Error('Root component not found');

        const result = VdomUtil.find(component.vdom, selector);

        return {
            vdom    : result?.vdom || null,
            index   : result?.index,
            parentId: result?.parentNode?.id
        }
    }

    /**
     * @param {String} [rootId]
     * @returns {Neo.component.Base|null}
     */
    getComponentRoot(rootId) {
        if (rootId) {
            return Neo.getComponent(rootId)
        }

        const apps = Object.values(Neo.apps || {});

        if (apps.length > 0) {
            return apps[0].mainView
        }

        return null
    }

    /**
     * @param {Object} data
     * @param {Neo.component.Base} data.component
     * @param {Number}             [data.currentDepth=1]
     * @param {Boolean}            [data.lean=true]
     * @param {Number}             [data.maxDepth=-1]
     * @returns {Object}
     */
    serializeComponent({component, currentDepth=1, lean=true, maxDepth=-1}) {
        if (!component) return null;

        let result;

        if (lean) {
            result = {
                className: component.className,
                id       : component.id
            };
        } else {
            result = component.toJSON();
        }

        if (maxDepth === -1 || currentDepth < maxDepth) {
            const children = Neo.manager.Component.getChildComponents(component);

            if (children && children.length > 0) {
                result.items = children.map(child => this.serializeComponent({
                    component   : child,
                    currentDepth: currentDepth + 1,
                    lean,
                    maxDepth
                }))
            }
        }

        return result
    }
}

export default Neo.setupClass(ComponentService);
