import Manager   from './Base.mjs';
import VDomUtil  from '../util/VDom.mjs';
import VNodeUtil from '../util/VNode.mjs';

/**
 * @class Neo.manager.Component
 * @extends Neo.manager.Base
 * @singleton
 */
class Component extends Manager {
    static config = {
        /**
         * @member {String} className='Neo.manager.Component'
         * @protected
         */
        className: 'Neo.manager.Component',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * A reverse map to track direct children for each component.
     * Keys are parent component IDs, values are Sets of child component IDs.
     * This enables O(1) retrieval of direct children, optimizing VDOM syncing and destruction logic.
     * @member {Map<String, Set<String>>} childMap=new Map()
     */
    childMap = new Map()

    /**
     * The same reverse shape as `childMap`, for the OWNER rather than the render parent.
     * Keys are `parentComponent` ids, values are Sets of component ids.
     * The two disagree only while something holds a component outside its owner's node — a drag proxy is
     * the one case in the engine today — and `getOwnedChildren()` is where they are read together.
     * @member {Map<String, Set<String>>} ownerMap=new Map()
     */
    ownerMap = new Map()

    /**
     * @member {Map} wrapperNodes=new Map()
     */
    wrapperNodes = new Map()

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        Neo.first        = me.getFirst.bind(me); // alias
        Neo.getComponent = me.get     .bind(me)  // alias
    }

    /**
     * Adds one id to a reverse index, creating the bucket when it is the first entry.
     * @param {Map<String, Set<String>>} index
     * @param {String} key
     * @param {String} id
     * @protected
     */
    addToIndex(index, key, id) {
        let set = index.get(key);

        if (!set) {
            set = new Set();
            index.set(key, set)
        }

        set.add(id)
    }

    /**
     * Flattens a given vnode tree by replacing component based subtrees with componentId based references
     * @param {Object} vnode
     * @param {String} ownerId We do not want to replace the own id => wrapped items
     * @returns {Object}
     */
    addVnodeComponentReferences(vnode, ownerId) {
        vnode = {...vnode}; // shallow copy

        let me         = this,
            childNodes = vnode?.childNodes ? [...vnode.childNodes] : [];

        vnode.childNodes = childNodes;

        for (let index = 0, len = childNodes.length; index < len; index++) {
            const childNode = childNodes[index];

            let
                childNodeId = childNode.id,
                component,
                componentId,
                parentRef,
                referenceNode;

            if (!childNode.componentId && childNodeId !== ownerId) {
                component = me.get(childNodeId);

                if (!component) {
                    // searching for wrapped components as a fallback
                    component = me.wrapperNodes.get(childNodeId);

                    if (component) {
                        // update the parent component reference => assign the wrapper id
                        componentId = component.id;
                        parentRef   = VDomUtil.find(component.parent.vdom, {componentId}, false);

                        if (parentRef) {
                            parentRef.vdom.id = childNodeId
                        }
                    }
                }

                if (component) {
                    componentId   = component.id;
                    referenceNode = {componentId, id: childNodeId}
                }
            }

            childNodes[index] = component ? referenceNode : me.addVnodeComponentReferences(childNode, ownerId)
        }

        return vnode
    }

    /**
     * Returns the first component which matches the config-selector moving down the component items tree.
     * Use returnFirstMatch=false to get an array of all matching items instead.
     * If no match is found, returns null in case returnFirstMatch === true, otherwise an empty Array.
     * @param {Neo.component.Base|String} component
     * @param {Object|String|null} config
     * @param {Boolean} returnFirstMatch=true
     * @returns {Neo.component.Base|Neo.component.Base[]|null}
     */
    down(component, config, returnFirstMatch=true) {
        if (Neo.isString(component)) {
            component = this.getById(component);
        }

        let me          = this,
            matchArray  = [],
            returnValue = null,
            i           = 0,
            returnArray = [],
            childItems, configArray, configLength, len;

        if (Neo.isString(config)) {
            config = {
                ntype: config
            }
        } else if (!config) {
            config = {}
        }

        configArray  = Object.entries(config);
        configLength = configArray.length;

        configArray.forEach(([key, value]) => {
            if ((component[key] === value)
                || (key === 'ntype' && me.hasPrototypePropertyValue(component, key, value)))
            {
                matchArray.push(true)
            }
        });

        if (matchArray.length === configLength) {
            if (returnFirstMatch) {
                return component
            }

            returnArray.push(component)
        }

        childItems = me.getOwnedChildren(component);
        len        = childItems.length;

        for (; i < len; i++) {
            returnValue = me.down(childItems[i], config, returnFirstMatch);

            if (returnFirstMatch) {
                if (returnValue !== null) {
                    return returnValue
                }
            } else if (returnValue.length > 0) {
                returnArray.push(...returnValue)
            }
        }

        return returnFirstMatch ? null: returnArray
    }

    /**
     * @param {Object[]} path
     * @returns {String|null} the component id in case there is a match
     */
    findParentComponent(path) {
        let me  = this,
            i   = 0,
            len = path?.length || 0,
            id;

        for (; i < len; i++) {
            id = path[i];

            if (id && me.has(id)) {
                return id
            }
        }

        return null
    }

    /**
     * Returns the object associated to the key, or null if there is none.
     * @param {Number|String} key
     * @param {Boolean}       [includeWrapperNodes=true]
     * @returns {Neo.component.Base|null}
     */
    get(key, includeWrapperNodes=true) {
        if (includeWrapperNodes) {
            let wrapperNode = this.wrapperNodes.get(key);

            if (wrapperNode) {
                return wrapperNode
            }
        }

        return super.get(key)
    }

    /**
     * Returns all child components which are recursively matched via their parentId
     * @param {Neo.component.Base} component
     * @returns {Neo.component.Base[]} childComponents
     */
    getChildComponents(component) {
        let me             = this,
            directChildren = me.getDirectChildren(component.id),
            components     = [],
            childComponents;

        directChildren.forEach(item => {
            components.push(item);

            childComponents = me.getChildComponents(item);

            childComponents && components.push(...childComponents)
        });

        return components
    }

    /**
     * todo: replace all calls of this method to calls using the util.VNode class
     * Get the ids of all child nodes of the given vnode
     * @param {Object} vnode
     * @param {String[]} childIds=[]
     * @returns {String[]} childIds
     */
    getChildIds(vnode, childIds=[]) {
        return VNodeUtil.getChildIds(vnode, childIds)
    }

    /**
     * Returns all child components found inside the vnode tree
     * @param {Neo.component.Base} component
     * @returns {Neo.component.Base[]} childComponents
     */
    getChildren(component) {
        let childComponents = [],
            childNodes      = VNodeUtil.getChildIds(component.vnode),
            childComponent;

        childNodes.forEach(node => {
            childComponent = this.get(node);

            if (childComponent) {
                childComponents.push(childComponent)
            }
        });

        return childComponents
    }

    /**
     * Returns an array of direct child components for a given parentId.
     * Uses the optimized `childMap` for O(1) lookup performance, avoiding the need to iterate
     * over all components in the manager.
     * @param {String} parentId
     * @returns {Neo.component.Base[]}
     */
    getDirectChildren(parentId) {
        if (!parentId) return [];

        let me  = this,
            ids = me.childMap.get(parentId),
            children;

        if (!ids) return [];

        children = [];

        ids.forEach(id => {
            let component = me.get(id);
            if (component) {
                children.push(component)
            } else {
                // Cleanup dead references if any (should typically be handled by unregister)
                ids.delete(id)
            }
        });

        return children
    }

    /**
     * @summary Returns the direct children a component OWNS: the ones it renders, plus the ones a proxy holds for it.
     *
     * `getDirectChildren()` answers the render question — who sits inside this node — and DOM consumers depend on
     * that exact meaning (`mixin.VdomLifecycle` unmounts by it). Ownership is the wider question, and the two
     * differ for exactly as long as a drag lasts: `draggable.DragProxyContainer` roots the dragged component at
     * `document.body` and keeps the container it came from as `parentComponent`, so the render parent and the
     * owner are two different components. `component.Abstract#parent` already ranks them owner-first; this is
     * the same ranking, walked downwards.
     *
     * A component reachable both ways is returned once.
     * @param {Neo.component.Base} component
     * @returns {Neo.component.Base[]}
     */
    getOwnedChildren(component) {
        let me       = this,
            children = me.getDirectChildren(component.id),
            ownedIds = me.ownerMap.size && me.ownerMap.get(component.id);

        // `ownerMap` is empty in most apps and small in the rest — seven assignments of `parentComponent`
        // exist in the engine — so the size check keeps the common walk at one Map read per node
        if (ownedIds) {
            const rendered = new Set(children.map(child => child.id));

            ownedIds.forEach(id => {
                const owned = !rendered.has(id) && me.get(id);

                owned && children.push(owned)
            })
        }

        return children
    }

    /**
     * Returns the distance between a child and a parent component
     * @param {String} childId
     * @param {String} parentId
     * @returns {Number} -1 if not found
     */
    getDistance(childId, parentId) {
        let child    = this.get(childId),
            distance = 0;

        while (child?.parentId) {
            distance++;

            if (child.parentId === parentId) {
                return distance
            }
            child = this.get(child.parentId)
        }

        return -1
    }

    /**
     * !! For debugging purposes only !!
     *
     * Get the first component based on the ntype or other properties
     *
     * @param {String|Object|Array} componentDescription
     * @param {Boolean} returnFirstMatch=true
     * @returns {Neo.component.Base|null|Neo.component.Base[]}
     *
     * @example
     // as String: ntype[comma separated propterties]
     Neo.first('toolbar button[text=Try me,icon=people]')
     // as Object: Add properties. ntype is optional
     Neo.first({
                icon: 'people'
            })
     // as Array: An Array of Objects. No Strings allowed
     Neo.first([{
                ntype: 'toolbar'
            },{
                ntype: 'button', text: 'Try me', icon: 'people
            }])

     * The returnFirstMatch flag allows to return all items and
     * not stop after the first result.
     *
     * @example
     Neo.first('button', false) // => [Button, Button, Button]
     */
    getFirst(componentDescription, returnFirstMatch=true) {
        let objects = [],
            app     = Object.values(Neo.apps)[0],
            root    = app.mainView;

        /* create an array of objects from string */
        if (Neo.isString(componentDescription)) {
            const regex = /(\w*)(\[[^\]]*\])|(\w*)/g;
            let match;

            /* generate objects which contain the information */
            while (match = regex.exec(componentDescription)) {
                let [, ntype, pairs, ntypeOnly] = match, obj;

                ntype = ntype || ntypeOnly;
                obj = {ntype};

                if (pairs) {
                    const pairsRegex = /\[(.*?)\]/,
                          pairsMatch = pairs.match(pairsRegex);

                    if (pairsMatch) {
                        const pairs = pairsMatch[1].split(',');
                        pairs.forEach((pair) => {
                            const [key, value] = pair.split('=');
                            obj[key] = value.replace(/"/g, '')
                        });
                    }
                }
                objects.push(obj);

                regex.lastIndex++
            }
        } else if (Neo.isObject(componentDescription)){
            objects.push(componentDescription)
        } else if (Neo.isArray(componentDescription)) {
            objects = componentDescription
        }

        /* find the correct child using down() */
        const result = objects.reduce((acc, key) => {
            if (acc) {
                let child = acc.down(key, returnFirstMatch);

                if (!!child) {
                    return child
                }
            }

            return null
        }, root);

        return result
    }

    /**
     * Returns an Array containing the ids of all parent components for a given component
     * @param {Neo.component.Base} component
     * @returns {String[]} parentIds
     */
    getParentIds(component) {
        let parentIds = [];

        while (component?.parentId) {
            component = this.get(component.parentId);

            if (component) {
                parentIds.push(component.id)
            }
        }

        return parentIds
    }

    /**
     * @param {Array} path
     * @returns {Array}
     */
    getParentPath(path) {
        let me            = this,
            componentPath = [],
            i             = 0,
            len           = path?.length || 0,
            component, id;

        for (; i < len; i++) {
            id = path[i];

            if (me.has(id) || me.wrapperNodes.get(id)) {
                component = me.get(id);

                while (component) {
                    componentPath.push(component.id);
                    component = component.parent
                }

                break
            }
        }

        return componentPath
    }

    /**
     * Returns an Array containing all parent components for a given component or component id
     * @param {Neo.component.Base|String} component
     * @returns {Neo.component.Base[]} parents
     */
    getParents(component) {
        if (Neo.isString(component)) {
            component = this.get(component)
        }

        let parents = [];

        while (component?.parentId) {
            component = this.get(component.parentId);

            if (component) {
                parents.push(component)
            }
        }

        return parents
    }

    /**
     * Checks if a component is a descendant of another component
     * @param {String} childId
     * @param {String} parentId
     * @returns {Boolean}
     */
    hasParent(childId, parentId) {
        let child = this.get(childId);

        while (child?.parentId) {
            if (child.parentId === parentId) {
                return true
            }
            child = this.get(child.parentId)
        }

        return false
    }

    /**
     * Check if the component had a property of any value somewhere in the Prototype chain
     *
     * @param {Neo.component.Base} component
     * @param {String} property
     * @param {*} value
     * @returns {boolean}
     */
    hasPrototypePropertyValue(component, property, value) {
        while (component !== null) {
            if (component.hasOwnProperty(property) && component[property] === value) {
                return true
            }

            component = component.__proto__
        }

        return false
    }

    /**
     * Keeps the `ownerMap` in step with a component's `parentComponent` config, the way `onParentIdChange()`
     * keeps the `childMap` in step with `parentId`.
     * @param {Neo.component.Base} component
     * @param {Neo.component.Base|null} oldParentComponent
     */
    onParentComponentChange(component, oldParentComponent) {
        let me = this;

        oldParentComponent && me.removeFromIndex(me.ownerMap, oldParentComponent.id, component.id);
        component.parentComponent && me.addToIndex(me.ownerMap, component.parentComponent.id, component.id)
    }

    /**
     * Updates the `childMap` when a component's `parentId` config changes.
     * Maintains the integrity of the reverse parent-child index.
     * @param {Neo.component.Base} component
     * @param {String|null} oldParentId
     */
    onParentIdChange(component, oldParentId) {
        let me = this;

        oldParentId && me.removeFromIndex(me.childMap, oldParentId, component.id);
        component.parentId && me.addToIndex(me.childMap, component.parentId, component.id)
    }

    /**
     * Registers a component and adds it to the `childMap` if it has a parentId.
     * @param {Object} item
     */
    register(item) {
        super.register(item);

        let me                              = this,
            {id, parentComponent, parentId} = item;

        parentId        && me.addToIndex(me.childMap, parentId,           id);
        parentComponent && me.addToIndex(me.ownerMap, parentComponent.id, id)
    }

    /**
     * Removes one id from a reverse index, dropping the bucket when it empties.
     * @param {Map<String, Set<String>>} index
     * @param {String} key
     * @param {String} id
     * @protected
     */
    removeFromIndex(index, key, id) {
        const set = index.get(key);

        if (set) {
            set.delete(id);
            set.size === 0 && index.delete(key)
        }
    }

    /**
     * @param {String} wrapperId
     * @param {Neo.component.Base} component
     */
    registerWrapperNode(wrapperId, component) {
        this.wrapperNodes.set(wrapperId, component)
    }

    /**
     * Unregisters a component, cleaning up wrapper nodes and `childMap` references.
     * @param {Neo.component.Base|String} item
     */
    unregister(item) {
        let me        = this,
            component = item;

        if (item) {
            if (Neo.isString(item)) {
                me.wrapperNodes.delete(item);
                component = me.get(item)
            }

            if (component) {
                const {id, parentComponent, parentId, vdom} = component;

                if (vdom && id !== vdom.id) {
                    me.wrapperNodes.delete(vdom.id)
                }

                parentId        && me.removeFromIndex(me.childMap, parentId,           id);
                parentComponent && me.removeFromIndex(me.ownerMap, parentComponent.id, id)
            }
        }

        super.unregister(item)
    }

    /**
     * Returns the first component which matches the config-selector.
     * Use returnFirstMatch=false to get an array of all matching items instead.
     * If no match is found, returns null in case returnFirstMatch === true, otherwise an empty Array.
     * @param {String} componentId
     * @param {Object|String|null} config
     * @param {Boolean} returnFirstMatch=true
     * @returns {Neo.component.Base|Neo.component.Base[]|null}
     */
    up(componentId, config, returnFirstMatch=true) {
        let component   = this.get(componentId),
            returnArray = [],
            configArray, configLength, matchArray;

        if (Neo.isString(config)) {
            config = {
                ntype: config
            }
        } else if (!config) {
            config = {}
        }

        configArray  = Object.entries(config);
        configLength = configArray.length;

        // `parent` prefers the OWNER over the render parent, which is the only way out of a drag proxy:
        // it roots the dragged component at `document.body`, so a `parentId` walk leaves the owning tree
        while (component) {
            component = component.parent;

            if (!component) {
                return returnFirstMatch ? null : returnArray
            }

            matchArray = [];

            configArray.forEach(([key, value]) => {
                if (component[key] === value) {
                    matchArray.push(true)
                }
            });

            if (matchArray.length === configLength) {
                if (returnFirstMatch) {
                    return component
                }

                returnArray.push(component)
            }
        }
    }
}

export default Neo.setupClass(Component);
