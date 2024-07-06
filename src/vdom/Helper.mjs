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
     * @param {Object[]}       config.deltas
     * @param {Neo.vdom.VNode} config.oldVnode
     * @param {Neo.vdom.VNode} config.vnode
     * @param {Neo.vdom.VNode} config.vnodeMap
     * @returns {Object[]} deltas
     */
    compareAttributes(config) {
        let {deltas, oldVnode, vnode, vnodeMap} = config,
            attributes, delta, value, keys, styles, add, remove;

        if (vnode.vtype === 'text' && vnode.innerHTML !== oldVnode.innerHTML) {
            deltas.push({
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
                            vnode[prop][attr] = null;
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
                            delta.cls = {add, remove}
                        }
                        break
                }

                if (Object.keys(delta).length > 0) {
                    delta.id = vnode.id;
                    deltas.push(delta)
                }
            })
        }

        return deltas
    }

    /**
     * @param {Object}         config
     * @param {Object[]}       config.deltas=[]
     * @param {Neo.vdom.VNode} config.oldVnode
     * @param {Neo.vdom.VNode} config.oldVnodeMap
     * @param {Neo.vdom.VNode} config.vnode
     * @param {Neo.vdom.VNode} config.vnodeMap
     * @returns {Object[]} deltas
     */
    createDeltas(config) {
        let {deltas=[], oldVnode, vnode} = config;

        if (vnode.id !== oldVnode.id) {
            throw new Error(`createDeltas() must get called for the same node. ${vnode.id}, ${oldVnode.id}`);
        }

        let me            = this,
            oldVnodeMap   = config.oldVnodeMap || me.createVnodeMap({vnode: oldVnode}),
            vnodeMap      = config.vnodeMap    || me.createVnodeMap({vnode}),
            {childNodes}  = vnode,
            oldChildNodes = oldVnode.childNodes,
            i             = 0,
            indexDelta    = 0,
            len           = Math.max(childNodes.length, oldChildNodes.length),
            childNode, oldChildNode;

        me.compareAttributes({deltas, oldVnode, vnode, vnodeMap});

        for (; i < len; i++) {
            childNode    = childNodes[i];
            oldChildNode = oldChildNodes[i];

            if (childNode && oldChildNode) {
                if (childNode.id === oldChildNode.id) {
                    me.createDeltas({deltas, oldVnode: oldChildNode, oldVnodeMap, vnode: childNode, vnodeMap})
                } else {
                    if (oldChildNode && !vnodeMap.get(oldChildNode.id)) {
                        deltas.push({action: 'removeNode', id: oldChildNode.id});

                        NeoArray.remove(oldVnodeMap.get(oldChildNode.id).parentNode.childNodes, oldChildNode);
                        i--;
                        continue
                    }

                    me.insertOrMoveNode({deltas, oldVnodeMap, vnode: childNode, vnodeMap});
                }
            } else if (childNode) {
                me.insertOrMoveNode({deltas, oldVnodeMap, vnode: childNode, vnodeMap})
            } else if (oldChildNode) {
                // Remove node, if no longer inside the new tree
                if (!vnodeMap.get(oldChildNode.id)) {
                    deltas.push({action: 'removeNode', id: oldChildNode.id})
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
     * @param {Object}         config
     * @param {Map}            config.movedNodes=new Map()
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
     * @param {Object[]}       config.deltas
     * @param {Map}            config.oldVnodeMap
     * @param {Neo.vdom.VNode} config.vnode
     * @param {Map}            config.vnodeMap
     * @returns {Object[]} deltas
     */
    insertNode(config) {
        let {deltas, oldVnodeMap, vnode, vnodeMap} = config,
            details    = vnodeMap.get(vnode.id),
            {index}    = details,
            parentId   = details.parentNode.id,
            me         = this,
            movedNodes = me.findMovedNodes({oldVnodeMap, vnode, vnodeMap});

        deltas.push({
            action   : 'insertNode',
            id       : vnode.id,
            index,
            outerHTML: me.createStringFromVnode(vnode, movedNodes),
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
                oldVnode: oldVnodeMap.get(id).vnode,
                oldVnodeMap,
                vnode: details.vnode,
                vnodeMap,
            })
        });

        return deltas
    }

    /**
     * @param {Object}         config
     * @param {Object[]}       config.deltas
     * @param {Map}            config.oldVnodeMap
     * @param {Neo.vdom.VNode} config.vnode
     * @param {Map}            config.vnodeMap
     * @returns {Object[]} deltas
     */
    insertOrMoveNode(config) {
        let {deltas, oldVnodeMap, vnode, vnodeMap} = config,
            details   = vnodeMap.get(vnode.id),
            {index}   = details,
            parentId  = details.parentNode.id,
            movedNode = oldVnodeMap.get(vnode.id),
            me        = this,
            movedParentNode;

        if (!movedNode) {
            me.insertNode(config)
        } else {
            console.log(vnode.id, index, movedNode.parentNode.childNodes.indexOf(movedNode.vnode), [...movedNode.parentNode.childNodes]);

            deltas.push({
                action: 'moveNode',
                id      : vnode.id,
                index,
                parentId
            });

            me.createDeltas({deltas, oldVnode: movedNode.vnode, oldVnodeMap, vnode, vnodeMap});

            movedParentNode = movedNode.parentNode;

            if (parentId === movedParentNode.id) {
                let {childNodes} = movedParentNode;

                NeoArray.move(childNodes, childNodes.indexOf(movedNode.vnode), index)
            }
        }

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
        let me     = this,
            vnode  = me.parseHelper(opts.vdom),
            deltas = me.createDeltas({oldVnode: opts.vnode, vnode});

        /*
         * Instead of managing 2 separate arrays for removeNode deltas & other OPs (which we'd need to pass to several methods),
         * we just order the resulting deltas here.
         *
         * Rationale: Trees to remove could contain nodes which we want to re-use (move),
         * so we need to execute the removeNode OPs last.
         */

        deltas = [
            ...deltas.filter(item => item.action !== 'removeNode'),
            ...deltas.filter(item => item.action === 'removeNode')
        ];

        let returnObj = {deltas, updateVdom: true, vnode};

        return Neo.config.useVdomWorker ? returnObj : Promise.resolve(returnObj)
    }
}

export default Neo.setupClass(Helper);
