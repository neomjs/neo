import Base             from '../../core/Base.mjs';
import ComponentManager from '../../manager/Component.mjs';

/**
 * A singleton utility class responsible for recursively building VDOM and VNode trees.
 * It can expand component references within a tree structure into their full VDOM/VNode representations,
 * supporting selective (asymmetric) tree expansion for optimized updates.
 * @class Neo.util.vdom.TreeBuilder
 * @extends Neo.core.Base
 * @singleton
 */
class TreeBuilder extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.vdom.TreeBuilder'
         * @protected
         */
        className: 'Neo.util.vdom.TreeBuilder',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Copies a given vdom tree and replaces child component references with the vdom of their matching components
     * @param {Object} vdom
     * @param {Number} [depth=-1]
     *     The component replacement depth.
     *     -1 will parse the full tree, 1 top level only, 2 include children, 3 include grandchildren
     * @param {Set<String>|null} [mergedChildIds=null] A set of component IDs to selectively expand.
     * @returns {Object}
     */
    getVdomTree(vdom, depth = -1, mergedChildIds = null) {
        if (!Neo.isObject(vdom)) {
            return vdom;
        }

        let output     = {...vdom}, // shallow copy
            childDepth;

        if (vdom.cn) {
            output.cn = [];

            vdom.cn.forEach(item => {
                let currentItem = item;

                if (currentItem.componentId) {
                    // A component placeholder is expanded if depth is -1 (full tree) or if
                    // the current expansion depth is greater than 1.
                    if (depth === -1 || depth > 1) {
                        const component = ComponentManager.get(currentItem.componentId);
                        if (component?.vdom) {
                            currentItem = component.vdom;
                        }
                    }
                }

                if (item.componentId) { // check original item
                    childDepth = (depth === -1) ? -1 : Math.max(0, depth - 1);
                } else {
                    childDepth = depth;
                }

                output.cn.push(this.getVdomTree(currentItem, childDepth, mergedChildIds));
            });
        }

        return output
    }

    /**
     * Copies a given vnode tree and replaces child component references with the vnode of their matching components
     * @param {Object} vnode
     * @param {Number} [depth=-1]
     *     The component replacement depth.
     *     -1 will parse the full tree, 1 top level only, 2 include children, 3 include grandchildren
     * @param {Set<String>|null} [mergedChildIds=null] A set of component IDs to selectively expand.
     * @returns {Object}
     */
    getVnodeTree(vnode, depth = -1, mergedChildIds = null) {
        let output     = {...vnode}, // shallow copy
            childDepth, component;

        if (vnode.childNodes) {
            output.childNodes = [];

            vnode.childNodes.forEach(item => {
                let currentItem = item;

                if (currentItem.componentId) {
                    // A component placeholder is expanded if depth is -1 (full tree) or if
                    // the current expansion depth is greater than 1.
                    if (depth === -1 || depth > 1) {
                        component = ComponentManager.get(currentItem.componentId);

                        // keep references in case there is no vnode (e.g. component not mounted yet)
                        if (component?.vnode) {
                            currentItem = component.vnode;
                        }
                    }
                }

                if (item.componentId) { // check original item
                    childDepth = (depth === -1) ? -1 : Math.max(0, depth - 1);
                } else {
                    childDepth = depth;
                }

                output.childNodes.push(this.getVnodeTree(currentItem, childDepth, mergedChildIds));
            });
        }

        return output
    }
}

export default Neo.setupClass(TreeBuilder);