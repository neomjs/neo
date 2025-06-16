const DomApiVnodeCreator = {
    /**
     * Recursively creates a VNode tree suitable for direct DOM API insertion.
     * This tree excludes any nodes that are marked as 'moved' within the movedNodes map,
     * as their DOM manipulation will be handled by separate moveNode deltas.
     *
     * @param {Neo.vdom.VNode} vnode        The VNode to process.
     * @param {Map}            [movedNodes] A map of VNodes that are being moved.
     * @returns {Object|null} A new VNode tree (or subtree) with moved nodes pruned, or null if the root is a moved node.
     */
    create(vnode, movedNodes) {
        /*
         * A vnode itself can be null (removeDom: true) => opt out.
         *
         * If the node has a componentId, there is nothing to do (scoped vdom updates), opt out.
         *
         * If this specific vnode is in the movedNodes map, it means its DOM element
         * will be moved by a separate delta. So, we should not include it in this fragment.
         */
        if (!vnode || vnode.componentId || (vnode.id && movedNodes?.get(vnode.id))) {
            return null // Prune this branch
        }

        // For text nodes, we can return the original VNode directly, as they have no childNodes array to modify.
        if (vnode.vtype === 'text') {
            return vnode
        }

        // For other VNodes (vnode or root), create a shallow clone first.
        let clonedVnode = {...vnode, childNodes: []};

        // Recursively process children
        if (vnode.childNodes.length > 0) {
            vnode.childNodes.forEach(child => {
                const processedChild = DomApiVnodeCreator.create(child, movedNodes);

                // Only add if not pruned
                if (processedChild) {
                    clonedVnode.childNodes.push(processedChild)
                }
            });
        }

        return clonedVnode
    }
};

const ns = Neo.ns('Neo.vdom.util', true);
ns.DomApiVnodeCreator = DomApiVnodeCreator;

export default DomApiVnodeCreator;
