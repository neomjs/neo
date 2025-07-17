import Base             from '../core/Base.mjs';
import ComponentManager from '../manager/Component.mjs';
import NeoArray         from '../util/Array.mjs';
import TreeBuilder      from '../util/vdom/TreeBuilder.mjs';
import VDomUtil         from '../util/VDom.mjs';
import VDomUpdate       from '../manager/VDomUpdate.mjs';
import VNodeUtil        from '../util/VNode.mjs';
import {isDescriptor}   from '../core/ConfigSymbols.mjs';

const {currentWorker} = Neo;

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
     * Creates a lightweight, serializable placeholder for this component, intended for injection
     * into the VDOM of other components.
     *
     * This is the **only recommended way** to nest a component within another component's VDOM tree.
     * Directly embedding one component's full `vdom` object into another's is an anti-pattern
     * that violates the principle of scoped VDOM, leading to unpredictable rendering behavior
     * and making updates inefficient.
     *
     * At its core, the returned object contains a `componentId` that uniquely identifies the
     * component instance. In cases where a component's structure is wrapped by another element
     * (e.g., a Button in a Table Header being wrapped by a `<td>`), the reference will also
     * include the wrapper's `id`. This happens when a component uses `getVdomRoot()` to
     * designate a deeper node as its logical root, causing the component's `id` and its
     * VDOM root's `id` to differ. The framework uses this dual-ID reference to correctly
     * assemble the final VDOM tree.
     *
     * @returns {{componentId: String, id: String|undefined}} The VDOM reference object.
     */
    createVdomReference() {
        let me        = this,
            reference = {componentId: me.id},
            vdomId    = me.vdom.id;

        if (vdomId && me.id !== vdomId) {
            reference.id = vdomId
        }

        return reference
    }

    /**
     * Internal method to send update requests to the vdom worker
     * @param {function} [resolve] used by promiseUpdate()
     * @param {function} [reject] used by promiseUpdate()
     * @private
     */
    async executeVdomUpdate(resolve, reject) {
        let me = this;

        resolve && VDomUpdate.addPromiseCallback(me.id, resolve);

        me.isVdomUpdating = true;
        // Centralize in-flight state
        VDomUpdate.registerInFlightUpdate(me.id, me.updateDepth);

        try {
            const
                {vdom, vnode} = me,
                mergedChildIds = VDomUpdate.getMergedChildIds(me.id),
                opts = {
                    vdom : TreeBuilder.getVdomTree(vdom,   me.updateDepth, mergedChildIds),
                    vnode: TreeBuilder.getVnodeTree(vnode, me.updateDepth, mergedChildIds)
                };

            if (currentWorker?.isSharedWorker) {
                opts.appName  = me.appName;
                opts.windowId = me.windowId;
            }

            // We cannot set the config directly => it could already be false,
            // and we still want to pass it further into subtrees
            me._needsVdomUpdate = false;
            me.afterSetNeedsVdomUpdate?.(false, true);

            // Reset the updateDepth to the default value for the next update cycle
            me._updateDepth = me.constructor.config.updateDepth;

            const data = await Promise.resolve(Neo.vdom.Helper.update(opts));

            // Component could be destroyed while the update is running
            if (me.id) {
                // It is crucial to delegate the vnode tree before resolving the cycle
                me.vnode = data.vnode;

                // When not using a VdomWorker, we need to apply the deltas inside the App worker
                if (!Neo.config.useVdomWorker && data.deltas?.length > 0) {
                    await Neo.applyDeltas(me.appName, data.deltas)
                }

                me.isVdomUpdating = false;
                me.resolveVdomUpdate(data)
            }
        } catch (err) {
            me.isVdomUpdating = false;
            // Ensure state is cleaned up on error
            VDomUpdate.unregisterInFlightUpdate(me.id);
            reject?.(err)
        }
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
                    // Get the in-flight update depth from the central manager
                    const parentUpdateDepth = VDomUpdate.getInFlightUpdateDepth(parent.id);

                    if (me.hasUpdateCollision(parentUpdateDepth, distance)) {
                        if (Neo.config.logVdomUpdateCollisions) {
                            console.warn('vdom parent update conflict with:', parent, 'for:', me)
                        }

                        VDomUpdate.registerPostUpdate(parent.id, me.id, resolve);
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
    mergeIntoParentUpdate(parentId=this.parentId, distance=1) {
        if (parentId !== 'document.body') {
            let me     = this,
                parent = Neo.getComponent(parentId);

            if (parent) {
                // We are checking for parent.updateDepth, since we care about the depth of the next update cycle
                if (parent.needsVdomUpdate && me.hasUpdateCollision(parent.updateDepth, distance)) {
                    VDomUpdate.registerMerged(parent.id, me.id, me.updateDepth, distance);
                    return true
                }

                return me.mergeIntoParentUpdate(parent.parentId, distance+1)
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
            {allowVdomUpdatesInTests, unitTestMode, useVdomWorker} = Neo.config;

        if (unitTestMode && !allowVdomUpdatesInTests) return;

        // Verify that the critical rendering path => CSS files for the new tree is in place
        if (!unitTestMode && autoMount && currentWorker.countLoadingThemeFiles !== 0) {
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

            const data = await Promise.resolve(Neo.vdom.Helper.create({
                appName    : me.appName,
                autoMount,
                parentId   : autoMount ? me.getMountedParentId()    : undefined,
                parentIndex: autoMount ? me.getMountedParentIndex() : undefined,
                vdom       : TreeBuilder.getVdomTree(me.vdom, -1),
                windowId   : me.windowId
            }));

            me.onRender(data.vnode, useVdomWorker ? autoMount : false);
            me.isVdomUpdating = false;

            autoMount && !useVdomWorker && me.mount();

            me.resolveVdomUpdate()
        }
    }

    /**
     * Internal helper fn to resolve the Promise for updateVdom()
     * @param {Object}   [data] The return value of vdom.Helper.update()
     * @protected
     */
    resolveVdomUpdate(data) {
        let me = this;

        // Execute callbacks for merged updates
        VDomUpdate.executeCallbacks(me.id, data);

        // The update is no longer in-flight
        VDomUpdate.unregisterInFlightUpdate(me.id);

        // Trigger updates for components that were in-flight
        VDomUpdate.triggerPostUpdates(me.id);

        if (me.needsVdomUpdate) {
            // any new promise callbacks will get picked up by the next update cycle
            me.update()
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
        if (!this.isConstructed) {
            resolve?.();
            return
        }

        if (Neo.config.unitTestMode && !Neo.config.allowVdomUpdatesInTests) {
            reject?.();
            return
        }

        let me                         = this,
            {mounted, parentId, vnode} = me;

        if (me.isVdomUpdating || me.silentVdomUpdate) {
            resolve && VDomUpdate.addPromiseCallback(me.id, resolve);
            me.needsVdomUpdate = true
        } else {
            // If there's a promise, register it against this component's ID immediately.
            // The manager will ensure it's called when the appropriate update cycle completes.
            resolve && VDomUpdate.addPromiseCallback(me.id, resolve);

            // If an update is triggered on an unmounted component, we must wait for it to be mounted.
            if (!mounted) {
                // Use a flag to prevent setting up multiple `then` listeners for subsequent updates
                // that might arrive before the component is mounted.
                if (!me.isAwaitingMount) {
                    me.isAwaitingMount = true;
                    me.mountedPromise.then(() => {
                        me.isAwaitingMount = false;
                        // After mounting, re-trigger the update cycle. The cached callbacks will be picked up.
                        me.vnode && me.update();
                    });
                }
            } else {
                if (
                    !me.mergeIntoParentUpdate(parentId)
                    && !me.isParentUpdating(parentId, resolve)
                    && mounted
                    && vnode
                ) {
                    // Check for merged child updates and adjust the update depth accordingly
                    let adjustedDepth = VDomUpdate.getAdjustedUpdateDepth(me.id);

                    if (adjustedDepth !== null) {
                        me.updateDepth = adjustedDepth;
                    }

                    // Verify that the critical rendering path => CSS files for the new tree is in place
                    if (!Neo.config.unitTestMode && currentWorker.countLoadingThemeFiles !== 0) {
                        currentWorker.on('themeFilesLoaded', function() {
                            me.updateVdom(resolve, reject)
                        }, me, {once: true})
                    } else {
                        me.executeVdomUpdate(null, reject)
                    }
                }
            }
        }

        me.hasUnmountedVdomChanges = !mounted && me.hasBeenMounted
    }
}

Neo.setupClass(VdomLifecycle);

export default VdomLifecycle;
