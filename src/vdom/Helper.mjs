import Base      from '../core/Base.mjs';
import NeoArray  from '../util/Array.mjs';
import NeoString from '../util/String.mjs';
import Style     from '../util/Style.mjs';
import VNode     from './VNode.mjs';
import VNodeUtil from '../util/VNode.mjs';

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
     * @member {Boolean} returnChildNodeOuterHtml=false
     */
    returnChildNodeOuterHtml = false
    /**
     * Void attributes inside html tags
     * @member {String[]} voidAttributes
     * @protected
     */
    voidAttributes = [
        'checked',
        'required'
    ]
    /**
     * Void html tags
     * @member {String[]} voidElements
     * @protected
     */
    voidElements = [
        'area',
        'base',
        'br',
        'col',
        'command',
        'embed',
        'hr',
        'img',
        'input',
        'keygen',
        'link',
        'meta',
        'param',
        'source',
        'track',
        'wbr'
    ]

    /**
     * Creates a Neo.vdom.VNode tree for the given vdom template.
     * The top level vnode contains the outerHTML as a string.
     * @param {Object} opts
     * @param {String} opts.appName
     * @param {Boolean} [opts.autoMount]
     * @param {String} opts.parentId
     * @param {Number} opts.parentIndex
     * @param {Object} opts.vdom
     * @param {Number} opts.windowId
     * @returns {Neo.vdom.VNode|Promise<Neo.vdom.VNode>}
     */
    create(opts) {
        let me        = this,
            autoMount = opts.autoMount === true,
            {appName, parentId, parentIndex, windowId} = opts,
            node;

        delete opts.appName;
        delete opts.autoMount;
        delete opts.parentId;
        delete opts.parentIndex;
        delete opts.windowId;

        node           = me.parseHelper(opts);
        node.outerHTML = me.createStringFromVnode(node);

        if (autoMount) {
            Object.assign(node, {
                appName,
                autoMount: true,
                parentId,
                parentIndex,
                windowId
            })
        }

        return Neo.config.useVdomWorker ? node : Promise.resolve(node)
    }

    /**
     * @param {Object} vnode
     * @protected
     */
    createCloseTag(vnode) {
        return this.voidElements.indexOf(vnode.nodeName) > -1 ? '' : '</' + vnode.nodeName + '>'
    }

    /**
     * @param {Object}         config
     * @param {Object[]}       config.deltas=[]
     * @param {Number}         config.index
     * @param {Neo.vdom.VNode} config.newVnode
     * @param {Neo.vdom.VNode} config.newVnodeMap
     * @param {Neo.vdom.VNode} config.newVnodeRoot
     * @param {Neo.vdom.VNode} config.oldVnode
     * @param {Neo.vdom.VNode} config.oldVnodeMap
     * @param {Neo.vdom.VNode} config.oldVnodeRoot
     * @param {String}         config.parentId
     * @returns {Object[]} deltas
     */
    createDeltas(config) {
        let {deltas=[], index, newVnode, oldVnode, parentId} = config,
            me            = this,
            newVnodeMap   = config.newVnodeMap  || me.createVnodeMap({vnode: newVnode}),
            newVnodeRoot  = config.newVnodeRoot || newVnode,
            oldVnodeMap   = config.oldVnodeMap  || me.createVnodeMap({vnode: oldVnode}),
            oldVnodeRoot  = config.oldVnodeRoot || oldVnode,
            attributes, delta, value, i, indexDelta, keys, len, movedNode, movedOldNode, styles, add, remove, returnValue, tmp, wrappedNode;

        // deltas.length === 0 && console.log(newVnodeMap);

        // console.log('createDeltas', newVnode && newVnode.id, oldVnode && oldVnode.id, newVnode, oldVnode);

        if (newVnode && !oldVnode) { // new node at top level or at the end of a child array
            if (oldVnodeRoot) {
                movedOldNode = oldVnodeMap.get(newVnode.id)
            }

            if (!movedOldNode) {
                me.insertNode({deltas, index, newVnode, newVnodeMap, newVnodeRoot, oldVnodeMap, oldVnodeRoot, parentId});
            }
        } else if (!newVnode && oldVnode) {
            if (newVnodeRoot) {
                movedNode = newVnodeMap.get(oldVnode.id)
            }

            // use case: calendar week view => move an event into a column on the right side

            if (movedNode) {
                //console.log({movedNode});

                movedOldNode = oldVnodeMap.get(movedNode.parentNode.id);

                if (movedOldNode) {
                    deltas.push({
                        action: 'moveNode',
                        id      : oldVnode.id,
                        index   : movedNode.index,
                        parentId: movedNode.parentNode.id
                    });

                    me.createDeltas({
                        deltas,
                        newVnode: movedNode.vnode,
                        newVnodeMap,
                        newVnodeRoot,
                        oldVnode,
                        oldVnodeMap,
                        oldVnodeRoot,
                        parentId: movedNode.parentNode.id
                    });

                    movedOldNode.vnode.childNodes.splice(movedNode.index, 0, movedNode.vnode);
                    me.createVnodeMap({vnode: oldVnodeRoot, map: oldVnodeMap, reset: true})
                }
            } else {
                // top level removed node
                delta = {action: 'removeNode', id: oldVnode.id};

                // We only need a parentId for vtype text
                if (oldVnode.vtype === 'text') {
                    let removedNodeDetails = oldVnodeMap.get(oldVnode.id);

                    delta.parentId = removedNodeDetails?.parentNode.id
                }

                deltas.push(delta)
            }
        } else {
            if (newVnode && oldVnode && newVnode.id !== oldVnode.id) {
                movedNode    = newVnodeMap.get(oldVnode.id);
                movedOldNode = oldVnodeMap.get(newVnode.id);

                // console.log('movedNode', movedNode);
                // console.log('movedOldNode', movedOldNode);

                if (!movedNode && !movedOldNode) {
                    // Replace the current node
                    me.insertNode({deltas, index, newVnode, newVnodeMap, newVnodeRoot, oldVnodeMap, oldVnodeRoot, parentId});

                    return {
                        indexDelta: 0
                    }
                }

                // this case matches a typical array re-sorting
                else if (movedNode && movedOldNode && movedNode.parentNode.id === movedOldNode.parentNode.id) {
                    deltas.push({
                        action: 'moveNode',
                        id    : movedOldNode.vnode.id,
                        index,
                        parentId
                    });

                    me.createDeltas({
                        deltas,
                        newVnode,
                        newVnodeMap,
                        newVnodeRoot,
                        oldVnode: movedOldNode.vnode,
                        oldVnodeMap,
                        oldVnodeRoot,
                        parentId: movedNode.parentNode.id
                    });

                    // see: https://github.com/neomjs/neo/issues/3116
                    movedOldNode.parentNode.childNodes.splice(index, 0, movedOldNode);
                    me.createVnodeMap({vnode: oldVnodeRoot, map: oldVnodeMap, reset: true})
                } else if (!movedNode && movedOldNode) {
                    if (newVnode.id === movedOldNode.vnode.id) {
                        indexDelta = 0;

                        if (VNodeUtil.findChildVnodeById(oldVnode, newVnode.id)) {
                            let parentNode = newVnodeMap.get(parentId).vnode;

                            if (parentNode.childNodes.length === 1) {
                                // the old vnode replaced a parent vnode
                                // e.g.: vdom.cn[1] = vdom.cn[1].cn[0];
                                deltas.push({
                                    action: 'replaceChild',
                                    fromId: oldVnode.id,
                                    parentId,
                                    toId  : newVnode.id
                                })
                            } else {
                                /* the old vnode replaced a parent, but there are new or moved siblings.
                                 *
                                 * old vdom:
                                 * div id="level-1"
                                 *     div id="level-2"
                                 *         div id="level-3-1"
                                 *         div id="level-3-2"
                                 *
                                 * new vdom:
                                 * div id="level-1"
                                 *     div id="level-3-1"
                                 *     div id="level-3-2"
                                 *
                                 *  see: https://github.com/neomjs/neo/issues/5518
                                 */

                                let idx = 0; // correct index ignoring nodes which will get added later

                                parentNode.childNodes.forEach(node => {
                                    movedOldNode = oldVnodeMap.get(node.id);

                                    if (movedOldNode) {
                                        // this will trigger top-level move OPs

                                        me.createDeltas({
                                            deltas,
                                            index: idx,
                                            node,
                                            newVnodeMap,
                                            newVnodeRoot,
                                            oldVnode: movedOldNode.vnode,
                                            oldVnodeMap,
                                            oldVnodeRoot,
                                            parentId
                                        })
                                    } else {
                                        // the engine will add new nodes afterwards
                                        idx--
                                    }

                                    idx++
                                });

                                deltas.push({action: 'removeNode', id: oldVnode.id, parentId})
                            }
                        } else {
                            // the old vnode got moved into a different higher level branch
                            // and its parent got removed
                            // e.g.:
                            // vdom.cn[1] = vdom.cn[2].cn[0];
                            // vdom.cn.splice(2, 1);

                            let movedOldNodeDetails = oldVnodeMap.get(movedOldNode.vnode.id),
                                oldVnodeDetails     = oldVnodeMap.get(oldVnode.id);

                            indexDelta = 1;

                            if (movedOldNodeDetails.parentNode.id === oldVnodeDetails.parentNode.id) {
                                // console.log('potential move node', index, movedOldNodeDetails.index);

                                let newVnodeDetails = newVnodeMap.get(newVnode.id),
                                    targetIndex     = index + 1; // +1 since the current index will already get removed

                                // console.log(newVnodeDetails.parentNode);

                                i   = index + 1;
                                tmp = oldVnodeDetails.parentNode.childNodes;
                                len = movedOldNodeDetails.index;

                                for (; i < len; i++) {
                                    if (!VNodeUtil.findChildVnode(newVnodeDetails.parentNode, tmp[i].id)) {
                                        targetIndex ++
                                    }
                                }

                                // console.log(movedOldNodeDetails.index, targetIndex);

                                movedOldNodeDetails.parentNode.childNodes.splice(movedOldNodeDetails.index, 1);
                                me.createVnodeMap({vnode: oldVnodeRoot, map: oldVnodeMap, reset: true});

                                // do not move a node in case its previous sibling nodes will get removed
                                if (movedOldNodeDetails.index !== targetIndex) {
                                    deltas.push({
                                        action: 'moveNode',
                                        id    : movedOldNode.vnode.id,
                                        index,
                                        parentId
                                    })
                                }

                                indexDelta = 0
                            }

                            deltas.push({action: 'removeNode', id: oldVnode.id, parentId})
                        }

                        me.createDeltas({
                            deltas,
                            newVnode,
                            newVnodeMap,
                            newVnodeRoot,
                            oldVnode: movedOldNode.vnode,
                            oldVnodeMap,
                            oldVnodeRoot,
                            parentId
                        });

                        return {indexDelta}
                    } else {
                        // console.log('removed node', oldVnode.id, '('+newVnode.id+')');
                        deltas.push({action: 'removeNode', id: oldVnode.id});

                        return {
                            indexDelta: 1
                        }
                    }
                } else if (!movedOldNode) {
                    // new node inside a child array

                    wrappedNode = movedNode && VNodeUtil.findChildVnodeById(newVnode, oldVnode.id);

                    me.insertNode({deltas, index, newVnode, newVnodeMap, newVnodeRoot, oldVnodeMap, oldVnodeRoot, parentId});

                    return {
                        indexDelta: wrappedNode ? 0 : -1
                    }
                } else if (movedNode) {
                    indexDelta = 0;

                    // check if the vnode got moved inside the vnode tree

                    let newVnodeDetails = newVnodeMap.get(newVnode.id),
                        sameParent      = newVnodeDetails.parentNode.id === movedNode.parentNode.id;

                    if (sameParent) {
                        if (newVnodeDetails.index > movedNode.index) {
                            // todo: needs testing => index gaps > 1
                            indexDelta = newVnodeDetails.index - movedNode.index
                        }
                    }

                    if (!sameParent || newVnodeDetails.parentNode.childNodes[movedNode.index].id !== movedNode.vnode.id) {
                        deltas.push({
                            action: 'moveNode',
                            id      : movedNode.vnode.id,
                            index   : movedNode.index,
                            parentId: movedNode.parentNode.id
                        })
                    }

                    me.createDeltas({
                        deltas,
                        newVnode: movedNode.vnode,
                        newVnodeMap,
                        newVnodeRoot,
                        oldVnode,
                        oldVnodeMap,
                        oldVnodeRoot,
                        parentId: movedNode.parentNode.id
                    });

                    return {
                        indexDelta: 0
                    }
                }
            }

            if (newVnode && oldVnode && newVnode.id === oldVnode.id) {
                if (newVnode.vtype === 'text' && newVnode.innerHTML !== oldVnode.innerHTML) {
                    deltas.push({
                        action  : 'updateVtext',
                        id      : newVnode.id,
                        parentId: newVnodeMap.get(newVnode.id).parentNode.id,
                        value   : newVnode.innerHTML
                    })
                } else {
                    keys = Object.keys(newVnode);

                    Object.keys(oldVnode).forEach(prop => {
                        if (!newVnode.hasOwnProperty(prop)) {
                            keys.push(prop)
                        } else if (prop === 'attributes') { // find removed attributes
                            Object.keys(oldVnode[prop]).forEach(attr => {
                                if (!newVnode[prop].hasOwnProperty(attr)) {
                                    newVnode[prop][attr] = null;
                                }
                            })
                        }
                    });

                    keys.forEach(prop => {
                        delta = {};
                        value = newVnode[prop];

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
                                            delete newVnode.attributes[key]
                                        }
                                    })
                                }
                                break
                            case 'childNodes':
                                i          = 0;
                                indexDelta = 0;
                                len        = Math.max(value.length, oldVnode.childNodes.length);

                                for (; i < len; i++) {
                                    returnValue = me.createDeltas({
                                        deltas,
                                        index   : i,
                                        newVnode: value[i],
                                        newVnodeMap,
                                        newVnodeRoot,
                                        oldVnode: oldVnode.childNodes[i + indexDelta],
                                        oldVnodeMap,
                                        oldVnodeRoot,
                                        parentId: newVnode.id
                                    });

                                    if (returnValue && returnValue.indexDelta) {
                                        indexDelta += returnValue.indexDelta
                                    }
                                }

                                if (indexDelta < 0) {
                                    // this case happens for infinite scrolling upwards:
                                    // add new nodes at the start, remove nodes at the end
                                    for (i=value.length + indexDelta; i < oldVnode.childNodes.length; i++) {
                                        deltas.push({action: 'removeNode', id: oldVnode.childNodes[i].id})
                                    }
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
                                    delta.cls = {add, remove}
                                }
                                break
                        }

                        if (Object.keys(delta).length > 0) {
                            delta.id = newVnode.id;
                            deltas.push(delta)
                        }
                    })
                }
            }
        }

        return deltas
    }

    /**
     * @param {Object} vnode
     * @protected
     */
    createOpenTag(vnode) {
        let string       = '<' + vnode.nodeName,
            {attributes} = vnode,
            cls          = vnode.className,
            style;

        if (vnode.style) {
            style = Neo.createStyles(vnode.style);

            if (style !== '') {
                string += ` style="${style}"`
            }
        }

        if (cls) {
            if (Array.isArray(cls)) {
                cls = cls.join(' ')
            }

            if (cls !== '') {
                string += ` class="${cls}"`
            }
        }

        if (vnode.id) {
            if (Neo.config.useDomIds) {
                string += ` id="${vnode.id}"`
            } else {
                string += ` data-neo-id="${vnode.id}"`
            }
        }

        Object.entries(attributes).forEach(([key, value]) => {
            if (this.voidAttributes.includes(key)) {
                if (value === 'true') { // vnode attribute values get converted into strings
                    string += ` ${key}`
                }
            } else if (key !== 'removeDom') {
                if (key === 'value') {
                    value = NeoString.escapeHtml(value)
                }

                string += ` ${key}="${value?.replaceAll?.('"', '&quot;') ?? value}"`
            }
        });

        return string + '>'
    }

    /**
     * @param {Neo.vdom.VNode} vnode
     * @param {Map}            [movedNodes]
     */
    createStringFromVnode(vnode, movedNodes) {
        let me = this,
            id = vnode?.id;

        if (id && movedNodes?.get(id)) {
            return ''
        }

        switch (vnode.vtype) {
            case 'root':
                return me.createStringFromVnode(vnode.childNodes[0], movedNodes)
            case 'text':
                return vnode.innerHTML === undefined ? '' : String(vnode.innerHTML)
            case 'vnode':
                return me.createOpenTag(vnode) + me.createTagContent(vnode, movedNodes) + me.createCloseTag(vnode)
            default:
                return ''
        }
    }

    /**
     * @param {Neo.vdom.VNode} vnode
     * @param {Map}            [movedNodes]
     * @protected
     */
    createTagContent(vnode, movedNodes) {
        if (vnode.innerHTML) {
            return vnode.innerHTML
        }

        let string = '',
            len    = vnode.childNodes ? vnode.childNodes.length : 0,
            i      = 0,
            childNode, outerHTML;

        for (; i < len; i++) {
            childNode = vnode.childNodes[i];
            outerHTML = this.createStringFromVnode(childNode, movedNodes);

            if (childNode.innerHTML !== outerHTML) {
                if (this.returnChildNodeOuterHtml) {
                    childNode.outerHTML = outerHTML
                }
            }

            string += outerHTML
        }

        return string
    }

    /**
     * Creates a flap map of the tree, containing ids as keys and infos as values
     * @param {Object}         config
     * @param {Neo.vdom.VNode} config.vnode
     * @param {Neo.vdom.VNode} [config.parentNode=null]
     * @param {String[]}       [config.parentPath=[]]
     * @param {Number}         [config.index=0]
     * @param {Map}            [config.map=new Map()]
     * @param {Boolean}        [config.reset=false]
     * @returns {Map}
     *     {String}         id vnode.id (convenience shortcut)
     *     {Number}         index
     *     {String}         parentId
     *     {String[]}       parentPath
     *     {Neo.vdom.VNode} vnode
     */
    createVnodeMap(config) {
        let {vnode, parentNode=null, parentPath=[], index=0, map=new Map(), reset=false} = config,
            id = vnode?.id;

        parentNode && parentPath.push(parentNode.id);
        reset      && map.clear();

        map.set(id, {id, index, parentNode, parentPath, vnode});

        vnode?.childNodes?.forEach((childNode, index) => {
            this.createVnodeMap({vnode: childNode, parentNode: vnode, parentPath: [...parentPath], index, map})
        })

        return map
    }

    /**
     * The logic will parse the vnode (tree) to find existing items inside a given map.
     * It will not search for further childNodes inside an already found vnode.
     * @param {Neo.vdom.VNode} vnode
     * @param {Map}            newVnodeMap
     * @param {Map}            oldVnodeMap
     * @param {Map}            movedNodes=new Map()
     * @returns {Map}
     */
    findMovedNodes(vnode, newVnodeMap, oldVnodeMap, movedNodes=new Map()) {
        let id = vnode?.id;

        if (id) {
            let currentNode = oldVnodeMap.get(id)

            if (currentNode) {
                movedNodes.set(id, newVnodeMap.get(id))
            } else {
                let childNodes = vnode.childNodes,
                    i          = 0,
                    len        = childNodes?.length || 0;

                for (; i < len; i++) {
                    if (childNodes[i].vtype !== 'text') {
                        this.findMovedNodes(childNodes[i], newVnodeMap, oldVnodeMap, movedNodes)
                    }
                }
            }
        }

        return movedNodes
    }

    /**
     * @param {Object}         config
     * @param {Object[]}       config.deltas
     * @param {Number}         config.index
     * @param {Neo.vdom.VNode} config.newVnode
     * @param {Map}            config.newVnodeMap
     * @param {Object}         config.newVnodeRoot
     * @param {Map}            config.oldVnodeMap
     * @param {Object}         config.oldVnodeRoot
     * @param {String}         config.parentId
     * @returns {Object[]} deltas
     */
    insertNode(config) {
        let {deltas, index, newVnode, newVnodeMap, newVnodeRoot, oldVnodeMap, oldVnodeRoot, parentId} = config,
            me         = this,
            movedNodes = me.findMovedNodes(newVnode, newVnodeMap, oldVnodeMap);

        deltas.push({
            action   : 'insertNode',
            id       : newVnode.id,
            index,
            outerHTML: me.createStringFromVnode(newVnode, movedNodes),
            parentId
        });

        movedNodes.forEach(details => {
            let {id}     = details,
                parentId = details.parentNode.id;

            deltas.push({
                action: 'moveNode',
                id,
                index : details.index,
                parentId
            });

            me.createDeltas({
                deltas,
                newVnode: details.vnode,
                newVnodeMap,
                newVnodeRoot,
                oldVnode: oldVnodeMap.get(id).vnode,
                oldVnodeMap,
                oldVnodeRoot,
                parentId
            })
        });

        return deltas
    }

    /**
     * @param {Object} opts
     * @returns {Object|Neo.vdom.VNode|null}
     */
    parseHelper(opts) {
        if (opts.removeDom === true) {
            return null
        }

        if (typeof opts === 'string') {

        }

        if (opts.vtype === 'text') {
            if (!opts.id) {
                opts.id = Neo.getId('vtext') // adding an id to be able to find vtype='text' items inside the vnode tree
            }

            opts.innerHTML = `<!-- ${opts.id} -->${opts.html || ''}<!-- /neo-vtext -->`;
            delete opts.html;
            return opts
        }

        let me   = this,
            node = {attributes: {}, childNodes: [], style: {}},
            potentialNode;

        if (!opts.tag) {
            opts.tag = 'div'
        }

        Object.entries(opts).forEach(([key, value]) => {
            let hasUnit, newValue, style;

            if (value !== undefined && value !== null && key !== 'flag') {
                switch (key) {
                    case 'tag':
                    case 'nodeName':
                        node.nodeName = value;
                        break
                    case 'html':
                    case 'innerHTML':
                        node.innerHTML = value.toString(); // support for numbers
                        break
                    case 'children':
                    case 'childNodes':
                    case 'cn':
                        if (!Array.isArray(value)) {
                            value = [value]
                        }

                        newValue = [];

                        value.forEach(item => {
                            if (item.removeDom !== true) {
                                delete item.removeDom; // could be false
                                potentialNode = me.parseHelper(item);

                                if (potentialNode) { // don't add null values
                                    newValue.push(potentialNode)
                                }
                            }
                        });

                        node.childNodes = newValue;
                        break
                    case 'cls':
                        if (value && !Array.isArray(value)) {
                            node.className = [value]
                        } else if (!(Array.isArray(value) && value.length < 1)) {
                            node.className = value
                        }
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
                        hasUnit = value != parseInt(value);
                        node.style[key] = value + (hasUnit ? '' : 'px');
                        break
                    case 'id':
                        node.id = value;
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
                        if (key !== 'removeDom') { // could be set to false
                            node.attributes[key] = value + ''
                        }
                        break
                }
            }
        });

        return new VNode(node)
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
        let me   = this,
            node = me.parseHelper(opts.vdom),

        deltas = me.createDeltas({
            newVnode: node,
            oldVnode: opts.vnode
        }),

        returnObj = {
            deltas,
            updateVdom: true,
            vnode     : node
        };

        return Neo.config.useVdomWorker ? returnObj : Promise.resolve(returnObj)
    }
}

export default Neo.setupClass(Helper);
