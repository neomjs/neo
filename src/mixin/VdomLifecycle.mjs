import Base             from '../core/Base.mjs';
import ComponentManager from '../manager/Component.mjs';
import TreeBuilder      from '../util/vdom/TreeBuilder.mjs';
import VDomUtil         from '../util/VDom.mjs';
import VDomUpdate       from '../manager/VDomUpdate.mjs';
import VNodeUtil        from '../util/VNode.mjs';
import {isDescriptor}   from '../core/ConfigSymbols.mjs';

// Load-time binding: may capture `undefined` — a spec file's static imports can evaluate this
// module BEFORE its top-level harness setup() assigns `Neo.currentWorker` (the assignment is
// `??=`, never a replacement, and a surviving SharedWorker realm keeps the SAME worker object
// on reconnect — no world is ever reassigned under a live binding). Safe here ONLY for
// optional-chained per-process environment constants (e.g. `isSharedWorker`); anything mutable
// (counters, event registration) must resolve `Neo.currentWorker` at call time.
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
         * True automatically initializes the vnode of a component after being created inside the init call.
         * Recommended for dialogs & drag-proxies.
         * Top level views should definitely use false.
         * @member {Boolean} autoInitVnode=false
         */
        autoInitVnode: false,
        /**
         * True automatically mounts a component after being rendered.
         * Use this for the top level component of your app.
         * @member {Boolean} autoMount=false
         */
        autoMount: false,
        /**
         * Internal flag which will get set to true while an update request (worker messages) is in progress
         * @member {Boolean} isVdomUpdating_=false
         * @protected
         * @reactive
         */
        isVdomUpdating_: false,
        /**
         * True in case the component is initializing the vnode
         * @member {Boolean} isVnodeInitializing_=false
         * @protected
         * @reactive
         */
        isVnodeInitializing_: false,
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
         * The component vnode tree. Available after the component got vnodeInitialized.
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
        },
        /**
         * True after the component initVnode() method was called. Also fires the vnodeInitialized event.
         * @member {Boolean} vnodeInitialized_=false
         * @protected
         * @reactive
         */
        vnodeInitialized_: false
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
        value && this.syncVnodeTree()
    }

    /**
     * Triggered after the vnodeInitialized config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetVnodeInitialized(value, oldValue) {
        let me = this;

        if (value) {
            me.fire('vnodeInitialized', me.id);

            if (me.needsVdomUpdate) {
                me.update()
            }
        }
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
     * Ensures that the root VDOM node and its wrapper (if any) have stable, unique IDs
     * derived from the component instance ID. This prevents auto-generated ID collisions
     * in `ComponentManager.wrapperNodes`.
     * @protected
     */
    ensureStableIds() {
        const
            me       = this,
            vdom     = me.vdom,
            vdomRoot = me.getVdomRoot();

        if (vdomRoot) {
            vdomRoot.id = me.id;

            if (vdom !== vdomRoot) {
                vdom.id = me.id + '__wrapper'
            }
        }
    }

    /**
     * Internal method to send update requests to the vdom worker.
     *
     * **Teleportation / Batched Disjoint Updates:**
     * This method implements the core logic for "Teleportation". Instead of merging child updates
     * into the parent's VDOM tree (which requires expanding the parent's tree to reach the child),
     * we collect all merged child updates and send them as a **batch of disjoint payloads**.
     *
     * 1. **Recursive Collection:** We recursively collect all `mergedChildIds` from the component
     *    and its descendants.
     * 2. **Disjoint Payloads:** For each component in the batch, we generate a "self-only" VDOM
     *    payload (`updateDepth: 1`). This allows the VDOM engine to update the child directly
     *    without needing the parent to "bridge" to it.
     * 3. **Collision Filtering:** We filter out child updates that are already covered by a
     *    parent update in the same batch (e.g., if the parent is doing a full tree update).
     *
     * @param {function} [resolve] used by promiseUpdate()
     * @param {function} [reject] used by promiseUpdate()
     * @private
     */
    async executeVdomUpdate(resolve, reject) {
        let me            = this,
            batchOwnerIds = new Set([me.id]);

        (resolve || reject) && VDomUpdate.addPromiseCallback(me.id, resolve, reject);

        me.isVdomUpdating = true;
        // Centralize in-flight state
        VDomUpdate.registerInFlightUpdate(me.id, me.updateDepth);

        try {
            // We need to ensure that the task queue is empty before collecting payloads.
            // This is critical for cases where a component state change (triggering update)
            // is followed immediately by a structural change (e.g. remove) in the same tick.
            // Using setTimeout forces a Macrotask yield, ensuring all sync operations complete.
            await new Promise(resolve => setTimeout(resolve, 1));

            const
                updates                 = {},
                depths                  = new Map(),
                processed               = new Set(), // Prevent duplicates and cycles
                componentMergedChildren = new Map(); // Snapshot of merged children processed in this batch

            const collectPayloads = (componentId) => {
                if (processed.has(componentId)) return;
                processed.add(componentId);

                const component = Neo.getComponent(componentId);
                if (!component || component.isDestroyed) return;

                // Skip unmounted components. They will be expanded by the Parent's TreeBuilder
                // and handled via the Parent's resolveVdomUpdate -> syncVnodeTree.
                if (!component.vnode) return;

                // IMPORTANT: In a multi-window SharedWorker environment, we must NOT batch
                // updates from components that have moved to a different window.
                // Doing so would cause deltas meant for Window B to be sent to Window A.
                if (component.windowId !== me.windowId) return;

                // For every component, we check its own merged children
                const mergedChildIds = VDomUpdate.getMergedChildIds(componentId);

                // Track depth for collision filtering
                depths.set(componentId, component.updateDepth);

                // Snapshot the merged children we are about to process.
                // This prevents race conditions where a child merges *after* collection but *before* resolution,
                // causing it to be acknowledged/cleared without actually being updated.
                if (mergedChildIds) {
                    componentMergedChildren.set(componentId, mergedChildIds);
                }

                // Generate payload for this component.
                // - Depth 1 (Teleportation): Pass ids=null to force disjoint/pruned payload.
                // - Depth > 1 (Hybrid): Pass ids=mergedChildIds to enable Sparse Tree generation (pruning clean siblings).
                //   Note: Depth -1 (Full Tree) ignores ids and is always Dense.
                const ids = component.updateDepth !== 1 ? mergedChildIds : null;

                // We pass null as the second arg to respect the component's configured updateDepth.
                updates[componentId] = component.getVdomUpdatePayload(ids, null);

                // Recursively collect merged children
                if (mergedChildIds) {
                    for (const childId of mergedChildIds) {
                        collectPayloads(childId)
                    }
                }
            };

            // Start collection from the root of the update (me)
            collectPayloads(me.id);

            // Collision Filtering:
            // If a parent update covers this child, remove the child from the disjoint batch
            for (const id in updates) {
                if (Object.hasOwn(updates, id)) {
                    let parent   = Neo.getComponent(id)?.parent,
                        distance = 1;

                    while (parent) {
                        if (updates[parent.id]) {
                            const parentDepth = depths.get(parent.id);
                            // If parent covers this child, remove the child from the disjoint batch
                            if (parentDepth === -1 || parentDepth > distance) {
                                delete updates[id];
                                break; // exit the while loop
                            }
                        }
                        parent   = parent.parent;
                        distance++
                    }
                }
            }

            // Every surviving update key owns a returned vnode, even when another component
            // initiated the physical batch. Mark all of them in-flight before dispatch so a
            // mutation arriving after payload collection queues behind this exact response instead
            // of opening a second flight that can be overwritten by the older batch on return.
            for (const id in updates) {
                if (Object.hasOwn(updates, id)) {
                    const component = Neo.getComponent(id);

                    if (id !== me.id && component && !component.isDestroyed) {
                        component.isVdomUpdating = true;
                        VDomUpdate.registerInFlightUpdate(id, depths.get(id));
                        batchOwnerIds.add(id)
                    }

                    VDomUpdate.markPayloadCollected(id)
                }
            }

            const batchData = {updates};

            // CRITICAL: SharedWorker Context Injection
            // This block MUST NOT be removed or simplified.
            // In a SharedWorker environment, the VDOM worker needs to know WHICH window
            // initiated the update to route the reply and DOM deltas correctly.
            // Without `windowId` and `appName`, `RemoteMethodAccess` cannot determine the target,
            // causing cross-window operations (like dragging a component to a new window) to fail silently.
            if (currentWorker?.isSharedWorker) {
                batchData.appName  = me.appName;
                batchData.windowId = me.windowId
            }

            if (Neo.config.useDeltaCoherenceRegistry) {
                const
                    referenceableOwnerIds = new Set(),
                    pendingOwners         = Object.keys(updates);

                while (pendingOwners.length > 0) {
                    const
                        id        = pendingOwners.pop(),
                        component = Neo.getComponent(id);

                    if (component && !referenceableOwnerIds.has(id)) {
                        referenceableOwnerIds.add(id);

                        for (const child of ComponentManager.getDirectChildren(id)) {
                            if (child.appName === me.appName && child.windowId === me.windowId) {
                                pendingOwners.push(child.id)
                            }
                        }
                    }
                }

                batchData.coherenceAcknowledgments = VDomUpdate.getCoherenceAcknowledgments(
                    me.appName, me.windowId, referenceableOwnerIds
                )
            }

            /**
             * Optional hook that fires immediately before the VDOM payload is sent to the VDOM worker.
             * This is useful for telemetry (e.g., Performance tracking) as it excludes the synchronous
             * queue wait time of the App worker and strictly measures the cross-thread roundtrip.
             */
            me.beforeExecuteVdomUpdate?.();

            const response = await Promise.resolve(Neo.vdom.Helper.updateBatch(batchData));

            /**
             * Optional hook that fires immediately after the VDOM update resolves.
             * Because of internal promise chaining (promiseForwardMessage), this hook fires *after*
             * the Main Thread has painted the resulting DOM deltas.
             */
            me.afterExecuteVdomUpdate?.();

            // The response has settled the frozen snapshot. Callback registration from this point
            // targets the ordinary/current generation again; callbacks already parked for the
            // follow-up remain isolated in nextPromiseCallbackMap until each owner resolves.
            for (const id of batchOwnerIds) {
                VDomUpdate.unmarkPayloadCollected(id)
            }

            // With a VDom worker, the response means Main already applied the physical batch even
            // if its initiator died meanwhile. The local Helper path has not applied anything yet;
            // keep its historical initiator-survival gate and fail closed for every owner when dead.
            const canAdoptResponse = Neo.config.useVdomWorker || (me.id && !me.isDestroyed);

            if (!Neo.config.useVdomWorker && canAdoptResponse && response.deltas?.length > 0) {
                await Neo.applyDeltas(me.windowId, response.deltas)
            }

            const
                releasedError = new Error(
                    'VDOM batch response could not be adopted because its initiator was destroyed'
                ),
                settledOwnerIds = new Set(),
                releaseOwner = id => {
                    const component = Neo.getComponent(id);

                    component && (component.isVdomUpdating = false);
                    VDomUpdate.unregisterInFlightUpdate(id);
                    VDomUpdate.rejectCallbacks(id, releasedError);
                    component?.needsVdomUpdate && component.update()
                };

            releasedError.code = 'NEO_VDOM_BATCH_RESPONSE_NOT_ADOPTED';

            if (canAdoptResponse) {
                // Settle every returned vnode owner independently. A moved surviving sibling must
                // never wedge merely because the transport initiator was destroyed.
                for (const id in response.vnodes) {
                    if (Object.hasOwn(response.vnodes, id)) {
                        const
                            vnode     = response.vnodes[id],
                            component = Neo.getComponent(id);

                        settledOwnerIds.add(id);

                        if (component && !component.isDestroyed) {
                            component.vnode = vnode;

                            // This owner-specific receipt means both halves completed: Main applied
                            // the deltas (or acknowledged a no-op), then App adopted this vnode.
                            // Record before callbacks because they can request the next batch.
                            if (Neo.config.useDeltaCoherenceRegistry) {
                                VDomUpdate.recordCoherenceAcknowledgment(
                                    me.appName, me.windowId, id, response.coherenceSequence
                                )
                            }

                            component.resolveVdomUpdate({
                                deltas: response.deltas,
                                vnode
                            }, componentMergedChildren.get(id));
                        } else {
                            releaseOwner(id)
                        }
                    }
                }
            }

            for (const id of batchOwnerIds) {
                if (!settledOwnerIds.has(id)) {
                    releaseOwner(id)
                }
            }
        } catch (err) {
            const hasCallbacks = [...batchOwnerIds].some(id => VDomUpdate.hasPromiseCallbacks(id));

            // A failed physical batch owns every vnode key it collected, not only its initiator.
            // Release and reject them all; otherwise a disjoint child stays wedged forever.
            for (const id of batchOwnerIds) {
                const component = Neo.getComponent(id);

                component && (component.isVdomUpdating = false);
                VDomUpdate.unmarkPayloadCollected(id);
                VDomUpdate.unregisterInFlightUpdate(id);
                VDomUpdate.rejectCallbacks(id, err)
            }

            // Detect the fire-and-forget case first, so a genuinely silent failure still logs.
            hasCallbacks || console.error('vdom update failed', me.id, err);

            // Mirror resolveVdomUpdate(): mutations queued behind any owner get one bounded
            // follow-up after the failed batch releases them.
            for (const id of batchOwnerIds) {
                const component = Neo.getComponent(id);

                component?.needsVdomUpdate && component.update()
            }
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
     * Generates the update payload for this component.
     *
     * **Meta Payload Concept:**
     * If a component implements a `getVdomUpdateMeta()` method, its returned object will be
     * attached to the update payload as `meta`. This allows the App Worker to send contextual state
     * (e.g., the specific `scrollTop` value the VDOM was calculated against) alongside the VDOM deltas
     * to the Main Thread. The Main Thread's `DeltaUpdates` singleton fires an `update` event before
     * applying deltas, allowing addons (like optical pinning) to read this `meta` data and dynamically
     * adjust the deltas (like `translate3d` transforms) based on the *current* Main Thread state
     * before they are painted.
     *
     * @param {Set<String>|null} mergedChildIds
     * @param {Number} [depth] Override the update depth
     * @returns {Object} opts
     */
    getVdomUpdatePayload(mergedChildIds, depth) {
        let me            = this,
            updateDepth   = depth ?? me.updateDepth,
            {vdom, vnode} = me,
            opts          = {
                vdom : TreeBuilder.getVdomTree(vdom,   updateDepth, mergedChildIds),
                vnode: TreeBuilder.getVnodeTree(vnode, updateDepth, mergedChildIds)
            };

        if (currentWorker?.isSharedWorker) {
            opts.appName  = me.appName;
            opts.windowId = me.windowId
        }

        if (me.getVdomUpdateMeta) {
            opts.meta = me.getVdomUpdateMeta()
        }

        // We cannot set the config directly => it could already be false,
        // and we still want to pass it further into subtrees
        me._needsVdomUpdate = false;
        me.afterSetNeedsVdomUpdate?.(false, true);

        // Reset the updateDepth to the default value for the next update cycle
        me._updateDepth = me.constructor.config.updateDepth;

        return opts
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
     * Checks if a child update can be merged into a parent update.
     *
     * **Merge Strategy (Optimization):**
     * We allow merging regardless of distance (Teleportation).
     * The `executeVdomUpdate` logic will distinguish between Connected (merged into tree)
     * and Disjoint (batched separately) updates.
     *
     * @param {Number} updateDepth
     * @param {Number} distance
     * @returns {Boolean}
     */
    canMergeUpdate(updateDepth, distance) {
        return true
    }

    /**
     * Checks if a given updateDepth & distance would result in an update collision.
     * The check must use `<` because `updateDepth` is 1-based.
     *
     * **Scoped VDOM Update Rationale:**
     * - `updateDepth: 1` means the update is scoped to the component itself.
     * - The Parent's VDOM payload naturally contains only its own structure and **reference nodes**
     *   (placeholders) for its children (e.g. `{componentId: '...'}`).
     * - At Depth 1, these references are **not expanded** into the children's full VDOM trees.
     * - Therefore, a Parent (Depth 1) update and a Child update operate on **disjoint** sets of DOM nodes.
     * - They **do not collide** and **should not merge**. They should run as independent, parallel updates.
     *
     * - A direct child is at `distance: 1`.
     * Therefore, an update with depth 1 should NOT collide with a child at distance 1 (1 < 1 is false).
     *
     * @param {Number} updateDepth
     * @param {Number} distance
     * @returns {Boolean}
     */
    hasUpdateCollision(updateDepth, distance) {
        return updateDepth === -1 ? true : distance < updateDepth
    }

    /**
     * Creates the vnode tree for this component and mounts the component in case
     * - you pass true for the mount param
     * - or the autoMount config is set to true
     *
     * Lifecycle contract for awaiting callers: the returned promise settles when the REAL
     * attempt settles. A theme-file deferral chains through the re-entered attempt instead of
     * resolving early, and a rejected attempt releases `isVnodeInitializing` (component + app
     * level) before rethrowing, so a caller-side retry on a later trigger is always possible.
     * @param {Boolean} [mount] Mount the DOM after the vnode got created
     * @returns {Promise<any>} If getting there, we return the data from vdom.Helper: create(), containing the vnode.
     */
    async initVnode(mount) {
        let me                                                     = this,
            autoMount                                              = mount || me.autoMount,
            {app}                                                  = me,
            {allowVdomUpdatesInTests, unitTestMode, useVdomWorker} = Neo.config;

        if (unitTestMode && !allowVdomUpdatesInTests) return;

        // Verify that the critical rendering path => CSS files for the new tree is in place.
        // Deferred is not done: the returned promise settles only when the re-entered attempt
        // settles (chained recursively across repeated deferrals), so an awaiting caller — and
        // any caller-side single-flight latch — tracks the REAL mount attempt instead of a
        // wrapper that resolves before the work begins. Rejections propagate through the chain
        // for the same reason.
        // Resolve `Neo.currentWorker` at CALL time, never via the module-load binding: import
        // order can evaluate this module before the harness setup() assigns the worker, so the
        // load-time capture may be `undefined` — a binding-read here then throws through the
        // caller's catch and presents as a silently skipped deferral. One method-local read also
        // keeps the count consult and the listener registration on one coherent owner.
        const worker = Neo.currentWorker;

        if (!unitTestMode && autoMount && worker.countLoadingThemeFiles !== 0) {
            return new Promise((resolve, reject) => {
                worker.on('themeFilesLoaded', function() {
                    me.mounted ? resolve() : me.initVnode(mount).then(resolve, reject)
                }, me, {once: true})
            })
        }

        me.isVnodeInitializing = true;

        if (!app.vnodeInitialized) {
            app.isVnodeInitializing = true
        }

        try {
            if (me.vdom) {
                me.isVdomUpdating = true;

                me.ensureStableIds();

                // Ensure child components do not trigger updates while the vnode generation is in progress
                VDomUpdate.registerInFlightUpdate(me.id, -1);

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

                me.onInitVnode(data.vnode, useVdomWorker ? autoMount : false);

                if (autoMount && !useVdomWorker) {
                    // When running without a VdomWorker, Helper.create is local and returns a plain object.
                    // We must manually send the insertNode delta to the main thread.
                    await Neo.applyDeltas(me.windowId, [{
                        action   : 'insertNode',
                        id       : me.id,
                        index    : me.getMountedParentIndex(),
                        outerHTML: data.outerHTML,
                        parentId : me.getMountedParentId(),
                        vnode    : data.vnode
                    }]);

                    me.mounted = true
                }

                if (!data.deltas) {
                    data.deltas = []
                }

                me.resolveVdomUpdate(data);

                return data
            }
        } catch (err) {
            // Mirror executeVdomUpdate()'s error contract: the in-flight state MUST be released on
            // failure, or the component wedges permanently (isVdomUpdating never clears and the
            // registry entry blocks every ancestor update via isChildUpdating). The initializing
            // flags belong to the same contract: a rejection that left isVnodeInitializing=true
            // silently blocked every future initVnode consumer gating on it — no retry could
            // ever run for the component's lifetime.
            me.isVdomUpdating       = false;
            me.isVnodeInitializing  = false;

            if (app && !app.vnodeInitialized) {
                app.isVnodeInitializing = false
            }

            VDomUpdate.unregisterInFlightUpdate(me.id);

            console.error('initVnode error', err, me.id);
            throw err
        }
    }

    /**
     * Synchronization Guard: Checks if any descendant component is currently updating its VDOM.
     *
     * If a descendant is in-flight, this method registers a post-update callback on the
     * blocking descendant and returns `true`, signaling the caller (`updateVdom`) to yield.
     * This prevents the Parent from starting an update that might overwrite or conflict
     * with the Child's concurrent work, effectively serializing the updates.
     *
     * @param {Function} [resolve] Gets passed by updateVdom() to be called after the blocking update finishes.
     * @returns {Boolean} True if a child update conflict exists (Parent should yield).
     */
    isChildUpdating(resolve) {
        let me = this;

        if (VDomUpdate.hasInFlightDescendants(me.id)) {
            let map          = VDomUpdate.descendantInFlightMap.get(me.id),
                descendantId = map.keys().next().value;

            if (Neo.config.logVdomUpdateCollisions) {
                console.warn('vdom child update conflict with:', descendantId, 'for:', me)
            }

            VDomUpdate.registerPostUpdate(descendantId, me.id, resolve);
            return true
        }

        return false
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
     * Traverses the parent chain to find an ancestor that is pending a VDOM update.
     * If found, and if the update scope allows (see `canMergeUpdate`), this component's
     * update is merged into the ancestor's cycle.
     *
     * **Recursive Traversal:**
     * This method recursively walks up the component tree (`distance + 1`). This enables
     * transitive merging (Grandchild -> Child -> Parent) and merging into ancestors even
     * if intermediate parents are not updating.
     *
     * @param {String} parentId=this.parentId
     * @param {Function} [resolve] gets passed by updateVdom()
     * @param {Number} distance=1 Distance inside the component tree
     * @returns {Boolean} True if the update was successfully merged.
     */
    mergeIntoParentUpdate(parentId=this.parentId, distance=1) {
        if (parentId !== 'document.body') {
            let me     = this,
                parent = Neo.getComponent(parentId);

            if (parent) {
                // We are checking for parent.updateDepth, since we care about the depth of the next update cycle
                if (parent.needsVdomUpdate && me.canMergeUpdate(parent.updateDepth, distance)) {
                    VDomUpdate.registerMerged(parent.id, me.id, me.updateDepth, distance);
                    return true
                }

                return me.mergeIntoParentUpdate(parent.parentId, distance+1)
            }
        }

        return false
    }

    /**
     * Gets called from the initVnode() promise success handler
     * @param {Object} vnode
     * @param {Boolean} autoMount Mount the DOM after the vnode got created
     * @protected
     */
    onInitVnode(vnode, autoMount) {
        let me    = this,
            {app} = me;

        me.isVnodeInitializing = false;

        // if app is a check to see if the Component got destroyed while vnodeInitialising => before onInitVnode got triggered
        if (app) {
            if (!app.vnodeInitialized) {
                app.isVnodeInitializing = false;
                app.vnodeInitialized = true;
                app.fire('vnodeInitialized')
            }

            me.vnode = vnode;

            let childIds = ComponentManager.getChildIds(vnode),
                i        = 0,
                len      = childIds.length,
                child;

            for (; i < len; i++) {
                child = Neo.getComponent(childIds[i]);

                if (child) {
                    child.vnodeInitialized = true
                }
            }

            me.vnodeInitialized = true;

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
     * @returns {Promise<any>}
     */
    promiseUpdate() {
        let me = this;

        return new Promise((resolve, reject) => {
            const id = Symbol();

            me.registerAsync(id, reject);

            me.updateVdom(
                (val) => {me.unregisterAsync(id); resolve(val)},
                (err) => {me.unregisterAsync(id); reject(err)}
            )
        })
    }

    /**
     * Internal helper fn to resolve the Promise for updateVdom()
     * @param {Object} [data] The return value of vdom.Helper.update()
     * @param {Set<String>|null} [mergedChildIds] IDs of children included in this update
     * @protected
     */
    resolveVdomUpdate(data, mergedChildIds) {
        let me = this;

        me.isVdomUpdating = false;

        // Execute callbacks for merged updates
        VDomUpdate.executeCallbacks(me.id, data, mergedChildIds);

        // The update is no longer in-flight
        VDomUpdate.unregisterInFlightUpdate(me.id);

        // Trigger updates for components that were in-flight
        VDomUpdate.triggerPostUpdates(me.id);

        // Execute callbacks which wanted to run before the next update cycle
        VDomUpdate.executePreUpdates(me.id);

        if (me.needsVdomUpdate) {
            // any new promise callbacks will get picked up by the next update cycle
            me.update()
        }
    }

    /**
     * Placeholder method for util.VDom.syncVdomState to allow overriding (disabling) it
     * @param {Neo.vdom.VNode} [vnode=this.vnode]
     * @param {Object} [vdom=this.vdom]
     * @param {Boolean} force=false
     */
    syncVdomState(vnode=this.vnode, vdom=this.vdom, force=false) {
        VDomUtil.syncVdomState(vnode, vdom, force)
    }

    /**
     * In case a component receives a new vnode, we want to do:
     * - sync the vdom ids
     * - setting vnodeInitialized to true for child components
     * - updating the parent component to ensure that the vnode tree stays persistent
     *
     * **Implementation Detail:**
     * This method uses a two-pass strategy to handle child updates:
     * 1. **Update Visible Children:** We iterate over children found directly in the new VNode structure
     *    (via `ComponentManager.getChildren`). This preserves the baseline behavior where fully expanded
     *    VNode trees (e.g., from `Helper.create`) are synced without unnecessary "downgrading" to references.
     * 2. **Unmount Missing Children:** We iterate over ALL logical children (via `ComponentManager.find`)
     *    to detect any that are absent from the new VNode tree (e.g., `removeDom: true`).
     *    Crucially, we use `VNodeUtil.find` to distinguish between a "Placeholder" (valid, do nothing)
     *    and a "Removal" (invalid, unmount).
     *
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

        me.syncVdomState();

        if (vnode && me.id !== vnode.id) {
            ComponentManager.registerWrapperNode(vnode.id, me)
        }

        let vnodeMap           = VNodeUtil.createMap(me.vnode),
            childComponentsSet = new Set(childComponents);

        // we need one separate iteration first to ensure all wrapper nodes get registered
        for (let i = 0, len = childComponents.length; i < len; i++) {
            let component = childComponents[i];
            childVnode = vnodeMap.get(component.vdom.id);

            if (childVnode) {
                map[component.id] = childVnode;

                if (component.id !== childVnode.id) {
                    ComponentManager.registerWrapperNode(childVnode.id, component)
                }
            }
        }

        // delegate the latest node updates to all possible child components found inside the vnode tree
        for (let i = 0, len = childComponents.length; i < len; i++) {
            let component = childComponents[i];
            childVnode = map[component.id];

            if (childVnode) {
                // silent update
                component._vnode = ComponentManager.addVnodeComponentReferences(childVnode, component.id);

                component.vnodeInitialized = true;
                component.mounted          = true
            } else {
                console.warn('syncVnodeTree: Could not replace the child vnode for', component.id)
            }
        }

        // New logic to handle unmounting of removed children
        let directChildren = ComponentManager.getDirectChildren(me.id);
        for (let i = 0, len = directChildren.length; i < len; i++) {
            let component = directChildren[i];
            if (!childComponentsSet.has(component)) {
                childVnode = null;

                // Check if it exists in the tree (as placeholder)
                // We use vnodeMap which resolves placeholders
                if (me.vnode) {
                    childVnode = vnodeMap.get(component.vdom.id);
                }

                if (!childVnode && !component.floating) {
                    component._vnode = null;
                    component.mounted = false
                }
            }
        }

        // silent update
        me._vnode = vnode ? ComponentManager.addVnodeComponentReferences(vnode, me.id) : null;

        me.syncAncestorVnodeReferences();

        debug && console.log('syncVnodeTree', me.id, performance.now() - start)
    }

    /**
     * @summary Replaces stale raw child snapshots along the live ancestor chain with component
     * references after this owner adopts a vnode.
     *
     * Only the immediate child boundary is considered at each level. Existing references make
     * deeper traversal unnecessary; different App/window realms terminate the walk, preserving
     * cross-window move ownership. Internal `_vnode` caches are canonicalized in place without
     * invoking the public setter or scheduling another render.
     * @protected
     */
    syncAncestorVnodeReferences() {
        const me = this;

        let child  = me,
            parent = child.parent;

        while (parent && parent.appName === me.appName && parent.windowId === me.windowId) {
            parent.vnode && ComponentManager.ensureVnodeComponentReference(parent.vnode, child);
            child  = parent;
            parent = parent.parent
        }
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

        let me                         = this,
            {mounted, parentId, vnode} = me,
            {config}                   = Neo;

        if (config.unitTestMode && !config.allowVdomUpdatesInTests) {
            // Unit-test mode deliberately skips vdom updates — a skipped update is a SUCCESSFUL
            // no-op, not a failure. Rejecting here turned every naked promiseUpdate().then() chain
            // (container insert/remove and friends) into an unhandled `undefined` rejection the
            // moment a spec structurally mutated an unmounted container.
            resolve?.();
            return
        }

        me.ensureStableIds();

        // If there's a promise, register its {resolve, reject} pair against this component's ID
        // immediately — BEFORE the merge / in-flight / initiator branching below. The manager
        // settles it when the owning cycle completes: resolve on success (executeCallbacks),
        // reject when the flight it parks on fails (rejectCallbacks). Registering the pair here —
        // rather than carrying reject as a lone param on the initiator path — is what lets a
        // promiseUpdate() queued onto an already-in-flight or parent-merged cycle reject honestly
        // if that cycle fails, instead of stranding resolve-only.
        (resolve || reject) && VDomUpdate.addPromiseCallback(me.id, resolve, reject);

        // Attempt to merge into a parent's update cycle.
        // We do this even if silent, to ensure we catch the bus if a parent is departing.
        if (me.mergeIntoParentUpdate(parentId)) {
            me.needsVdomUpdate = true;
            return
        }

        if (me.isVdomUpdating || !me.vnodeInitialized || me.silentVdomUpdate) {
            me.needsVdomUpdate = true
        } else {
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
            }
            else {
                if (
                    !me.isParentUpdating(parentId, resolve)
                    && !me.isChildUpdating(resolve)
                    && vnode
                ) {
                    // Check for merged child updates and adjust the update depth accordingly
                    // let adjustedDepth = VDomUpdate.getAdjustedUpdateDepth(me.id);
                    //
                    // if (adjustedDepth !== null) {
                    //     me.updateDepth = adjustedDepth;
                    // }

                    // Verify that the critical rendering path => CSS files for the new tree is in place.
                    // Call-time `Neo.currentWorker` resolution, one read per invocation — the
                    // initVnode deferral gate documents the import-order mechanism.
                    const worker = Neo.currentWorker;

                    if (!config.isMiddleware && !config.unitTestMode && worker.countLoadingThemeFiles !== 0) {
                        worker.on('themeFilesLoaded', function() {
                            me.updateVdom(resolve, reject)
                        }, me, {once: true})
                    } else {
                        // The {resolve, reject} pair is already parked under me.id above; the catch
                        // settles it via VDomUpdate.rejectCallbacks, so no reject param is threaded here.
                        me.executeVdomUpdate()
                    }
                }
            }
        }
    }
}

export default Neo.setupClass(VdomLifecycle);
