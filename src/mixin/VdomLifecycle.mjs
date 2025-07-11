import Base             from '../core/Base.mjs';
import ComponentManager from '../manager/Component.mjs';
import VDomUtil         from '../util/VDom.mjs';
import VNodeUtil        from '../util/VNode.mjs';
import {isDescriptor}   from '../core/ConfigSymbols.mjs';

const
    {currentWorker} = Neo;

/**
 * @class Neo.mixin.VdomLifecycle
 * @extends Neo.core.Base
 */
class VdomLifecycle extends Base {
    static config = {
        /**
         * @member {String} className='Neo.mixin.VdomLifecycle'
         * @protected
         */
        className: 'Neo.mixin.VdomLifecycle',
        /**
         * True automatically mounts a component after being rendered.
         * Use this for the top level component of your app.
         * @member {Boolean} autoMount=false
         * @tutorial 02_ClassSystem
         */
        autoMount: false,
        /**
         * True automatically renders a component after being created inside the init call.
         * Use this for the top level component of your app.
         * @member {Boolean} autoRender=false
         * @see {@link Neo.component.Base#init init}
         * @tutorial 02_ClassSystem
         */
        autoRender: false,
        /**
         * Internal flag for vdom changes after a component got unmounted
         * (delta updates can no longer get applied & a new render call is required before re-mounting)
         * @member {Boolean} hasUnmountedVdomChanges_=false
         * @protected
         * @reactive
         */
        hasUnmountedVdomChanges_: false,
        /**
         * Internal flag which will get set to true while an update request (worker messages) is in progress
         * @member {Boolean} isVdomUpdating_=false
         * @protected
         * @reactive
         */
        isVdomUpdating_: false,
        /**
         * True in case the component is mounted to the DOM
         * @member {Boolean} mounted_=false
         * @protected
         * @reactive
         */
        mounted_: false,
        /**
         * Internal flag which will get set to true in case an update call arrives while another update is running
         * @member {Boolean} needsVdomUpdate_=false
         * @protected
         * @reactive
         */
        needsVdomUpdate_: false,
        /**
         * True in case the component is rendering the vnode
         * @member {Boolean} rendering_=false
         * @protected
         * @reactive
         */
        rendering_: false,
        /**
         * Set this to true for bulk updates. Ensure to set it back to false afterwards.
         * Internally the value will get saved as a number to ensure that child methods won't stop the silent mode too early.
         * @member {Boolean} silentVdomUpdate_=false
         * @reactive
         */
        silentVdomUpdate_: false,
        /**
         * Defines the depth of the vdom tree for the next update cycle.
         * - The value 1 will only send the current vdom structure as it is
         * - The value of 2 will include the vdom of direct children
         * - The value of 3 will include the vdom of grandchildren
         * - The value of -1 will include the full tree of any depth
         * @member {Number} updateDepth_=1
         * @reactive
         */
        updateDepth_: 1,
        /**
         * The component vnode tree. Available after the component got rendered.
         * @member {Object} vnode_=={[isDescriptor]: true, value: null, isEqual: (a, b) => a === b,}
         * @protected
         * @reactive
         */
        vnode_: {
            [isDescriptor]: true,
            clone         : 'none',
            cloneOnGet    : 'none',
            isEqual       : (a, b) => a === b, // vnode trees can be huge, and will get compared by the vdom worker.
            value         : null,
        }
    }

    /**
     * Triggered after the hasUnmountedVdomChanges config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetHasUnmountedVdomChanges(value, oldValue) {
        if (value || (!value && oldValue)) {
            let parentIds = ComponentManager.getParentIds(this),
                i         = 0,
                len       = parentIds.length,
                parent;

            for (; i < len; i++) {
                parent = Neo.getComponent(parentIds[i]);

                if (parent) {
                    parent._hasUnmountedVdomChanges = value // silent update
                }
            }
        }
    }

    /**
     * Triggered after the isVdomUpdating config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetIsVdomUpdating(value, oldValue) {
        this.currentUpdateDepth = value ? this.updateDepth : null
    }

    /**
     * Triggered after the vdom pseudo-config got changed
     * @param {Object} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetVdom(value, oldValue) {
        this.updateVdom()
    }

    /**
     * Triggered after the vnode config got changed
     * @param {Object} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetVnode(value, oldValue) {
        oldValue !== undefined && this.syncVnodeTree()
    }

    /**
     * Triggers all stored resolve() callbacks
     */
    doResolveUpdateCache() {
        let me = this;

        if (me.resolveUpdateCache) {
            me.resolveUpdateCache.forEach(item => item());
            me.resolveUpdateCache = []
        }
    }

    /**
     * Internal method to send update requests to the vdom worker
     * @param {function} [resolve] used by promiseUpdate()
     * @param {function} [reject] used by promiseUpdate()
     * @private
     */
    executeVdomUpdate(resolve, reject) {
        let me            = this,
            {vdom, vnode} = me,
            opts          = {},
            deltas;

        if (currentWorker.isSharedWorker) {
            opts.appName  = me.appName;
            opts.windowId = me.windowId
        }

        me.isVdomUpdating = true;

        // we can not set the config directly => it could already be false,
        // and we still want to pass it further into subtrees
        me._needsVdomUpdate = false;
        me.afterSetNeedsVdomUpdate?.(false, true);

        opts.vdom  = ComponentManager.getVdomTree(vdom, me.updateDepth);
        opts.vnode = ComponentManager.getVnodeTree(vnode, me.updateDepth);

        // Reset the updateDepth to the default value for the next update cycle
        me._updateDepth = me.constructor.config.updateDepth;

        Neo.vdom.Helper.update(opts).catch(err => {
            me.isVdomUpdating = false;
            reject?.()
        }).then(data => {
            // Checking if the component got destroyed before the update cycle is done
            if (me.id) {
                // It is crucial to delegate the vnode tree before resolving the cycle
                me.vnode          = data.vnode;
                me.isVdomUpdating = false;

                deltas = data.deltas;

                if (!Neo.config.useVdomWorker && deltas.length > 0) {
                    Neo.applyDeltas(me.appName, deltas).then(() => {
                        me.resolveVdomUpdate(resolve)
                    })
                } else {
                    me.resolveVdomUpdate(resolve)
                }
            }
        })
    }

    /**
     * Honors different item roots for mount / render OPs
     * @returns {String}
     */
    getMountedParentId() {
        let parentId  = this.parentId,
            parent    = Neo.getComponent(parentId),
            itemsRoot = parent?.getVdomItemsRoot?.();

        return itemsRoot ? itemsRoot.id : parentId
    }

    /**
     * Calculate the real parentIndex inside the DOM
     * @returns {Number|undefined}
     */
    getMountedParentIndex() {
        let parent = this.parent,
            items  = parent?.items || [],
            i      = 0,
            index  = 0,
            len    = items.length,
            item;

        for (; i < len; i++) {
            item = items[i];

            if (item === this) {
                return index
            }

            if (!item.hidden && item.hideMode === 'removeDom') {
                index++
            }
        }
    }

    /**
     * Search a vdom child node by id for a given vdom tree
     * @param {String} id
     * @param {Object} vdom=this.vdom
     * @returns {Object}
     */
    getVdomChild(id, vdom=this.vdom) {
        return VDomUtil.find(vdom, id)?.vdom
    }

    /**
     * Specify a different vdom root if needed to apply the top level style attributes on a different level.
     * Make sure to use getVnodeRoot() as well, to keep the vdom & vnode trees in sync.
     * @returns {Object} The new vdom root
     */
    getVdomRoot() {
        return this.vdom
    }

    /**
     * Specify a different vnode root if needed to apply the top level style attributes on a different level.
     * Make sure to use getVdomRoot() as well, to keep the vdom & vnode trees in sync.
     * @returns {Object} The new vnode root
     */
    getVnodeRoot() {
        return this.vnode
    }

    /**
     * Checks if a given updateDepth & distance would result in an update collision
     * @param {Number} updateDepth
     * @param {Number} distance
     * @returns {Boolean}
     */
    hasUpdateCollision(updateDepth, distance) {
        return updateDepth === -1 ? true : distance < updateDepth
    }

    /**
     * Checks for vdom updates inside the parent chain and if found.
     * Registers the component for a vdom update once done.
     * @param {String} parentId=this.parentId
     * @param {Function} [resolve] Gets passed by updateVdom()
     * @param {Number} distance=1 Distance inside the component tree
     * @returns {Boolean}
     */
    isParentUpdating(parentId=this.parentId, resolve, distance=1) {
        if (parentId !== 'document.body') {
            let me     = this,
                parent = Neo.getComponent(parentId);

            if (parent) {
                if (parent.isVdomUpdating) {
                    if (me.hasUpdateCollision(parent.currentUpdateDepth, distance)) {
                        if (Neo.config.logVdomUpdateCollisions) {
                            console.warn('vdom parent update conflict with:', parent, 'for:', me)
                        }

                        parent.childUpdateCache[me.id] = {distance, resolve};

                        // Adding the resolve fn to its own cache, since the parent will trigger
                        // a new update() directly on this cmp
                        resolve && me.resolveUpdateCache.push(resolve);
                        return true
                    }

                    // If an update is running and does not have a collision, we do not need to check further parents
                    return false
                }

                return me.isParentUpdating(parent.parentId, resolve, distance+1)
            }
        }

        return false
    }

    /**
     * Checks the needsVdomUpdate config inside the parent tree
     * @param {String} parentId=this.parentId
     * @param {Function} [resolve] gets passed by updateVdom()
     * @param {Number} distance=1 Distance inside the component tree
     * @returns {Boolean}
     */
    needsParentUpdate(parentId=this.parentId, resolve, distance=1) {
        if (parentId !== 'document.body') {
            let me     = this,
                parent = Neo.getComponent(parentId);

            if (parent) {
                // We are checking for parent.updateDepth, since we care about the depth of the next update cycle
                if (parent.needsVdomUpdate && me.hasUpdateCollision(parent.updateDepth, distance)) {
                    parent.resolveUpdateCache.push(...me.resolveUpdateCache);
                    resolve && parent.resolveUpdateCache.push(resolve);
                    me.resolveUpdateCache = [];
                    return true
                }

                return me.needsParentUpdate(parent.parentId, resolve, distance+1)
            }
        }

        return false
    }

    /**
     * Gets called from the render() promise success handler
     * @param {Object} vnode
     * @param {Boolean} autoMount Mount the DOM after the vnode got created
     * @protected
     */
    onRender(vnode, autoMount) {
        let me    = this,
            {app} = me;

        me.rendering = false;

        // if app is a check to see if the Component got destroyed while rendering => before onRender got triggered
        if (app) {
            if (!app.rendered) {
                app.rendering = false;
                app.rendered = true;
                app.fire('render')
            }

            me.vnode = vnode;

            let childIds = ComponentManager.getChildIds(vnode),
                i        = 0,
                len      = childIds.length,
                child;

            for (; i < len; i++) {
                child = Neo.getComponent(childIds[i]);

                if (child) {
                    child.rendered = true
                }
            }

            me._rendered = true; // silent update
            me.fire('rendered', me.id);

            if (autoMount) {
                me.mounted = true;

                if (!app.mounted) {
                    app.mounted = true;
                    app.fire('mounted')
                }
            }
        }
    }

    /**
     * Promise based vdom update
     * @returns {Promise<any>}
     */
    promiseUpdate() {
        return new Promise((resolve, reject) => {
            this.updateVdom(resolve, reject)
        })
    }

    /**
     * Creates the vnode tree for this component and mounts the component in case
     * - you pass true for the mount param
     * - or the autoMount config is set to true
     * @param {Boolean} [mount] Mount the DOM after the vnode got created
     */
    async render(mount) {
        let me                            = this,
            autoMount                     = mount || me.autoMount,
            {app}                         = me,
            {unitTestMode, useVdomWorker} = Neo.config;

        if (unitTestMode) return;

        // Verify that the critical rendering path => CSS files for the new tree is in place
        if (autoMount && currentWorker.countLoadingThemeFiles !== 0) {
            currentWorker.on('themeFilesLoaded', function() {
                !me.mounted && me.render(mount)
            }, me, {once: true});

            return
        }

        me.rendering = true;

        if (!app.rendered) {
            app.rendering = true
        }

        if (me.vdom) {
            me.isVdomUpdating = true;

            delete me.vdom.removeDom;

            me._needsVdomUpdate = false;
            me.afterSetNeedsVdomUpdate?.(false, true);

            const data = await Neo.vdom.Helper.create({
                appName    : me.appName,
                autoMount,
                parentId   : autoMount ? me.getMountedParentId()    : undefined,
                parentIndex: autoMount ? me.getMountedParentIndex() : undefined,
                vdom       : ComponentManager.getVdomTree(me.vdom),
                windowId   : me.windowId
            });

            me.onRender(data.vnode, useVdomWorker ? autoMount : false);
            me.isVdomUpdating = false;

            autoMount && !useVdomWorker && me.mount();

            me.resolveVdomUpdate()
        }
    }

    /**
     * Internal helper fn to resolve the Promise for updateVdom()
     * @param {Function|undefined} resolve
     * @protected
     */
    resolveVdomUpdate(resolve) {
        let me                  = this,
            hasChildUpdateCache = !Neo.isEmpty(me.childUpdateCache),
            component;

        me.doResolveUpdateCache();

        resolve?.();

        if (me.needsVdomUpdate) {
            if (hasChildUpdateCache) {
                Object.entries(me.childUpdateCache).forEach(([key, value]) => {
                    component = Neo.getComponent(key);

                    // The component might already got destroyed
                    if (component) {
                        // Pass callbacks to the resolver cache => getting executed once the following update is done
                        value.resolve && NeoArray.add(me.resolveUpdateCache, value.resolve);

                        // Adjust the updateDepth to include the depth of all merged child updates
                        if (me.updateDepth !== -1) {
                            if (component.updateDepth === -1) {
                                me.updateDepth = -1
                            } else {
                                // Since updateDepth is 1-based, we need to subtract 1 level
                                me.updateDepth = me.updateDepth + value.distance + component.updateDepth - 1
                            }
                        }
                    }
                });

                me.childUpdateCache = {}
            }

            me.update()
        } else if (hasChildUpdateCache) {
            Object.keys(me.childUpdateCache).forEach(key => {
                Neo.getComponent(key)?.update()
            });

            me.childUpdateCache = {}
        }
    }

    /**
     * Placeholder method for util.VDom.syncVdomIds to allow overriding (disabling) it
     * @param {Neo.vdom.VNode} [vnode=this.vnode]
     * @param {Object} [vdom=this.vdom]
     * @param {Boolean} force=false
     */
    syncVdomIds(vnode=this.vnode, vdom=this.vdom, force=false) {
        VDomUtil.syncVdomIds(vnode, vdom, force)
    }

    /**
     * In case a component receives a new vnode, we want to do:
     * - sync the vdom ids
     * - setting rendered to true for child components
     * - updating the parent component to ensure that the vnode tree stays persistent
     * @param {Neo.vdom.VNode} [vnode=this.vnode]
     */
    syncVnodeTree(vnode=this.vnode) {
        let me              = this,
            childComponents = ComponentManager.getChildren(me),
            debug           = false,
            map             = {},
            childVnode, start;

        if (debug) {
            start = performance.now()
        }

        me.syncVdomIds();

        if (vnode && me.id !== vnode.id) {
            ComponentManager.registerWrapperNode(vnode.id, me)
        }

        // we need one separate iteration first to ensure all wrapper nodes get registered
        childComponents.forEach(component => {
            childVnode = VNodeUtil.find(me.vnode, component.vdom.id)?.vnode;

            if (childVnode) {
                map[component.id] = childVnode;

                if (component.id !== childVnode.id) {
                    ComponentManager.registerWrapperNode(childVnode.id, component)
                }
            }
        });

        // delegate the latest node updates to all possible child components found inside the vnode tree
        childComponents.forEach(component => {
            childVnode = map[component.id];

            if (childVnode) {
                // silent update
                component._vnode = ComponentManager.addVnodeComponentReferences(childVnode, component.id);

                if (!component.rendered) {
                    component._rendered = true;
                    component.fire('rendered', component.id)
                }

                component.mounted = true
            } else {
                console.warn('syncVnodeTree: Could not replace the child vnode for', component.id)
            }
        });

        // silent update
        me._vnode = vnode ? ComponentManager.addVnodeComponentReferences(vnode, me.id) : null;

        debug && console.log('syncVnodeTree', me.id, performance.now() - start)
    }

    /**
     *
     */
    update() {
        this.afterSetVdom(this.vdom, null)
    }

    /**
     * Gets called after the vdom config gets changed in case the component is already mounted (delta updates).
     * @param {function} [resolve] used by promiseUpdate()
     * @param {function} [reject] used by promiseUpdate()
     * @protected
     */
    updateVdom(resolve, reject) {
        if (Neo.config.unitTestMode) {
            reject?.();
            return
        }

        let me                              = this,
            {app, mounted, parentId, vnode} = me;

        if (me.isVdomUpdating || me.silentVdomUpdate) {
            resolve && me.resolveUpdateCache.push(resolve);
            me.needsVdomUpdate = true
        } else {
            if (!mounted && me.isConstructed && !me.hasRenderingListener && app?.rendering === true) {
                me.hasRenderingListener = true;

                app.on('mounted', () => {
                    me.timeout(50).then(() => {
                        me.vnode && me.updateVdom(resolve, reject)
                    })
                }, me, {once: true})
            } else {
                if (resolve && (!mounted || !vnode)) {
                    me.resolveUpdateCache.push(resolve)
                }

                if (
                    !me.needsParentUpdate(parentId, resolve)
                    && !me.isParentUpdating(parentId, resolve)
                    && mounted
                    && vnode
                ) {
                    // Verify that the critical rendering path => CSS files for the new tree is in place
                    if (currentWorker.countLoadingThemeFiles !== 0) {
                        currentWorker.on('themeFilesLoaded', function() {
                            me.updateVdom(resolve, reject)
                        }, me, {once: true})
                    } else {
                        me.executeVdomUpdate(resolve, reject)
                    }
                }
            }
        }

        me.hasUnmountedVdomChanges = !mounted && me.hasBeenMounted
    }
}

Neo.setupClass(VdomLifecycle);

export default VdomLifecycle;
