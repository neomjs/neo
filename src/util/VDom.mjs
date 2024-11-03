import Base             from '../core/Base.mjs';
import ComponentManager from '../manager/Component.mjs';

/**
 * @class Neo.util.VDom
 * @extends Neo.core.Base
 */
class VDom extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.VDom'
         * @protected
         */
        className: 'Neo.util.VDom'
    }

    /**
     * @param {Object} vdom
     * @param {Boolean} removeIds=true
     * @returns {Object} cloned vdom
     */
    static clone(vdom, removeIds=true) {
        let clone = Neo.clone(vdom, true);

        if (removeIds) {
            delete clone.id
        }

        if (clone.cn) {
            clone.cn.forEach((item, index) => {
                clone.cn[index] = VDom.clone(item, removeIds)
            })
        }

        return clone
    }

    /**
     * Search vdom child nodes by id or opts object for a given vdom tree
     * @param {Object} vdom
     * @param {Object|String} opts Either an object containing vdom node attributes or a string based id
     * @param {Number} [index] Internal flag, do not use it
     * @param {Object} [parentNode] Internal flag, do not use it
     * @returns {Object}
     *     {Number} index
     *     {String} parentId
     *     {Object} vdom
     */
    static findVdomChild(vdom, opts, index, parentNode) {
        index = index || 0;
        opts  = !Neo.isString(opts) ? opts : {id: opts};
        vdom  = VDom.getVdom(vdom);

        let child      = null,
            matchArray = [],
            styleMatch = true,
            i          = 0,
            len        = vdom.cn?.length,
            optsArray  = Object.entries(opts),
            optsLength = optsArray.length,
            subChild;

        optsArray.forEach(([key, value]) => {
            if (vdom.hasOwnProperty(key)) {
                switch(key) {
                    case 'cls':
                        if (typeof value === 'string' && Neo.isArray(vdom[key])) {
                            if (vdom[key].includes(value)) {
                                matchArray.push(true)
                            }
                        } else if (typeof value === 'string' && typeof vdom[key] === 'string') {
                            if (vdom[key] === value) {
                                matchArray.push(true)
                            }
                        } else if (Neo.isArray(value) && Neo.isArray(vdom[key])) {
                            // todo: either search the vdom array for all keys or compare if the arrays are equal.
                            throw new Error('findVdomChild: cls matching not supported for target & source types of Arrays')
                        }
                        break
                    case 'style':
                        if (typeof value === 'string' && typeof vdom[key] === 'string') {
                            if (vdom[key] === value) {
                                matchArray.push(true)
                            }
                        } else if (Neo.isObject(value) && Neo.isObject(vdom[key])) {
                            Object.entries(value).forEach(([styleKey, styleValue]) => {
                                if (!(vdom[key].hasOwnProperty(styleKey) && vdom[key][styleKey] === styleValue)) {
                                    styleMatch = false
                                }
                            });

                            if (styleMatch) {
                                matchArray.push(true)
                            }
                        } else {
                            throw new Error('findVdomChild: style matching not supported for mixed target & source types (Object VS String)')
                        }
                        break
                    default:
                        if (vdom[key] === value) {
                            matchArray.push(true)
                        }
                        break
                }
            }
        });

        if (matchArray.length === optsLength) {
            return {index, parentNode, vdom}
        }

        if (vdom.cn) {
            for (; i < len; i++) {
                if (vdom.cn[i]) {
                    subChild = VDom.findVdomChild(vdom.cn[i], opts, i, vdom);

                    if (subChild) {
                        child = {
                            index     : subChild.index,
                            parentNode: subChild.parentNode,
                            vdom      : subChild.vdom
                        };
                        break
                    }
                }
            }
        }

        return child
    }

    /**
     * Convenience shortcut for findVdomChild(vdom, {flag: flag});
     * @param {Object} vdom
     * @param {String} flag The flag reference specified on the target vdom child node
     * @returns {Object} vdom
     */
    static getByFlag(vdom, flag) {
        let node = VDom.findVdomChild(vdom, {flag});
        return node?.vdom
    }

    /**
     * Get the ids of all child nodes of the given vdom tree
     * @param vdom
     * @param [childIds=[]]
     * @returns {Array} childIds
     */
    static getChildIds(vdom, childIds=[]) {
        vdom = VDom.getVdom(vdom);

        let childNodes = vdom?.cn || [];

        childNodes.forEach(childNode => {
            if (childNode.id) {
                childIds.push(childNode.id)
            }

            childIds = VDom.getChildIds(childNode, childIds)
        });

        return childIds
    }

    /**
     * @param {Object} vdom
     * @param {Number} index
     * @returns {Array}
     */
    static getColumnNodes(vdom, index) {
        vdom = VDom.getVdom(vdom);

        let columnNodes = [];

        vdom.cn?.forEach(row => {
            if (row.cn?.[index]) {
                columnNodes.push(row.cn[index])
            }
        })

        return columnNodes
    }

    /**
     * @param {Object} vdom
     * @param {Number} index
     * @returns {Array}
     */
    static getColumnNodesIds(vdom, index) {
        return VDom.getColumnNodes(vdom, index).map(e => e.id)
    }

    /**
     * @param {Object} vdom
     * @param {String} flag
     * @param {Array} [matchArray]
     * @returns {Array} an array of vdom nodes which match the flag
     */
    static getFlags(vdom, flag, matchArray) {
        vdom = VDom.getVdom(vdom);

        if (!matchArray) {
            matchArray = [];

            if (vdom.flag === flag) {
                matchArray.push(vdom)
            }
        }

        (vdom?.cn || []).forEach(childNode => {
            if (childNode.flag === flag) {
                matchArray.push(childNode)
            }

            matchArray = VDom.getFlags(childNode, flag, matchArray)
        });

        return matchArray
    }

    /**
     * @param {Object} vdom
     * @param {String} id
     * @param {Boolean} topLevel=true Internal flag, do not use it
     * @returns {Array}
     */
    static getParentNodes(vdom, id, topLevel=true) {
        vdom = VDom.getVdom(vdom);

        let parents = null,
            i       = 0,
            len     = vdom.cn?.length || 0;

        if (vdom.id === id) {
            return []
        }

        for (; i < len; i++) {
            parents = VDom.getParentNodes(vdom.cn[i], id, false);

            if (parents) {
                parents.push(vdom.cn[i]);
                break
            }
        }

        if (topLevel && parents) {
            parents.push(vdom)
        }

        return parents
    }

    /**
     * Convenience shortcut using manager.Component to replace vdom references if needed
     * @param {Object} vdom
     * @returns {Object}
     */
    static getVdom(vdom) {
        if (vdom.componentId) {
            vdom = ComponentManager.get(vdom.componentId).vdom
        }

        return vdom
    }

    /**
     * Insert a given nodeToInsert after a targetNode inside a given vdom tree
     * @param {Object} vdom The vdom tree containing the targetNode
     * @param {Object} nodeToInsert The new vdom to insert
     * @param {Object|String} targetNodeId Either a vdom node or a vdom node id
     * @returns {Boolean}
     */
    static insertAfterNode(vdom, nodeToInsert, targetNodeId) {
        return VDom.insertNode(vdom, nodeToInsert, targetNodeId, false)
    }

    /**
     * Insert a given nodeToInsert before a targetNode inside a given vdom tree
     * @param {Object} vdom The vdom tree containing the targetNode
     * @param {Object} nodeToInsert The new vdom to insert
     * @param {Object|String} targetNodeId Either a vdom node or a vdom node id
     * @returns {Boolean}
     */
    static insertBeforeNode(vdom, nodeToInsert, targetNodeId) {
        return VDom.insertNode(vdom, nodeToInsert, targetNodeId, true)
    }

    /**
     * Insert a given nodeToInsert before a targetNode inside a given vdom tree
     * @param {Object} vdom The vdom tree containing the targetNode
     * @param {Object} nodeToInsert The new vdom to insert
     * @param {Object|String} targetNodeId Either a vdom node or a vdom node id
     * @param {Boolean} insertBefore true inserts the new node at the same index, index+1 otherwise
     * @returns {Boolean}
     */
    static insertNode(vdom, nodeToInsert, targetNodeId, insertBefore) {
        if (Neo.isObject(targetNodeId)) {
            targetNodeId = targetNodeId.id
        }

        let targetNode = VDom.findVdomChild(vdom, {id: targetNodeId}),
            index;

        if (targetNode) {
            index = insertBefore ? targetNode.index : targetNode.index + 1;
            targetNode.parentNode.cn.splice(index, 0, nodeToInsert);
            return true
        }

        return false
    }

    /**
     * Search vdom child nodes by id or opts object for a given vdom tree
     * @param {Object} [vdom]
     * @param {Object|String} opts Either an object containing vdom node attributes or a string based id
     * @returns {Boolean} true in case the node was found & removed
     */
    static removeVdomChild(vdom, opts) {
        let child = VDom.findVdomChild(vdom, opts);

        if (child) {
            child.parentNode.cn.splice(child.index, 1);
            return true
        }

        return false
    }

    /**
     * Replaces a child node inside a vdom tree by a given id
     * @param {Object} vdom
     * @param {String} id
     * @param {Object} newChildNode
     * @returns {Boolean} true in case the node was found and replaced
     */
    static replaceVdomChild(vdom, id, newChildNode) {
        vdom = VDom.getVdom(vdom);

        let cn  = vdom.cn || [],
            i   = 0,
            len = cn.length,
            childNode;

        if (vdom.id === id) {
            throw new Error('replaceVdomChild: target id matches the root vnode id: ' + id)
        }

        for (; i < len; i++) {
            childNode = cn[i];

            if (childNode.id === id) {
                cn[i] = newChildNode;
                return true
            }

            if (VDom.replaceVdomChild(childNode, id, newChildNode)) {
                return true
            }
        }

        return false;
    }

    /**
     * Neo.vdom.Helper will create ids for each vnode which does not already have one,
     * so we need to sync them into the vdom.
     * @param {Neo.vdom.VNode} vnode
     * @param {Object} vdom
     * @param {Boolean} force=false The force param will enforce overwriting different ids
     */
    static syncVdomIds(vnode, vdom, force=false) {
        if (vnode && vdom) {
            vdom = VDom.getVdom(vdom);

            let childNodes = vdom.cn,
                cn, i, len;

            if (force) {
                if (vnode.id && vdom.id !== vnode.id) {
                    vdom.id = vnode.id
                }
            } else {
                // we only want to change vdom ids in case there is not already an own id
                // (think of adding & removing nodes in parallel)
                if (!vdom.id && vnode.id) {
                    vdom.id = vnode.id
                }
            }

            if (childNodes) {
                cn   = childNodes.filter(item => item.removeDom !== true);
                i    = 0;
                len  = cn?.length || 0;

                for (; i < len; i++) {
                    if (vnode.childNodes) {
                        VDom.syncVdomIds(vnode.childNodes[i], cn[i], force)
                    }
                }
            }
        }
    }
}

export default Neo.setupClass(VDom);
