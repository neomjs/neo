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
     * Private helper to recursively build a tree, abstracting the child node key.
     * @param {Object} node The vdom or vnode to process.
     * @param {Number} depth The current recursion depth.
     * @param {Set<String>|null} mergedChildIds A set of component IDs to selectively expand.
     * @param {String} childKey The property name for child nodes ('cn' or 'childNodes').
     * @returns {Object}
     * @private
     */
    #buildTree(node, depth, mergedChildIds, childKey) {
        // We can not use Neo.isObject() here, since inside unit-test scenarios, we will import vdom.Helper into main threads.
        // Inside this scenario, Neo.isObject() returns false for VNode instances
        if (typeof node !== 'object' || node === null) {
            return node
        }

        let output = {...node}; // Shallow copy

        if (node[childKey]) {
            output[childKey] = [];

            node[childKey].forEach(item => {
                let currentItem = item,
                    childDepth;

                if (currentItem.componentId) {
                    // Prune the branch only if we are at the boundary AND the child is not part of a merged update
                    if (depth === 1 && !mergedChildIds?.has(currentItem.componentId)) {
                        output[childKey].push({componentId: 'neo-ignore', id: item.id || item.componentId});
                        return // Stop processing this branch
                    }
                    // Expand the branch if it's part of a merged update, or if the depth requires it
                    else if (depth > 1 || depth === -1 || mergedChildIds?.has(currentItem.componentId)) {
                        const component = ComponentManager.get(currentItem.componentId);
                        // Use the correct tree type based on the childKey
                        const componentTree = childKey === 'cn' ? component?.vdom : component?.vnode;
                        if (componentTree) {
                            currentItem = componentTree
                        }
                    }
                }

                if (item.componentId) {
                    childDepth = (depth === -1) ? -1 : Math.max(0, depth - 1)
                } else {
                    childDepth = depth
                }

                output[childKey].push(this.#buildTree(currentItem, childDepth, mergedChildIds, childKey))
            })
        }

        return output
    }


    /**
     * Copies a given vdom tree and replaces child component references with their vdom.
     * @param {Object} vdom
     * @param {Number} [depth=-1]
     * @param {Set<String>|null} [mergedChildIds=null]
     * @returns {Object}
     */
    getVdomTree(vdom, depth=-1, mergedChildIds=null) {
        return this.#buildTree(vdom, depth, mergedChildIds, 'cn')
    }

    /**
     * Copies a given vnode tree and replaces child component references with their vnode.
     * @param {Object} vnode
     * @param {Number} [depth=-1]
     * @param {Set<String>|null} [mergedChildIds=null]
     * @returns {Object}
     */
    getVnodeTree(vnode, depth=-1, mergedChildIds=null) {
        return this.#buildTree(vnode, depth, mergedChildIds, 'childNodes')
    }
}

export default Neo.setupClass(TreeBuilder);
