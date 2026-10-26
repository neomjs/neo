import Base from '../../core/Base.mjs';

/**
 * @summary Owns native admission, connection and retirement state for one logical Group.
 * @description Sources contribute platform effects and observations. Their component lifetime does
 * not own the windows: unbind preserves committed ownership, and only explicit retirement closes
 * native resources. Resource ids and context are opaque to this owner; no document or app is imported.
 *
 * A resource is identified by its Group workspace key, minted at admission, never by the item it was
 * opened for: a popup keeps its key after that item leaves it, and the item can open another resource
 * meanwhile. Records carry the opening item as provenance only.
 * @class Neo.manager.transaction.NativeLifecycle
 * @extends Neo.core.Base
 */
class NativeLifecycle extends Base {
    static config = {
        /**
         * @member {String} className='Neo.manager.transaction.NativeLifecycle'
         */
        className: 'Neo.manager.transaction.NativeLifecycle',
        /**
         * @member {String|null} groupId=null
         */
        groupId: null,
        /**
         * @member {Neo.manager.Transaction|null} manager=null
         */
        manager: null
    }

    /**
     * @member {Map<String,Object>} sources Native effects and their Group-owned runtime state.
     */
    sources = new Map()

    /**
     * @summary Whether native resources still retain this Group.
     * @returns {Boolean}
     */
    get hasResources() {
        return [...this.sources.values()].some(source =>
            source.admissions.size || source.connections.size || source.owners.size || source.retirements.size)
    }

    /**
     * @summary Subscribes once for this Group, independently of its views.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.manager.on({bind: this.onBind, release: this.onRelease,
            leaseExpired: this.onLeaseExpired, scope: this})
    }

    /**
     * @summary Registers a source's effects without replacing any retained native ownership.
     * @param {String} sourceId Opaque source identity within this Group.
     * @param {Object} effects Source-owned platform and projection callbacks.
     * @param {Function} effects.keyFor Maps an opaque item id to its preferred Group workspace key.
     * @param {Function} effects.open Opens with request context and the reserved topologyIdentity.
     * @param {Function} effects.close Closes an exact vessel; false or rejection retains retry authority.
     * @param {Function} [effects.context] Supplies additional runtime context for a binding.
     * @param {Function} [effects.prepare] Asynchronous admission; false refuses the connection.
     * @param {Function} [effects.bound] Embodies the accepted connection after state publication.
     * @param {Function} [effects.ownerChanged] Observes the ownership write, never owns its registry.
     * @param {Function} [effects.unbind] Unbinds projection; false or {retained: true} retains semantic ownership,
     *     and {retained: true, readmit: true} also holds the key for its own lineage to bind again — until an
     *     optional `closed` promise resolves true, or the lease ends.
     * @param {Function} [effects.released] Handles a released resource which was not retained, or a held one
     *     whose lineage did not bind again before its lease ended.
     * @param {Function} [effects.bindingExpired] Observes a formerly bound release awaiting native closure.
     * @param {Function} [effects.expired] Handles acknowledged cleanup of a provisional resource.
     * @returns {void}
     */
    registerSource(sourceId, effects) {
        if (typeof sourceId !== 'string' || !sourceId ||
            ['keyFor', 'open', 'close'].some(key => typeof effects?.[key] !== 'function')) {
            throw new TypeError('native source requires an identity and keyFor/open/close effects')
        }
        let source = this.sources.get(sourceId);
        if (!source) {
            source = {admissions: new Map(), connections: new Map(), owners: new Map(), retirements: new Map()};
            this.sources.set(sourceId, source)
        }
        source.effects = effects;
        source.active = true
    }

    /**
     * @summary Withdraws a view's effects; committed windows remain owned by the Group.
     * @param {String} sourceId
     * @returns {void}
     */
    unregisterSource(sourceId) {
        if (this.isDestroyed) return;
        const source = this.sources.get(sourceId);
        if (source) source.active = false
    }

    /**
     * @summary Reads one pending native admission.
     * @param {String} sourceId
     * @param {String} workspaceKey
     * @returns {Object|null}
     */
    getAdmission(sourceId, workspaceKey) { return this.sources.get(sourceId)?.admissions.get(workspaceKey) ?? null }

    /**
     * @summary Reads a connection which has not yet become committed ownership.
     * @param {String} sourceId
     * @param {String} workspaceKey
     * @returns {Object|null}
     */
    getConnection(sourceId, workspaceKey) { return this.sources.get(sourceId)?.connections.get(workspaceKey) ?? null }

    /**
     * @summary Reads committed native ownership, including an unbound render target.
     * @param {String} sourceId
     * @param {String} workspaceKey
     * @returns {Object|null}
     */
    getOwner(sourceId, workspaceKey) { return this.sources.get(sourceId)?.owners.get(workspaceKey) ?? null }

    /**
     * @summary Resolves the key of an item's newest resource: a pending admission first, then a connection,
     * then committed ownership. An older resource opened for the same item keeps that item as provenance, so
     * the newest record answers; which window holds the item now is its document's answer, not this one.
     * @param {String} sourceId
     * @param {String} itemId
     * @returns {String|null}
     */
    keyOf(sourceId, itemId) {
        const source = this.sources.get(sourceId);
        for (const records of [source?.admissions, source?.connections, source?.owners]) {
            let match = null;
            records?.forEach((entry, workspaceKey) => { entry.itemId === itemId && (match = workspaceKey) });
            if (match) return match
        }
        return null
    }

    /**
     * @summary Mints the Group key of a new resource: the preferred key while it is free, else the first free
     * `<preferred>:<n>`. A key stays taken while the Group binds or reserves it or any source still records it,
     * so a new resource never replaces a pending, reconnecting or retained one. A released binding nothing records
     * any more is free: its window left for good, and a stale reconnect presenting the old generation token is
     * refused. A participant alone holds no key, since a document stays registered after its window closes and
     * the item's next resource takes that key again. The caller reserves the result in the same synchronous step.
     * @param {String} preferredKey
     * @returns {String}
     * @protected
     */
    mintKey(preferredKey) {
        const me    = this,
              group = me.manager.get(me.groupId),
              held  = binding => !!binding && (binding.windowId !== null || !binding.releasedWindowId),
              taken = key => held(group?.bindings.get(key)) || [...me.sources.values()].some(source =>
                  source.admissions.has(key) || source.connections.has(key) || source.owners.has(key) ||
                  [...source.retirements.values()].some(retirement => retirement.workspaceKey === key));

        let key = preferredKey;

        for (let n = 2; taken(key); n++) key = `${preferredKey}:${n}`;

        return key
    }

    /**
     * @summary Lists committed source records without handing out the registry.
     * @param {String} sourceId
     * @returns {Array}
     */
    ownerEntries(sourceId) { return [...(this.sources.get(sourceId)?.owners ?? [])] }

    /**
     * @summary Lists provisional connections without handing out the registry.
     * @param {String} sourceId
     * @returns {Array}
     */
    connectionEntries(sourceId) { return [...(this.sources.get(sourceId)?.connections ?? [])] }

    /**
     * @summary Lists exact native closes still requiring acknowledgment.
     * @param {String} sourceId
     * @returns {Object[]}
     */
    pendingRetirements(sourceId) { return [...(this.sources.get(sourceId)?.retirements.values() ?? [])].map(entry => entry.vessel) }

    /**
     * @summary Clears only the admission the caller observed, never a successor for the same key.
     * @param {String} sourceId
     * @param {String} workspaceKey
     * @param {Object} [admission]
     * @returns {Boolean}
     */
    clearAdmission(sourceId, workspaceKey, admission=this.getAdmission(sourceId, workspaceKey)) {
        const source = this.sources.get(sourceId);
        return !!admission && source?.admissions.get(workspaceKey) === admission && source.admissions.delete(workspaceKey)
    }

    /**
     * @summary Removes a provisional connection.
     * @param {String} sourceId
     * @param {String} workspaceKey
     * @returns {Boolean}
     */
    clearConnection(sourceId, workspaceKey) { return this.sources.get(sourceId)?.connections.delete(workspaceKey) ?? false }

    /**
     * @summary Records or withdraws committed ownership and consumes its provisional admission. A new record
     * keeps the item its resource was opened for.
     * @param {String} sourceId
     * @param {String} workspaceKey
     * @param {Object|null} entry
     * @param {Object|null} [connection=null]
     * @param {Boolean} [merge=false]
     * @returns {void}
     */
    recordOwner(sourceId, workspaceKey, entry, connection=null, merge=false) {
        const source = this.sources.get(sourceId);
        if (!source) throw new Error('native source is not registered');
        const itemId = entry?.itemId ?? connection?.itemId ?? source.owners.get(workspaceKey)?.itemId ??
            source.connections.get(workspaceKey)?.itemId ?? source.admissions.get(workspaceKey)?.itemId ?? null;
        if (merge) {
            const current = source.owners.get(workspaceKey);
            current && Object.assign(current, entry)
        } else if (entry === null) {
            source.owners.delete(workspaceKey);
            source.connections.delete(workspaceKey)
        } else {
            entry.itemId ??= itemId;
            source.owners.set(workspaceKey, entry);
            if (connection) {
                source.connections.delete(workspaceKey);
                this.clearAdmission(sourceId, workspaceKey)
            }
        }
        source.active && source.effects.ownerChanged?.({itemId, workspaceKey, entry, connection, merge})
    }

    /**
     * @summary Reserves a Group slot before opening its platform window, with late-result cleanup.
     *
     * The slot's key is minted and reserved in one synchronous step. A gesture opens one resource for its
     * item: while its first admission is pending, a second acquisition by the same gesture opens nothing.
     * @param {String} sourceId
     * @param {Object} request The opaque resource context, carrying a nonempty itemId.
     * @returns {Promise<Object|null>}
     */
    async acquire(sourceId, request={}) {
        const source = this.sources.get(sourceId), {itemId} = request, gestureToken = request.gestureToken ?? null;
        if (!source?.active || typeof itemId !== 'string' || !itemId) return null;
        const effects = source.effects;
        if (!await this.retryRetirements(sourceId, itemId) || !source.active) return null;
        if (gestureToken !== null && [...source.admissions.values()].some(entry =>
            entry.itemId === itemId && entry.gestureToken === gestureToken)) return null;
        const reservation = this.manager.reserve({groupId: this.groupId, workspaceKey: this.mintKey(effects.keyFor(itemId))});
        if (!reservation) return null;
        const {workspaceKey} = reservation;
        const admission      = {connected: false, connectingWindowId: null, ...reservation,
            gestureToken, itemId, context: request, windowId: null, windowName: null};
        source.admissions.set(workspaceKey, admission);
        let vessel;
        try { vessel = await effects.open({...request, topologyIdentity: reservation}) } catch { vessel = null }
        if (!vessel) {
            source.admissions.get(workspaceKey) === admission && source.admissions.delete(workspaceKey);
            !this.isDestroyed && this.manager.revoke(reservation);
            return null
        }
        const identity = {...vessel, ...reservation, gestureToken, itemId};
        if (this.isDestroyed || !source.active || source.effects !== effects || source.admissions.get(workspaceKey) !== admission) {
            // The captured effect survives destruction of the source and of this owner.
            if (this.isDestroyed) {
                try { await effects.close(identity) } catch {}
            } else {
                await this.retire(sourceId, identity, effects.close)
            }
            return null
        }
        admission.windowName = vessel.windowName || admission.windowName;
        const connection = source.connections.get(workspaceKey);
        connection && !connection.windowName && (connection.windowName = admission.windowName);
        return identity
    }

    /**
     * @summary Retries refused native closes before the same source opens another resource.
     * @param {String} sourceId
     * @param {String} itemId
     * @returns {Promise<Boolean>}
     */
    async retryRetirements(sourceId, itemId) {
        const source = this.sources.get(sourceId);
        for (const {vessel, close} of [...(source?.retirements.values() ?? [])]) {
            if (vessel.itemId === itemId && !await this.retire(sourceId, vessel, close)) return false
        }
        return true
    }

    /**
     * @summary Retains close authority until the platform acknowledges the exact native generation. The
     * vessel names its own key and generation, so a late close of an older resource for the same item never
     * reaches the item's newer one.
     * @param {String} sourceId
     * @param {Object} vessel
     * @param {Function} [close] The effect captured for this native generation.
     * @returns {Promise<Boolean>}
     */
    async retire(sourceId, vessel={}, close) {
        const source = this.sources.get(sourceId);
        if (!source) return false;
        // A vessel naming no key is its item's newest resource; one naming its key is that one, whatever came after
        const workspaceKey = vessel.workspaceKey ?? this.keyOf(sourceId, vessel.itemId);
        const key          = JSON.stringify([workspaceKey ?? vessel.itemId, vessel.windowName, vessel.generationToken ?? null]);
        const retirement   = {vessel, workspaceKey, close: close ?? source.retirements.get(key)?.close ?? source.effects.close};
        source.retirements.set(key, retirement);
        let closed;
        try { closed = await retirement.close(vessel) } catch { closed = false }
        if (closed === false && !retirement.released) return false;
        source.retirements.get(key) === retirement && source.retirements.delete(key);
        const matches = entry => entry && (vessel.generationToken
            ? entry.generationToken === vessel.generationToken : entry.windowName === vessel.windowName);
        matches(source.admissions.get(workspaceKey)) && source.admissions.delete(workspaceKey);
        matches(source.connections.get(workspaceKey)) && source.connections.delete(workspaceKey);
        return true
    }

    /**
     * @summary Admits only a source's reserved slot after its asynchronous platform preparation.
     * Pending retirement rejects admission on both sides of preparation while retaining close authority.
     * @param {Object} data The Group manager's accepted generation binding.
     * @returns {Promise<void>}
     */
    async onBind(data) {
        if (data.groupId !== this.groupId) return;
        for (const [sourceId, source] of this.sources) {
            const {workspaceKey} = data, admission = source.admissions.get(workspaceKey);
            if (!source.active || !admission) continue;
            const {itemId} = admission, effects = source.effects,
                  retiring = () => [...source.retirements.values()].some(retirement => retirement.workspaceKey === workspaceKey);
            if (admission.connected || admission.connectingWindowId && admission.connectingWindowId !== data.windowId || retiring()) continue;
            admission.connectingWindowId = data.windowId;
            const context = {...effects.context?.(data), admission, data, itemId, ...data};
            let accepted;
            try { accepted = await effects.prepare?.(context) } catch (error) {
                source.admissions.get(workspaceKey) === admission && (admission.connectingWindowId = null);
                throw error
            }
            if (!source.active || source.admissions.get(workspaceKey) !== admission || admission.connectingWindowId !== data.windowId) continue;
            if (accepted === false || retiring()) { admission.connectingWindowId = null; continue }
            const connection = {generation: data.generation, generationToken: admission.generationToken,
                gestureToken: admission.gestureToken, itemId, windowId: data.windowId, workspaceKey,
                windowName  : context.activeVessel?.windowName || source.owners.get(workspaceKey)?.windowName || admission.windowName};
            admission.connected = true;
            admission.windowId = data.windowId;
            if (!source.owners.has(workspaceKey)) source.connections.set(workspaceKey, connection);
            await effects.bound?.({...context, connection, owned: source.owners.has(workspaceKey)});
            if (source.owners.has(workspaceKey)) this.clearAdmission(sourceId, workspaceKey, admission)
        }
    }

    /**
     * @summary Checks the exact released Group binding, including its own expired reconnect lease.
     * @param {Object} data The manager's release or lease-expiry event.
     * @returns {Boolean}
     */
    isCurrentRelease(data) {
        const binding = data?.releasedBinding, group = this.manager.get(data?.groupId),
              current = group?.bindings.get(data?.workspaceKey);
        return !this.isDestroyed && data?.groupId === this.groupId && group?.nativeLifecycle === this && !!binding &&
            binding.workspaceKey === data.workspaceKey && binding.generation === data.generation &&
            binding.generationToken === data.generationToken && binding.windowId === null &&
            (binding.releasedWindowId ?? null) === (data.releasedWindowId ?? null) &&
            (current === binding || !current && binding.leaseExpired === true)
    }

    /**
     * @summary Latches the full asynchronous release operation on its binding until it settles.
     * @param {Object} data The exact release scope; stale scopes are refused before work starts.
     * @param {Function} work The caller revalidates after observations and in its queued write guard.
     * @returns {Promise<*>|false} Duplicate pending calls share the promise and its committed result.
     */
    withReleasedBinding(data, work) {
        if (!this.isCurrentRelease(data)) return false;
        const binding = data.releasedBinding;
        if (binding.releaseWork) return binding.releaseWork;
        const pending = Promise.resolve().then(() => this.isCurrentRelease(data) ? work() : false).finally(() => {
            if (binding.releaseWork === pending) binding.releaseWork = null
        });
        binding.releaseWork = pending;
        return pending
    }

    /**
     * @summary Observes reconnect-lease expiry only for the exact current release scope.
     * @param {Object} data The manager's release or lease-expiry envelope.
     * @returns {Boolean} False for a foreign, rebound or superseded scope.
     */
    isLeaseExpired(data) {
        return this.isCurrentRelease(data) && data.releasedBinding.leaseExpired === true
    }

    /**
     * @summary Releases native binding state while preserving the Group's committed resource ownership.
     * @param {Object} data The generation that actually disconnected.
     * @returns {Promise<void>}
     */
    async onRelease(data) {
        if (data.groupId !== this.groupId) return;
        if (data.releasedBinding) {
            data = {...data, releasedWindowId: data.releasedWindowId ?? data.windowId};
            if (!this.isCurrentRelease(data)) return
        }
        for (const [sourceId, source] of this.sources) {
            const result   = source.active && await source.effects.unbind?.(data),
                  retained = result === false || result?.retained === true;
            if (this.isDestroyed) return;
            if (data.releasedBinding && !this.isCurrentRelease(data)) return;
            if (this.isCurrentRelease(data) && typeof result?.awaitingClosure === 'boolean') {
                data.releasedBinding.awaitingClosure = result.awaitingClosure
            }
            const owned = [...source.owners].find(([, entry]) => entry.windowId === data.windowId);
            const match = owned || [...source.connections].find(([, entry]) => entry.windowId === data.windowId)
                || [...source.admissions].find(([, entry]) => entry.connectingWindowId === data.windowId || entry.windowId === data.windowId);
            if (!match) continue;
            const [workspaceKey, entry] = match, admission = source.admissions.get(workspaceKey),
                  itemId                = entry.itemId ?? admission?.itemId ?? null;
            source.connections.delete(workspaceKey);
            this.clearAdmission(sourceId, workspaceKey, admission);
            for (const [key, retirement] of source.retirements) {
                const vessel = retirement.vessel;
                if (retirement.workspaceKey === workspaceKey && (vessel.generationToken
                    ? vessel.generationToken === entry.generationToken : vessel.windowName === entry.windowName)) {
                    retirement.released = true;
                    source.retirements.delete(key)
                }
            }
            if (owned) source.owners.set(workspaceKey, {...entry, windowId: null});
            // A held render target, e.g. a reloading window: the same lineage binds again through admission, while
            // the source's `closed` answer or the lease ending first hands the item to `released` (releaseHeld).
            if (owned && retained && result?.readmit === true) {
                source.admissions.set(workspaceKey, {
                    connected      : false, connectingWindowId: null, context: null, gestureToken: null, groupId: this.groupId,
                    generationToken: entry.generationToken ?? data.generationToken, itemId, readmit: true,
                    windowId       : null, windowName: entry.windowName ?? null, workspaceKey});
                result.closed?.then(closed => closed === true && this.releaseHeld(sourceId, workspaceKey, data), () => {})
            }
            if (source.active && !retained) await source.effects.released?.({data, itemId, workspaceKey, entry, admission, committed: !!owned})
        }
    }

    /**
     * @summary Hands a held key's committed item to `released` while its lineage has not bound again: when its
     * lease ends, or when its source learns the render target is gone for good. Nothing is closed first — a
     * window that already closed refuses a close, which would strand the item.
     * @param {String} sourceId
     * @param {String} workspaceKey
     * @param {Object} [data={}] The release or lease-expiry envelope `released` receives.
     * @returns {Promise<Boolean>} Whether a held key was released.
     */
    async releaseHeld(sourceId, workspaceKey, data={}) {
        const source = this.sources.get(sourceId), admission = source?.admissions.get(workspaceKey);
        if (!admission?.readmit || admission.connected || admission.connectingWindowId) return false;
        this.clearAdmission(sourceId, workspaceKey, admission);
        source.active && await source.effects.released?.({data, itemId: admission.itemId, workspaceKey,
            entry: source.owners.get(workspaceKey), admission, committed: source.owners.has(workspaceKey)});
        return true
    }

    /**
     * @summary Observes awaiting closure on bound expiry and cleans up expired provisional admissions.
     * @param {Object} data The expired Group slot.
     * @returns {Promise<void>}
     */
    async onLeaseExpired(data) {
        if (data.groupId !== this.groupId) return;
        for (const [sourceId, source] of this.sources) {
            if (source.active && data.generation > 0 && data.releasedBinding?.awaitingClosure && this.isCurrentRelease(data)) {
                const result = await source.effects.bindingExpired?.(data);
                if (this.isCurrentRelease(data) && typeof result?.awaitingClosure === 'boolean') {
                    data.releasedBinding.awaitingClosure = result.awaitingClosure
                }
            }
            if (data.releasedBinding && !this.isCurrentRelease(data)) continue;
            const {workspaceKey} = data, admission = source.admissions.get(workspaceKey);
            if (admission?.readmit) {
                await this.releaseHeld(sourceId, workspaceKey, data);
                continue
            }
            if (!admission || admission.connected) continue;
            const {itemId} = admission, entry = source.owners.get(workspaceKey);
            const vessel   = {...entry, ...admission, windowName: admission.windowName || entry?.windowName};
            if (await this.retire(sourceId, vessel) && source.active) {
                await source.effects.expired?.({data, itemId, workspaceKey, entry, admission, vessel})
            }
        }
    }

    /**
     * @summary Requests native closure before retiring the records those effects need to read.
     * @param {...*} args
     */
    destroy(...args) {
        this.manager.un({bind: this.onBind, release: this.onRelease,
            leaseExpired: this.onLeaseExpired, scope: this});
        for (const source of this.sources.values()) {
            source.active = false;
            const vessels = new Map();
            for (const entries of [source.admissions, source.connections, source.owners]) {
                for (const [workspaceKey, entry] of entries) {
                    if (entry.windowName) vessels.set(JSON.stringify([entry.windowName, entry.generationToken]), {...entry, workspaceKey})
                }
            }
            const close  = source.effects.close;
            const closes = new Map([...vessels].map(([key, vessel]) => [key, {vessel, close}]));
            for (const entry of source.retirements.values()) {
                closes.set(JSON.stringify([entry.vessel.windowName, entry.vessel.generationToken]), entry)
            }
            for (const entry of closes.values()) {
                try { Promise.resolve(entry.close(entry.vessel)).catch(() => {}) } catch {}
            }
        }
        this.sources.clear();
        super.destroy(...args)
    }
}

export default Neo.setupClass(NativeLifecycle);
