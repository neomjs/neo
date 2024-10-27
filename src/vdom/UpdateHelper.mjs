import BaseRenderHelper from './BaseRenderHelper.mjs';
import NeoArray         from '../util/Array.mjs';
import Style            from '../util/Style.mjs';

/**
 * App Worker helper class to create delta updates for component trees
 * @class Neo.vdom.UpdateHelper
 * @extends Neo.core.Base
 * @singleton
 */
class UpdateHelper extends BaseRenderHelper {
    static config = {
        /**
         * @member {String} className='Neo.vdom.UpdateHelper'
         * @protected
         */
        className: 'Neo.vdom.UpdateHelper',
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
     */
    compareAttributes(config) {
        let {deltas, oldVnode, vnode, vnodeMap} = config,
            attributes, delta, value, keys, styles, add, remove;

        if (vnode.vtype === 'text' && vnode.innerHTML !== oldVnode.innerHTML) {
            deltas.default.push({
                action  : 'updateVtext',
                id      : vnode.id,
                parentId: vnodeMap.get(vnode.id).parentNode.id,
                value   : vnode.innerHTML
            })
        } else {
            keys = Object.keys(vnode);

            Object.keys(oldVnode).forEach(prop => {
                if (!vnode.hasOwnProperty(prop)) {
                    keys.push(prop)
                } else if (prop === 'attributes') { // find removed attributes
                    Object.keys(oldVnode[prop]).forEach(attr => {
                        if (!vnode[prop].hasOwnProperty(attr)) {
                            vnode[prop][attr] = null
                        }
                    })
                }
            });

            keys.forEach(prop => {
                delta = {};
                value = vnode[prop];

                switch (prop) {
                    case 'attributes':
                        attributes = {};

                        Object.entries(value).forEach(([key, value]) => {
                            if (!(oldVnode.attributes.hasOwnProperty(key) && oldVnode.attributes[key] === value)) {
                                if (value !== null && !Neo.isString(value) && Neo.isEmpty(value)) {
                                    // ignore empty arrays & objects
                                } else {
                                    attributes[key] = value
                                }
                            }
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

                if (Object.keys(delta).length > 0) {
                    delta.id = vnode.id;
                    deltas.default.push(delta)
                }
            })
        }

        return deltas
    }

    /**
     * @param {Object}         config
     * @param {Object}         [config.deltas={default: [], remove: []}]
     * @param {Neo.vdom.VNode} config.oldVnode
     * @param {Map}            [config.oldVnodeMap]
     * @param {Neo.vdom.VNode} config.vnode
     * @param {Map}            [config.vnodeMap]
     * @returns {Object} deltas
     */
    createDeltas(config) {
        let {deltas={default: [], remove: []}, oldVnode, vnode} = config,
            oldVnodeId = oldVnode?.id,
            vnodeId    = vnode?.id;

        // Edge case: setting `removeDom: true` on a top-level vdom node
        if (!vnode && oldVnodeId) {
            deltas.remove.push({action: 'removeNode', id: oldVnodeId});
            return deltas
        }

        if (vnode.static) {
            return deltas
        }

        if (vnodeId !== oldVnodeId) {
            throw new Error(`createDeltas() must get called for the same node. ${vnodeId}, ${oldVnodeId}`);
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
            childNode, nodeInNewTree, oldChildNode;

        me.compareAttributes({deltas, oldVnode, vnode, vnodeMap});

        if (childNodes.length === 0 && oldChildNodes.length > 1) {
            deltas.remove.push({action: 'removeAll', parentId: vnodeId});
            return deltas
        }

        for (; i < len; i++) {
            childNode    = childNodes[i];
            oldChildNode = oldChildNodes[i + indexDelta];

            // console.log(childNode?.id, oldChildNode?.id);

            if (!childNode && !oldChildNode) {
                break
            }

            // Same node, continue recursively
            if (childNode && childNode.id === oldChildNode?.id) {
                me.createDeltas({deltas, oldVnode: oldChildNode, oldVnodeMap, vnode: childNode, vnodeMap});
                continue
            }

            if (oldChildNode) {
                nodeInNewTree = vnodeMap.get(oldChildNode.id);

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
                if (oldVnodeMap.get(childNode.id)) {
                    me.moveNode({deltas, insertDelta, oldVnodeMap, vnode: childNode, vnodeMap});
                } else {
                    me.insertNode({deltas, index: i + insertDelta, oldVnodeMap, vnode: childNode, vnodeMap});
                }

                if (oldChildNode && vnodeId === vnodeMap.get(oldChildNode.id)?.parentNode.id) {
                    len++;
                }
            }
        }

        return deltas
    }

    /**
     * Creates a flap map of the tree, containing ids as keys and infos as values
     * @param {Object}         config
     * @param {Neo.vdom.VNode} config.vnode
     * @param {Neo.vdom.VNode} [config.parentNode=null]
     * @param {Number}         [config.index=0]
     * @param {Map}            [config.map=new Map()]
     * @returns {Map}
     *     {String}         id vnode.id (convenience shortcut)
     *     {Number}         index
     *     {String}         parentId
     *     {Neo.vdom.VNode} vnode
     */
    createVnodeMap(config) {
        let {vnode, parentNode=null, index=0, map=new Map()} = config,
            id = vnode?.id;

        map.set(id, {id, index, parentNode, vnode});

        vnode?.childNodes?.forEach((childNode, index) => {
            this.createVnodeMap({vnode: childNode, parentNode: vnode, index, map})
        });

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
     */
    findMovedNodes(config) {
        let {movedNodes=new Map(), oldVnodeMap, vnode, vnodeMap} = config,
            id = vnode?.id;

        if (id) {
            let currentNode = oldVnodeMap.get(id)

            if (currentNode) {
                movedNodes.set(id, vnodeMap.get(id))
            } else {
                vnode.childNodes.forEach(childNode => {
                    if (childNode.vtype !== 'text') {
                        this.findMovedNodes({movedNodes, oldVnodeMap, vnode: childNode, vnodeMap})
                    }
                })
            }
        }

        return movedNodes
    }

    /**
     * @param {Object}         config
     * @param {Object}         config.deltas
     * @param {Number}         config.index
     * @param {Map}            config.oldVnodeMap
     * @param {Neo.vdom.VNode} config.vnode
     * @param {Map}            config.vnodeMap
     */
    insertNode(config) {
        let {deltas, index, oldVnodeMap, vnode, vnodeMap} = config,
            details    = vnodeMap.get(vnode.id),
            parentId   = details.parentNode.id,
            me         = this,
            movedNodes = me.findMovedNodes({oldVnodeMap, vnode, vnodeMap}),
            outerHTML  = me.createStringFromVnode(vnode, movedNodes);

        deltas.default.push({action: 'insertNode', index, outerHTML, parentId});

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
     * @param {Object}         config
     * @param {Object}         config.deltas
     * @param {Number}         config.insertDelta
     * @param {Map}            config.oldVnodeMap
     * @param {Neo.vdom.VNode} config.vnode
     * @param {Map}            config.vnodeMap
     */
    moveNode(config) {
        let {deltas, insertDelta, oldVnodeMap, vnode, vnodeMap} = config,
            details             = vnodeMap.get(vnode.id),
            {index, parentNode} = details,
            parentId            = parentNode.id,
            movedNode           = oldVnodeMap.get(vnode.id),
            movedParentNode     = movedNode.parentNode,
            {childNodes}        = movedParentNode;

        if (parentId !== movedParentNode.id) {
            // We need to remove the node from the old parent childNodes
            // (which must not be the same as the node they got moved into)
            NeoArray.remove(childNodes, movedNode.vnode);

            let oldParentNode = oldVnodeMap.get(parentId);

            if (oldParentNode) {
                // If moved into a new parent node, update the reference inside the flat map
                movedNode.parentNode = oldParentNode.vnode;

                childNodes = movedNode.parentNode.childNodes
            }
        }

        deltas.default.push({action: 'moveNode', id: vnode.id, index: index + insertDelta, parentId});

        // Add the node into the old vnode tree to simplify future OPs.
        // NeoArray.insert() will switch to move() in case the node already exists.
        NeoArray.insert(childNodes, index, movedNode.vnode);

        this.createDeltas({deltas, oldVnode: movedNode.vnode, oldVnodeMap, vnode, vnodeMap})
    }

    /**
     * @param {Object}         config
     * @param {Object}         config.deltas
     * @param {Neo.vdom.VNode} config.oldVnode
     * @param {Map}            config.oldVnodeMap
     */
    removeNode(config) {
        let {deltas, oldVnode, oldVnodeMap} = config,
            delta        = {action: 'removeNode', id: oldVnode.id},
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
     * @returns {Object|Promise<Object>}
     */
    update(opts) {
        let me     = this,
            vnode  = me.createVnode(opts.vdom),
            deltas = me.createDeltas({oldVnode: opts.vnode, vnode});

        // Trees to remove could contain nodes which we want to re-use (move),
        // so we need to execute the removeNode OPs last.
        deltas = deltas.default.concat(deltas.remove);

        return {deltas, vnode}
    }
}

export default Neo.setupClass(UpdateHelper);
