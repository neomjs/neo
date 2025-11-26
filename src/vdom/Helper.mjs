import Base               from '../core/Base.mjs';
import NeoArray           from '../util/Array.mjs';
import Style              from '../util/Style.mjs';
import {rawDimensionTags} from './domConstants.mjs';
import VNode              from './VNode.mjs';

const NeoConfig = Neo.config;

/**
 * The central class for the VDom worker to create vnodes & delta updates.
 * @class Neo.vdom.Helper
 * @extends Neo.core.Base
 * @singleton
 */
class Helper extends Base {
    static config = {
        /**
         * @member {String} className='Neo.vdom.Helper'
         * @protected
         */
        className: 'Neo.vdom.Helper',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app:['create','update']}
         * @protected
         * @reactive
         */
        remote: {
            app: [
                'create',
                'update'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {Object}         config
     * @param {Object}         config.deltas
     * @param {Neo.vdom.VNode} config.oldVnode
     * @param {Neo.vdom.VNode} config.vnode
     * @param {Map}            config.vnodeMap
     * @returns {Object} deltas
     * @protected
     */
    compareAttributes({deltas, oldVnode, vnode, vnodeMap}) {
        // If either vnode is a component placeholder (indicated by the presence of componentId),
        // we must not compare element attributes.
        if (vnode.componentId || oldVnode.componentId) {
            return deltas;
        }

        let delta = {},
            attributes, value, keys, styles, add, remove;

        if (vnode.vtype === 'text' && vnode.textContent !== oldVnode.textContent) {
            deltas.default.push({
                action  : 'updateVtext',
                id      : vnode.id,
                parentId: vnodeMap.get(vnode.id).parentNode.id,
                value   : vnode.textContent
            })
        } else {
            keys = Object.keys(vnode);

            Object.keys(oldVnode).forEach(prop => {
                if (!Object.hasOwn(vnode, prop)) {
                    keys.push(prop)
                } else if (prop === 'attributes') { // Find removed attributes
                    Object.keys(oldVnode[prop]).forEach(attr => {
                        if (!Object.hasOwn(vnode[prop], attr)) {
                            vnode[prop][attr] = null
                        }
                    })
                }
            });

            keys.forEach(prop => {
                value = vnode[prop];

                switch (prop) {
                    case 'attributes':
                        attributes = {};

                        Object.entries(value).forEach(([key, value]) => {
                            const
                                oldValue    = oldVnode.attributes[key],
                                hasOldValue = Object.hasOwn(oldVnode.attributes, key);

                            // If the attribute has an old value AND the value hasn't changed, skip.
                            if (hasOldValue && oldValue === value) {
                                return
                            }

                            // If the current value is null, or it's a non-string empty value (e.g., [], {}), skip.
                            // Note: An empty string ('') is a valid value and should NOT be skipped here.
                            if (value !== null && !Neo.isString(value) && Neo.isEmpty(value)) {
                                return
                            }

                            attributes[key] = value
                        });

                        if (Object.keys(attributes).length > 0) {
                            delta.attributes = attributes;

                            Object.entries(attributes).forEach(([key, value]) => {
                                if (value === null || value === '') {
                                    delete vnode.attributes[key]
                                }
                            })
                        }
                        break
                    case 'nodeName':
                    case 'innerHTML':
                    case 'textContent':
                        if (value !== oldVnode[prop]) {
                            delta[prop] = value
                        }
                        break
                    case 'style':
                        styles = Style.compareStyles(value, oldVnode.style);
                        if (styles) {
                            delta.style = styles
                        }
                        break
                    case 'className':
                        if (oldVnode.className) {
                            add    = NeoArray.difference(value, oldVnode.className);
                            remove = NeoArray.difference(oldVnode.className, value)
                        } else {
                            add    =  value;
                            remove = []
                        }

                        if (add.length > 0 || remove.length > 0) {
                            delta.cls = {};

                            if (add   .length > 0) {delta.cls.add    = add}
                            if (remove.length > 0) {delta.cls.remove = remove}
                        }
                        break
                }
            });

            if (Object.keys(delta).length > 0) {
                delta.id = vnode.id;
                deltas.default.push(delta)
            }
        }

        return deltas
    }

    /**
     * Creates a Neo.vdom.VNode tree for the given vdom template.
     * The top level vnode contains the outerHTML as a string,
     * in case Neo.config.useDomApiRenderer === false
     * @param {Object} opts
     * @param {String} opts.appName
     * @param {Boolean} [opts.autoMount]
     * @param {String} opts.parentId
     * @param {Number} opts.parentIndex
     * @param {Object} opts.vdom
     * @param {Number} opts.windowId
     * @returns {Object}
     */
    create(opts) {
        let me     = this,
            {util} = Neo.vdom,
            returnValue, vnode;

        vnode       = me.createVnode(opts.vdom);
        returnValue = {...opts, vnode};

        delete returnValue.vdom;

        if (!NeoConfig.useDomApiRenderer) {
            if (!util.StringFromVnode) {
                throw new Error('VDom Helper render utilities are not loaded yet!')
            }

            returnValue.outerHTML = util.StringFromVnode.create(vnode)
        }

        return returnValue
    }

    /**
     * @param {Object}                config
     * @param {Object}                [config.deltas={default: [], remove: []}]
     * @param {Neo.vdom.VNode|Object} config.oldVnode
     * @param {Map}                   [config.oldVnodeMap]
     * @param {Neo.vdom.VNode|Object} config.vnode
     * @param {Map}                   [config.vnodeMap]
     * @returns {Object} deltas
     * @protected
     */
    createDeltas(config) {
        let {deltas={default: [], remove: []}, oldVnode, vnode} = config,
            vnodeId = vnode?.id;

        // Edge case: setting `removeDom: true` on a top-level vdom node
        if (!vnode && (oldVnode?.id || oldVnode?.componentId)) {
            deltas.remove.push({action: 'removeNode', id: oldVnode.id || oldVnode.componentId});
            return deltas
        }

        if (vnode.static) {
            return deltas
        }

        // The top-level nodes passed to createDeltas must be the same logical node. The VdomLifecycle
        // mixin ensures symmetric trees, so IDs and types (component vs element) must match.
        if (vnode.id !== oldVnode.id || vnode.componentId !== oldVnode.componentId) {
            throw new Error(`createDeltas() must be called for the same node. new: {id: ${vnode.id}, cId: ${vnode.componentId}}, old: {id: ${oldVnode.id}, cId: ${oldVnode.componentId}}`);
        }

        let me            = this,
            oldVnodeMap   = config.oldVnodeMap  || me.createVnodeMap({vnode: oldVnode}),
            vnodeMap      = config.vnodeMap     || me.createVnodeMap({vnode}),
            childNodes    = vnode   .childNodes || [],
            oldChildNodes = oldVnode.childNodes || [],
            i             = 0,
            indexDelta    = 0,
            insertDelta   = 0,
            len           = Math.max(childNodes.length, oldChildNodes.length),
            childNode, nodeInNewTree, oldChildNode, oldChildNodeId;

        me.compareAttributes({deltas, oldVnode, vnode, vnodeMap});

        if (childNodes.length === 0 && oldChildNodes.length > 1) {
            deltas.remove.push({action: 'removeAll', parentId: vnodeId});
            return deltas
        }

        for (; i < len; i++) {
            childNode    = childNodes[i];
            oldChildNode = oldChildNodes[i + indexDelta];

            if (!childNode && !oldChildNode) {
                break
            }

            // A "match" requires nodes to be of the same type (placeholder or element) and have
            // the same identifier. The VdomLifecycle mixin ensures that both the old (vnode)
            // and new (vdom) trees are expanded to the same symmetric depth before diffing.
            if (childNode && oldChildNode && (
                // Case 1: Both nodes are elements with the same ID
                (!childNode.componentId && !oldChildNode.componentId && childNode.id === oldChildNode.id) ||
                // Case 2: Both nodes are placeholders for the same component
                (childNode.componentId && childNode.componentId === oldChildNode.componentId)
            )) {
                if (childNode.neoIgnore) {
                    delete childNode.neoIgnore;
                    continue
                }

                me.createDeltas({deltas, oldVnode: oldChildNode, oldVnodeMap, vnode: childNode, vnodeMap});
                continue
            }

            if (oldChildNode) {
                oldChildNodeId = oldChildNode.id || oldChildNode.componentId;
                nodeInNewTree  = vnodeMap.get(oldChildNodeId);

                // Remove node, if no longer inside the new tree
                if (!nodeInNewTree) {
                    me.removeNode({deltas, oldVnode: oldChildNode, oldVnodeMap});
                    i--;
                    insertDelta++;
                    continue
                }

                // The old child node got moved into a different not processed array. It will get picked up there.
                if (childNode && vnodeId !== nodeInNewTree.parentNode.id) {
                    i--;
                    indexDelta++;
                    continue
                }
            }

            if (childNode) {
                if (me.isMovedNode(childNode, oldVnodeMap)) {
                    me.moveNode({deltas, insertDelta, oldVnodeMap, vnode: childNode, vnodeMap})
                } else {
                    me.insertNode({deltas, index: i + insertDelta, oldVnodeMap, vnode: childNode, vnodeMap})
                }

                if (oldChildNode && vnodeId === vnodeMap.get(oldChildNodeId)?.parentNode.id) {
                    len++
                }
            }
        }

        return deltas
    }

    /**
     * @param {Object} opts
     * @returns {Object|Neo.vdom.VNode|null}
     * @protected
     */
    createVnode(opts) {
        // do not create vnode instances for component reference objects
        if (opts.componentId) {
            opts.childNodes ??= []; // Consistency: Every VNode has a childNodes array
            opts.id         ??= opts.componentId

            return opts
        }

        if (opts.removeDom === true) {
            return null
        }

        let me   = this,
            node = {attributes: {}, style: {}},
            potentialNode;

        Object.entries(opts).forEach(([key, value]) => {
            if (value !== undefined && value !== null && key !== 'flag' && key !== 'removeDom') {
                let hasUnit, newValue, style;

                switch (key) {
                    case 'tag':
                        node.nodeName = value;
                        break
                    case 'cls':
                        node.className = value;
                        break
                    case 'html':
                        node.innerHTML = value.toString(); // support for numbers
                        break
                    case 'text':
                        node.textContent = value
                        break
                    case 'cn':
                        if (!Array.isArray(value)) {
                            value = [value]
                        }

                        newValue = [];

                        value.filter(Boolean).forEach(item => {
                            if (item.removeDom !== true) {
                                delete item.removeDom; // could be false
                                potentialNode = me.createVnode(item);

                                if (potentialNode) { // don't add null values
                                    newValue.push(potentialNode)
                                }
                            }
                        });

                        node.childNodes = newValue;
                        break

                    case 'data':
                        if (value && Neo.typeOf(value) === 'Object') {
                            Object.entries(value).forEach(([key, val]) => {
                                node.attributes[`data-${Neo.decamel(key)}`] = val
                            })
                        }
                        break;
                    case 'height':
                    case 'maxHeight':
                    case 'maxWidth':
                    case 'minHeight':
                    case 'minWidth':
                    case 'width':
                        if (rawDimensionTags.has(node.nodeName)) {
                            node.attributes[key] = value + ''
                        } else {
                            hasUnit = value != parseInt(value);
                            node.style[key] = value + (hasUnit ? '' : 'px')
                        }
                        break
                    case 'componentId':
                    case 'id':
                    case 'static':
                    case 'vtype':
                        node[key] = value;
                        break
                    case 'style':
                        style = node.style;
                        if (Neo.isString(value)) {
                            node.style = Object.assign(style, Neo.core.Util.createStyleObject(value))
                        } else {
                            node.style = Object.assign(style, value)
                        }
                        break
                    default:
                        node.attributes[key] = value + '';
                        break
                }
            }
        });

        // Relevant for vtype='text'
        if (Object.keys(node.attributes).length < 1) {
            delete node.attributes
        }

        // Relevant for vtype='text'
        if (Object.keys(node.style).length < 1) {
            delete node.style
        }

        return new VNode(node)
    }

    /**
     * Creates a flat map of the tree, containing ids as keys and infos as values
     * @param {Object}         config
     * @param {Number}         [config.index=0]
     * @param {Map}            [config.map=new Map()]
     * @param {Neo.vdom.VNode} [config.parentNode=null]
     * @param {Neo.vdom.VNode} config.vnode
     * @returns {Map}
     *     {String}         id vnode.id (convenience shortcut)
     *     {Number}         index
     *     {String}         parentId
     *     {Neo.vdom.VNode} vnode
     * @protected
     */
    createVnodeMap({index=0, map=new Map(), parentNode=null, vnode}) {
        if (vnode) {
            let id = vnode.id || vnode.componentId;

            map.set(id, {id, index, parentNode, vnode});

            vnode.childNodes?.forEach((childNode, index) => {
                this.createVnodeMap({index, map, parentNode: vnode, vnode: childNode})
            })
        }

        return map
    }

    /**
     * The logic will parse the vnode (tree) to find existing items inside a given map.
     * It will not search for further childNodes inside an already found vnode.
     * @param {Object}         config
     * @param {Map}            [config.movedNodes=new Map()]
     * @param {Map}            config.oldVnodeMap
     * @param {Neo.vdom.VNode} config.vnode
     * @param {Map}            config.vnodeMap
     * @returns {Map}
     * @protected
     */
    findMovedNodes({movedNodes=new Map(), oldVnodeMap, vnode, vnodeMap}) {
        let id = vnode?.id;

        if (id) {
            if (this.isMovedNode(vnode, oldVnodeMap)) {
                movedNodes.set(id, vnodeMap.get(id))
            } else {
                vnode.childNodes?.forEach(childNode => {
                    if (childNode.vtype !== 'text') {
                        this.findMovedNodes({movedNodes, oldVnodeMap, vnode: childNode, vnodeMap})
                    }
                })
            }
        }

        return movedNodes
    }

    /**
     * For delta updates to work, every node inside the live DOM needs a unique ID.
     * Text nodes need to get wrapped into comment nodes, which contain the ID to ensure consistency.
     * As the result, we need a physical index which counts every text node as 3 nodes.
     * @param {Neo.vdom.VNode} parentNode
     * @param {Number}         logicalIndex
     * @returns {Number}
     */
    getPhysicalIndex(parentNode, logicalIndex) {
        let physicalIndex = logicalIndex,
            i              = 0;

        for (; i < logicalIndex; i++) {
            if (parentNode.childNodes[i]?.vtype === 'text') {
                physicalIndex += 2 // Accounts for <!--neo-vtext--> wrappers
            }
        }

        return physicalIndex
    }

    /**
     * Imports either (if not already imported):
     * `Neo.vdom.util.DomApiVnodeCreator` if Neo.config.useDomApiRenderer === true
     * `Neo.vdom.util.StringFromVnode`    if Neo.config.useDomApiRenderer === false
     * @returns {Promise<void>}
     * @protected
     */
    async importUtil() {
        const {util} = Neo.vdom;

        if (NeoConfig.useDomApiRenderer) {
            if (!util?.DomApiVnodeCreator) {
                await import('./util/DomApiVnodeCreator.mjs')
            }
        } else {
            if (!util?.StringFromVnode) {
                await import('./util/StringFromVnode.mjs')
            }
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        super.initAsync();

        let me = this;

        // Subscribe to global Neo.config changes for dynamic renderer switching.
        Neo.currentWorker?.on({
            neoConfigChange: me.onNeoConfigChange,
            scope          : me
        });

        await me.importUtil()
    }

    /**
     * @param {Object}         config
     * @param {Object}         config.deltas
     * @param {Number}         config.index
     * @param {Map}            config.oldVnodeMap
     * @param {Neo.vdom.VNode} config.vnode
     * @param {Map}            config.vnodeMap
     * @protected
     */
    insertNode({deltas, index, oldVnodeMap, vnode, vnodeMap}) {
        let details      = vnodeMap.get(vnode.id),
            {parentNode} = details,
            parentId     = parentNode.id,
            me           = this,
            movedNodes   = me.findMovedNodes({oldVnodeMap, vnode, vnodeMap}),
            delta        = {action: 'insertNode', parentId};

        // Processes the children of the *NEW* parent's VNode in the *current* state
        delta.index = me.getPhysicalIndex(parentNode, index);

        if (NeoConfig.useDomApiRenderer) {
            // For direct DOM API mounting, pass the pruned VNode tree
            delta.vnode = Neo.vdom.util.DomApiVnodeCreator.create(vnode, movedNodes)
        } else {
            // For string-based mounting, pass a string excluding moved nodes
            delta.outerHTML = Neo.vdom.util.StringFromVnode.create(vnode, movedNodes)
        }

        deltas.default.push(delta);

        // Insert the new node into the old tree, to simplify future OPs
        oldVnodeMap.get(parentId).vnode.childNodes.splice(index, 0, vnode);

        movedNodes.forEach(details => {
            let {id}     = details,
                parentId = details.parentNode.id;

            deltas.default.push({action: 'moveNode', id, index: details.index, parentId});

            me.createDeltas({deltas, oldVnode: oldVnodeMap.get(id).vnode, oldVnodeMap, vnode: details.vnode, vnodeMap})
        })
    }

    /**
     *
     * @param {Neo.vdom.VNode} vnode
     * @param {Map} oldVnodeMap
     * @returns {Boolean}
     * @protected
     */
    isMovedNode(vnode, oldVnodeMap) {
        let oldVnode = oldVnodeMap.get(vnode.id);

        return oldVnode && (
            !oldVnode.vnode.componentId ||                   // the old vnode is not a reference
            vnode.componentId === oldVnode.vnode.componentId // old & new nodes are the same references
        )
    }

    /**
     * @param {Object}         config
     * @param {Object}         config.deltas
     * @param {Number}         config.insertDelta
     * @param {Map}            config.oldVnodeMap
     * @param {Neo.vdom.VNode} config.vnode
     * @param {Map}            config.vnodeMap
     * @protected
     */
    moveNode({deltas, insertDelta, oldVnodeMap, vnode, vnodeMap}) {
        let details             = vnodeMap.get(vnode.id),
            {index, parentNode} = details,
            parentId            = parentNode.id,
            movedNode           = oldVnodeMap.get(vnode.id),
            movedParentNode     = movedNode.parentNode,
            {childNodes}        = movedParentNode,
            delta               = {action: 'moveNode', id: vnode.id, parentId},
            physicalIndex       = this.getPhysicalIndex(parentNode, index); // Processes the children of the *NEW* parent's VNode in the *current* state (parentNode.childNodes)

        Object.assign(delta, {index: physicalIndex + insertDelta});
        deltas.default.push(delta);

        // This block implements the "corrupting the old tree" optimization for performance.
        // It pre-modifies the old VNode map to reflect the move, preventing redundant deltas later.
        if (parentId !== movedParentNode.id) {
            // We need to remove the node from the old parent childNodes
            // (which must not be the same as the node they got moved into)
            NeoArray.remove(childNodes, movedNode.vnode);

            // Get the VNode representing the *new parent* from the 'old VNode map'.
            // This is crucial: 'oldParentNode' here is the *old state's VNode for the new parent*.
            let oldParentNode = oldVnodeMap.get(parentId);

            if (oldParentNode) {
                // If moved into a new parent node, update the reference inside the flat map
                movedNode.parentNode = oldParentNode.vnode;

                // Reassign 'childNodes' property to now point to the 'childNodes' array
                // of this 'old state's VNode for the new parent'.
                childNodes = movedNode.parentNode.childNodes
            }
        }

        // Add the node into the old vnode tree to simplify future OPs.
        // NeoArray.insert() will switch to move() in case the node already exists.
        NeoArray.insert(childNodes, index, movedNode.vnode);

        this.createDeltas({deltas, oldVnode: movedNode.vnode, oldVnodeMap, vnode, vnodeMap})
    }

    /**
     * Handler for global Neo.config changes.
     * If the `Neo.config.useDomApiRenderer` value changes, this method dynamically loads the renderer utilities.
     * @param {Object} config
     * @return {Promise<void>}
     */
    async onNeoConfigChange(config) {
        if (Object.hasOwn(config, 'useDomApiRenderer')) {
            await this.importUtil()
        }
    }

    /**
     * @param {Object}         config
     * @param {Object}         config.deltas
     * @param {Neo.vdom.VNode} config.oldVnode
     * @param {Map}            config.oldVnodeMap
     * @protected
     */
    removeNode({deltas, oldVnode, oldVnodeMap}) {
        if (oldVnode.componentId) {
            oldVnode.id ??= oldVnode.componentId
        }

        let delta        = {action: 'removeNode', id: oldVnode.id},
            {parentNode} = oldVnodeMap.get(oldVnode.id);

        if (oldVnode.vtype === 'text') {
            delta.parentId = parentNode.id
        }

        deltas.remove.push(delta);

        NeoArray.remove(parentNode.childNodes, oldVnode)
    }

    /**
     * Creates a Neo.vdom.VNode tree for the given vdom template and compares the new vnode with the current one
     * to calculate the vdom deltas.
     * @param {Object} opts
     * @param {Object} opts.vdom
     * @param {Object} opts.vnode
     * @returns {Object}
     */
    update(opts) {
        let me     = this,
            {util} = Neo.vdom,
            deltas, vnode;

        if (NeoConfig.useDomApiRenderer) {
            if (!util.DomApiVnodeCreator) {
                throw new Error('Neo.vdom.Helper: DomApiVnodeCreator is not loaded yet for updates!')
            }
        } else {
            if (!util.StringFromVnode) {
                throw new Error('Neo.vdom.Helper: StringFromVnode is not loaded yet for updates!');
            }
        }

        vnode  = me.createVnode(opts.vdom);
        deltas = me.createDeltas({oldVnode: opts.vnode, vnode});

        // Trees to remove could contain nodes which we want to re-use (move),
        // so we need to execute the removeNode OPs last.
        deltas = deltas.default.concat(deltas.remove);

        return {deltas, updateVdom: true, vnode}
    }
}

export default Neo.setupClass(Helper);
