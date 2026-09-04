import Manager from './Base.mjs';

/**
 * @summary The worker-side authority for logical topology Groups and their window bindings.
 * @description A Group is the persistent identity of one multi-window topology instance. `appName` is
 * routing metadata and never identifies a Group: two independent roots of the same app under one
 * SharedWorker are two Groups. A window binds into a Group under a `workspaceKey` — one key per full
 * Workspace slot — and the binding records the replaceable runtime generation, the `windowId`.
 *
 * The rules a binding follows:
 * - A warm reload releases its binding on `disconnect` and rebinds on `connect` with the same lineage
 *   token; only that binding's generation moves, no other slot and no other Group is touched.
 * - A late `disconnect` for a superseded generation finds no binding carrying its `windowId` and does
 *   nothing — it cannot unbind its successor.
 * - An identity presented while its binder is live, or against a released slot with a foreign token,
 *   forks: the newcomer receives a fresh Group and the caller rewrites the boot carrier.
 * - A released slot is held for its lineage for {@link #reconnectLeaseMs}; afterwards the slot is free.
 * - An opener reserves a slot for a window it is about to create; the reservation is the token the
 *   child must present, bounded by the same lease.
 *
 * The main thread carries the identity across page loads in `sessionStorage` and rewrites it on request;
 * it never decides. This manager knows windows, keys and tokens — no dock, no document, no app class.
 * @class Neo.manager.Transaction
 * @extends Neo.manager.Base
 * @singleton
 */
class Transaction extends Manager {
    static config = {
        /**
         * @member {String} className='Neo.manager.Transaction'
         * @protected
         */
        className: 'Neo.manager.Transaction',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * How long a released or reserved binding holds its slot for a token-matched successor before the
         * slot is free. The dock tear-out connect window is the precedent for the bound.
         * @member {Number} reconnectLeaseMs=20000
         */
        reconnectLeaseMs: 20000
    }

    /**
     * Lease timers keyed by binding, so a binding that is superseded, rebound or retired before its
     * lease ends never expires a slot it no longer describes.
     * @member {Map} leaseTimers=new Map()
     * @protected
     */
    leaseTimers = new Map()

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        Neo.currentWorker?.on?.({
            connect   : me.onWindowConnect,
            disconnect: me.onWindowDisconnect,
            scope     : me
        })
    }

    /**
     * Binds a window into a Group under a workspace key. Without an identity the window is a new root and
     * receives a freshly minted Group. Every outcome names the identity the caller must carry from now on:
     * after `forked` it differs from the one presented.
     * @param {Object} data
     * @param {String} [data.groupId] The presented Group, absent for a first boot.
     * @param {String} [data.workspaceKey='main'] One key per full Workspace slot.
     * @param {String} [data.generationToken] The lineage token the carrier holds.
     * @param {String} data.windowId The runtime generation binding now.
     * @returns {{outcome: String, groupId: String, workspaceKey: String, generationToken: String, windowId: String, generation: Number}}
     *   `outcome` is one of `minted` (no identity presented), `cold` (a Group this worker never saw),
     *   `bound` (a free or reserved slot), `rebound` (a released slot, token matched) or `forked`.
     */
    bind({groupId, workspaceKey='main', generationToken, windowId}) {
        let me = this,
            group, binding, outcome;

        if (!groupId) {
            group   = me.createGroup();
            outcome = 'minted'
        } else {
            group = me.get(groupId);

            if (!group) {
                group   = me.createGroup(groupId);
                outcome = 'cold'
            }
        }

        binding = group.bindings.get(workspaceKey);

        if (binding) {
            const live = binding.windowId !== null;

            if (live && binding.windowId === windowId) {
                return me.describe(group, binding, 'bound')
            }

            if (live || binding.generationToken !== generationToken) {
                // A copied identity while the binder lives, or a stranger on a held slot: the newcomer
                // gets its own Group. The current binder is never superseded from the outside.
                group   = me.createGroup();
                binding = null;
                outcome = 'forked'
            } else {
                me.clearLease(binding);
                binding.windowId = windowId;
                binding.generation++;
                return me.describe(group, binding, 'rebound')
            }
        }

        binding = {
            generation     : 1,
            generationToken: (outcome === 'forked' || !generationToken) ? crypto.randomUUID() : generationToken,
            windowId,
            workspaceKey
        };

        group.bindings.set(workspaceKey, binding);

        return me.describe(group, binding, outcome || 'bound')
    }

    /**
     * Ends a lease timer for a binding, if one is running.
     * @param {Object} binding
     * @protected
     */
    clearLease(binding) {
        let me      = this,
            timerId = me.leaseTimers.get(binding);

        if (timerId !== undefined) {
            clearTimeout(timerId);
            me.leaseTimers.delete(binding)
        }
    }

    /**
     * Registers a new Group. The id is minted here unless a carrier presents one this worker never saw.
     * @param {String} [groupId]
     * @returns {Object} The Group record: `{id, bindings, createdAt}`
     * @protected
     */
    createGroup(groupId=crypto.randomUUID()) {
        const group = {
            bindings : new Map(),
            createdAt: Date.now(),
            id       : groupId
        };

        this.register(group);

        return group
    }

    /**
     * @param {Object} group
     * @param {Object} binding
     * @param {String} outcome
     * @returns {Object}
     * @protected
     */
    describe(group, binding, outcome) {
        const result = {
            generation     : binding.generation,
            generationToken: binding.generationToken,
            groupId        : group.id,
            outcome,
            windowId       : binding.windowId,
            workspaceKey   : binding.workspaceKey
        };

        // The emitter annotates the object it is handed; callers get the plain description.
        this.fire('bind', {...result});

        return result
    }

    /**
     * Finds the Group and binding a live window belongs to.
     * @param {String} windowId
     * @returns {{groupId: String, workspaceKey: String, generation: Number}|null}
     */
    findByWindow(windowId) {
        for (const group of this.items) {
            for (const binding of group.bindings.values()) {
                if (binding.windowId === windowId) {
                    return {generation: binding.generation, groupId: group.id, workspaceKey: binding.workspaceKey}
                }
            }
        }

        return null
    }

    /**
     * @param {String} groupId
     * @param {String} workspaceKey
     * @returns {{windowId: String|null, generation: Number, workspaceKey: String}|null} A copy of the binding
     *   without its token; `windowId` is `null` while the slot is released or reserved.
     */
    getBinding(groupId, workspaceKey) {
        const binding = this.get(groupId)?.bindings.get(workspaceKey);

        return binding ? {generation: binding.generation, windowId: binding.windowId, workspaceKey} : null
    }

    /**
     * Worker `connect`: a window presenting a carried identity binds; one without is a new root.
     * The identity travels inside `windowData`, beside the native route the main thread already resolves
     * for it.
     * @param {Object} data
     * @param {Object} [data.windowData]
     * @param {String} data.windowId
     * @protected
     */
    onWindowConnect({windowData, windowId}) {
        const identity = windowData?.topologyIdentity;

        // Windows that carry no identity slot at all (a worker booted without the main-thread carrier)
        // are left alone; consumers opting in present `topologyIdentity: {}` for a fresh root.
        if (identity === undefined) return;

        const result = this.bind({...identity, windowId});

        // The carrier learns what the worker decided: a minted, cold or forked identity differs from the
        // one presented; a plain bind or rebind changes nothing the window did not already carry.
        if (
            result.groupId         !== identity.groupId      ||
            result.workspaceKey    !== identity.workspaceKey ||
            result.generationToken !== identity.generationToken
        ) {
            Neo.Main?.setTopologyIdentity?.({
                generationToken: result.generationToken,
                groupId        : result.groupId,
                windowId,
                workspaceKey   : result.workspaceKey
            })
        }
    }

    /**
     * Worker `disconnect`: the binding carrying this `windowId` is released and its slot held for the
     * lease. A `windowId` no binding carries — a superseded generation reporting late — changes nothing.
     * @param {Object} data
     * @param {String} data.windowId
     * @protected
     */
    onWindowDisconnect({windowId}) {
        this.release(windowId)
    }

    /**
     * Releases the binding a window holds and starts its lease.
     * @param {String} windowId
     * @returns {Boolean} Whether a binding was released.
     */
    release(windowId) {
        let me = this;

        for (const group of me.items) {
            for (const binding of group.bindings.values()) {
                if (binding.windowId === windowId) {
                    binding.windowId = null;
                    me.startLease(group, binding);
                    me.fire('release', {generation: binding.generation, groupId: group.id, workspaceKey: binding.workspaceKey});
                    return true
                }
            }
        }

        return false
    }

    /**
     * Reserves a slot for a window the caller is about to open. The returned identity is what the opener
     * writes into the child's carrier; the child's `connect` then binds with the reserved token. A slot
     * with a live binder cannot be reserved.
     * @param {Object} data
     * @param {String} data.groupId
     * @param {String} data.workspaceKey
     * @returns {{groupId: String, workspaceKey: String, generationToken: String}|null}
     */
    reserve({groupId, workspaceKey}) {
        let me    = this,
            group = me.get(groupId),
            binding;

        if (!group || !workspaceKey) return null;

        binding = group.bindings.get(workspaceKey);

        if (binding?.windowId) return null;

        binding && me.clearLease(binding);

        binding = {
            generation     : binding ? binding.generation : 0,
            generationToken: crypto.randomUUID(),
            windowId       : null,
            workspaceKey
        };

        group.bindings.set(workspaceKey, binding);
        me.startLease(group, binding);

        return {generationToken: binding.generationToken, groupId, workspaceKey}
    }

    /**
     * Retires a Group and every lease it holds. Whether a Group MAY retire — durably persisted, no
     * retained reference — is the caller's contract; this manager only forgets what it is told to.
     * @param {String} groupId
     * @returns {Boolean}
     */
    retireGroup(groupId) {
        let me    = this,
            group = me.get(groupId);

        if (!group) return false;

        group.bindings.forEach(binding => me.clearLease(binding));
        me.unregister(group);

        return true
    }

    /**
     * Holds a released or reserved slot for its lineage; on expiry the slot is free.
     * @param {Object} group
     * @param {Object} binding
     * @protected
     */
    startLease(group, binding) {
        let me = this;

        me.clearLease(binding);

        me.leaseTimers.set(binding, setTimeout(() => {
            me.leaseTimers.delete(binding);

            // Only the binding this lease was started for; a rebind replaced it with a live one.
            if (group.bindings.get(binding.workspaceKey) === binding && binding.windowId === null) {
                group.bindings.delete(binding.workspaceKey);
                me.fire('leaseExpired', {groupId: group.id, workspaceKey: binding.workspaceKey})
            }
        }, me.reconnectLeaseMs))
    }
}

export default Neo.setupClass(Transaction);
