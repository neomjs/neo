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
                'update',
                'updateBatch'
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

        // Fragments are "transparent" containers. They do not have physical DOM attributes or styles.
        // Therefore, we skip attribute comparison entirely.
        if (vnode.nodeName === 'fragment') {
            return deltas
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

            let prop, attr;
            for (prop in oldVnode) {
                if (Object.hasOwn(oldVnode, prop)) {
                    if (!Object.hasOwn(vnode, prop)) {
                        keys.push(prop)
                    } else if (prop === 'attributes') { // Find removed attributes
                        for (attr in oldVnode[prop]) {
                            if (Object.hasOwn(oldVnode[prop], attr) && !Object.hasOwn(vnode[prop], attr)) {
                                vnode[prop][attr] = null
                            }
                        }
                    }
                }
            }

            let i = 0, len = keys.length, key, val, oldValue, hasOldValue, hasAttributes;
            for (; i < len; i++) {
                prop = keys[i];
                value = vnode[prop];

                switch (prop) {
                    case 'attributes':
                        attributes = {};
                        hasAttributes = false;

                        for (key in value) {
                            if (Object.hasOwn(value, key)) {
                                val = value[key];
                                oldValue = oldVnode.attributes[key];
                                hasOldValue = Object.hasOwn(oldVnode.attributes, key);

                                // If the attribute has an old value AND the value hasn't changed, skip.
                                if (hasOldValue && oldValue === val) {
                                    continue
                                }

                                // If the current value is null, or it's a non-string empty value (e.g., [], {}), skip.
                                // Note: An empty string ('') is a valid value and should NOT be skipped here.
                                if (val !== null && !Neo.isString(val) && Neo.isEmpty(val)) {
                                    continue
                                }

                                attributes[key] = val;
                                hasAttributes = true;
                            }
                        }

                        if (hasAttributes) {
                            delta.attributes = attributes;

                            for (key in attributes) {
                                if (Object.hasOwn(attributes, key)) {
                                    if (attributes[key] === null || attributes[key] === '') {
                                        delete vnode.attributes[key]
                                    }
                                }
                            }
                        }
                        break
                    case 'nodeName':
                    case 'scrollLeft':
                    case 'scrollTop':
                        if (value !== oldVnode[prop]) {
                            delta[prop] = value
                        }
                        break
                    case 'innerHTML':
                        if (value !== oldVnode[prop]) {
                            if (value === undefined) {
                                // If innerHTML is removed, but we are setting textContent, skip the clear command.
                                // Setting textContent natively wipes the DOM node's innerHTML.
                                if (vnode.textContent !== undefined) {
                                    break
                                }
                                // If both are genuinely removed, explicitly normalize to empty string.
                                delta[prop] = ''
                            } else {
                                delta[prop] = value
                            }
                        }
                        break
                    case 'textContent':
                        if (value !== oldVnode[prop]) {
                            if (value === undefined) {
                                // If textContent is removed, but we are setting innerHTML, skip the clear command.
                                // Setting innerHTML natively wipes the DOM node's textContent.
                                if (vnode.innerHTML !== undefined) {
                                    break
                                }
                                // If both are genuinely removed, explicitly normalize to empty string.
                                // Using innerHTML: '' is standard for clearing a node.
                                delta.innerHTML = ''
                            } else {
                                delta[prop] = value
                            }
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
            }

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
        let me               = this,
            {util}           = Neo.vdom,
            postMountUpdates = [],
            returnValue, vnode;

        vnode       = me.createVnode(opts.vdom);
        returnValue = {...opts, vnode};

        delete returnValue.vdom;

        if (!NeoConfig.useDomApiRenderer) {
            if (!util.StringFromVnode) {
                throw new Error('VDom Helper render utilities are not loaded yet!')
            }

            returnValue.outerHTML = util.StringFromVnode.create(vnode, null, postMountUpdates);

            if (postMountUpdates.length > 0) {
                returnValue.postMountUpdates = postMountUpdates
            }
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
                    if (childNode.neoIgnore) {
                        delete childNode.neoIgnore;
                        continue
                    }

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
            key, value, potentialNode;

        for (key in opts) {
            if (Object.hasOwn(opts, key)) {
                value = opts[key];

                if (value !== undefined && value !== null && key !== 'flag' && key !== 'removeDom') {
                    let hasUnit, newValue, style, i, len, item, dataKey;

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

                            for (i = 0, len = value.length; i < len; i++) {
                                item = value[i];
                                if (item) {
                                    if (item.removeDom !== true) {
                                        delete item.removeDom; // could be false
                                        potentialNode = me.createVnode(item);

                                        if (potentialNode) { // don't add null values
                                            newValue.push(potentialNode)
                                        }
                                    }
                                }
                            }

                            node.childNodes = newValue;
                            break

                        case 'data':
                            if (value && Neo.typeOf(value) === 'Object') {
                                for (dataKey in value) {
                                    if (Object.hasOwn(value, dataKey)) {
                                        node.attributes[`data-${Neo.decamel(dataKey)}`] = value[dataKey]
                                    }
                                }
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
                        case 'scrollLeft':
                        case 'scrollTop':
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
            }
        }

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

            let childNodes = vnode.childNodes;
            if (childNodes) {
                for (let i = 0, len = childNodes.length; i < len; i++) {
                    this.createVnodeMap({index: i, map, parentNode: vnode, vnode: childNodes[i]})
                }
            }
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
                let childNodes = vnode.childNodes;
                if (childNodes) {
                    for (let i = 0, len = childNodes.length; i < len; i++) {
                        if (childNodes[i].vtype !== 'text') {
                            this.findMovedNodes({movedNodes, oldVnodeMap, vnode: childNodes[i], vnodeMap})
                        }
                    }
                }
            }
        }

        return movedNodes
    }

    /**
     * Recursive helper to count the physical nodes a fragment expands to.
     *
     * **Formula:** `2 (Start/End Anchors) + Sum(Child Physical Counts)`
     *
     * This method is essential for converting a "Logical Index" (where the fragment is 1 item)
     * into a "Physical Index" (where the fragment is a range of N DOM nodes).
     *
     * @param {Neo.vdom.VNode} fragmentNode
     * @returns {Number}
     */
    getFragmentPhysicalCount(fragmentNode) {
        let count      = 2, // Start + End anchors
            childNodes = fragmentNode.childNodes,
            i          = 0,
            len        = childNodes?.length || 0,
            child;

        for (; i < len; i++) {
            child = childNodes[i];
            if (child.vtype === 'text') {
                count += 3
            } else if (child.nodeName === 'fragment') {
                count += this.getFragmentPhysicalCount(child)
            } else {
                count += 1
            }
        }

        return count
    }

    /**
     * Calculates the physical DOM index for a given logical child index.
     *
     * **The "Physical vs. Logical" Problem:**
     * In the VDOM, a child list is simple: `[Div, Fragment, Span]`.
     * In the real DOM, this expands to: `div`, `<!--frag-start-->`, `p`, `<!--frag-end-->`, `span`.
     *
     * This method iterates through the preceding siblings and sums up their "Physical Count":
     * - Standard Element: 1
     * - Text Node: 3 (`<!--text-->` + text + `<!--/text-->`)
     * - Fragment: N (`2 + children`)
     *
     * @param {Neo.vdom.VNode} parentNode
     * @param {Number}         logicalIndex
     * @returns {Number}
     */
    getPhysicalIndex(parentNode, logicalIndex) {
        let physicalIndex = logicalIndex,
            i             = 0,
            child;

        for (; i < logicalIndex; i++) {
            child = parentNode.childNodes[i];

            if (child) {
                if (child.vtype === 'text') {
                    physicalIndex += 2 // Accounts for <!--neo-vtext--> wrappers
                } else if (child.nodeName === 'fragment') {
                    physicalIndex += (this.getFragmentPhysicalCount(child) - 1)
                }
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
            let postMountUpdates = [];

            // For string-based mounting, pass a string excluding moved nodes
            delta.outerHTML = Neo.vdom.util.StringFromVnode.create(vnode, movedNodes, postMountUpdates);

            if (postMountUpdates.length > 0) {
                delta.postMountUpdates = postMountUpdates
            }
        }

        deltas.default.push(delta);

        // Insert the new node into the old tree, to simplify future OPs
        oldVnodeMap.get(parentId).vnode.childNodes.splice(index, 0, vnode);

        for (let details of movedNodes.values()) {
            let {id}     = details,
                parentId = details.parentNode.id;

            deltas.default.push({action: 'moveNode', id, index: details.index, parentId});

            me.createDeltas({deltas, oldVnode: oldVnodeMap.get(id).vnode, oldVnodeMap, vnode: details.vnode, vnodeMap})
        }
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

        if (oldVnode.vtype === 'text' || oldVnode.nodeName === 'fragment') {
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

    /**
     * Processes a map of updates sequentially and aggregates the results.
     * This method is the core of the "Teleportation" / Disjoint Updates architecture.
     * Instead of building a single bridged VDOM tree, we process multiple components
     * as separate, disjoint updates in a single batch.
     *
     * @param {Object} data
     * @param {Object} data.updates A map of update config objects: {componentId: updateOpts}
     * @returns {Object} { deltas: Object[], vnodes: Object }
     */
    updateBatch(data) {
        let me        = this,
            allDeltas = [],
            vnodes    = {},
            result, id;

        for (id in data.updates) {
            if (Object.hasOwn(data.updates, id)) {
                result = me.update(data.updates[id]);
                allDeltas.push(...result.deltas);
                vnodes[id] = result.vnode;
            }
        }

        return {
            deltas    : allDeltas,
            updateVdom: true,
            vnodes
        }
    }
}

export default Neo.setupClass(Helper);
