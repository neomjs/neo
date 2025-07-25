import Base             from '../core/Base.mjs';
import ComponentManager from '../manager/Component.mjs';

/**
 * @class Neo.util.VNode
 * @extends Neo.core.Base
 */
class VNode extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.VNode'
         * @protected
         */
        className: 'Neo.util.VNode'
    }

    /**
     * Search vnode child nodes by id or opts object for a given vdom tree
     * @param {Object} vnode
     * @param {Object|String} opts Either an object containing vdom node attributes or a string based id
     * @param {Number} [index] Internal flag, do not use it
     * @param {Object} [parentNode] Internal flag, do not use it
     * @returns {Object}
     *     {Number} index
     *     {String} parentId
     *     {Object} vnode
     */
    static find(vnode, opts, index, parentNode) {
        vnode = VNode.getVnode(vnode);

        index = index || 0;
        opts  = typeof opts !== 'string' ? opts : {id: opts};

        let attrMatch  = true,
            matchArray = [],
            styleMatch = true,
            i          = 0,
            len        = vnode.childNodes?.length || 0,
            optsArray, optsLength, subChild;

        optsArray  = Object.entries(opts);
        optsLength = optsArray.length;

        optsArray.forEach(([key, value]) => {
            if (vnode.hasOwnProperty(key)) {
                switch (key) {
                    case 'attributes':
                        if (Neo.isObject(value) && Neo.isObject(vnode[key])) {
                            Object.entries(value).forEach(([attrKey, attrValue]) => {
                                if (!(vnode[key].hasOwnProperty(attrKey) && vnode[key][attrKey] === attrValue)) {
                                    attrMatch = false
                                }
                            });

                            if (attrMatch) {
                                matchArray.push(true)
                            }
                        }
                        break
                    case 'className':
                        if (typeof value === 'string' && Neo.isArray(vnode[key])) {
                            if (vnode[key].includes(value)) {
                                matchArray.push(true)
                            }
                        } else if (typeof value === 'string' && typeof vnode[key] === 'string') {
                            if (vnode[key] === value) {
                                matchArray.push(true)
                            }
                        } else if (Neo.isArray(value) && Neo.isArray(vnode[key])) {
                            // todo: either search the vnode array for all keys or compare if the arrays are equal.
                            throw new Error('find: cls matching not supported for target & source types of Arrays')
                        }
                        break
                    case 'style':
                        if (Neo.isObject(value) && Neo.isObject(vnode[key])) {
                            Object.entries(value).forEach(([styleKey, styleValue]) => {
                                if (!(vnode[key].hasOwnProperty(styleKey) && vnode[key][styleKey] === styleValue)) {
                                    styleMatch = false
                                }
                            });

                            if (styleMatch) {
                                matchArray.push(true)
                            }
                        }
                        break
                    default:
                        if (vnode[key] === value) {
                            matchArray.push(true)
                        }
                        break
                }
            }
        });

        if (matchArray.length === optsLength) {
            return {index, parentNode, vnode}
        }

        for (; i < len; i++) {
            subChild = VNode.find(vnode.childNodes[i], opts, i, vnode);

            if (subChild) {
                return subChild
            }
        }

        return null
    }

    /**
     * Finds a child vnode inside a vnode tree by a given id
     * @param {Object} vnode
     * @param {String|null} id
     * @returns {Object|null} child vnode or null
     */
    static getById(vnode, id) {
        vnode = VNode.getVnode(vnode);

        let childNodes = vnode.childNodes || [],
            i          = 0,
            len        = childNodes.length,
            childNode;

        if (vnode.id === id) {
            return vnode
        }

        for (; i < len; i++) {
            childNode = VNode.getVnode(childNodes[i]);

            if (childNode.id === id) {
                return childNode
            }

            childNode = VNode.getById(childNode, id);

            if (childNode) {
                return childNode
            }
        }

        return null
    }

    /**
     * Get the ids of all child nodes of the given vnode, excluding component references
     * @param {Object} vnode
     * @param {String[]} childIds=[]
     * @returns {String[]} childIds
     */
    static getChildIds(vnode, childIds=[]) {
        vnode?.childNodes?.forEach(childNode => {
            if (childNode.id && !childNode.componentId) {
                childIds.push(childNode.id)
            }

            VNode.getChildIds(childNode, childIds)
        });

        return childIds
    }

    /**
     * Convenience shortcut using manager.Component to replace vnode references if needed
     * @param {Object} vnode
     * @returns {Object}
     */
    static getVnode(vnode) {
        if (vnode.componentId) {
            const component = ComponentManager.get(vnode.componentId);

            if (!component) {
                throw new Error(`util.VNode.getVnode: Component not found for id: ${vnode.componentId}`)
            }

            vnode = component.vnode
        }

        return vnode
    }

    /**
     * Removes a child vnode inside a vnode tree by a given id
     * @param {Object} vnode
     * @param {String} id
     * @returns {Boolean} true in case the node was found and removed
     */
    static removeChildVnode(vnode, id) {
        vnode = VNode.getVnode(vnode);

        let childNodes = vnode.childNodes || [],
            i          = 0,
            len        = childNodes.length,
            childNode;

        if (vnode.id === id) {
            throw new Error('removeChildVnode: target id matches the root vnode id: ' + id)
        }

        for (; i < len; i++) {
            childNode = VNode.getVnode(childNodes[i]);

            if (childNode.id === id) {
                childNodes.splice(i, 1);
                return true
            }

            if (VNode.removeChildVnode(childNode, id)) {
                return true
            }
        }

        return false
    }

    /**
     * Replaces a child vnode inside a vnode tree by a given id
     * @param {Object} vnode
     * @param {String} id
     * @param {Object} newChildVnode
     * @returns {Boolean} true in case the node was found and replaced
     */
    static replaceChildVnode(vnode, id, newChildVnode) {
        vnode = VNode.getVnode(vnode);

        let childNodes = vnode.childNodes || [],
            i          = 0,
            len        = childNodes.length,
            childNode;

        if (vnode.id === id) {
            throw new Error('replaceChildVnode: target id matches the root vnode id: ' + id)
        }

        for (; i < len; i++) {
            childNode = VNode.getVnode(childNodes[i]);

            if (childNode.id === id) {
                childNodes[i] = newChildVnode;
                return true
            }

            if (VNode.replaceChildVnode(childNode, id, newChildVnode)) {
                return true
            }
        }

        return false
    }
}

export default Neo.setupClass(VNode);
