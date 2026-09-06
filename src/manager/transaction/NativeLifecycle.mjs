import Base from '../../core/Base.mjs';

/**
 * @summary Owns native admission, connection and retirement state for one logical Group.
 * @description Sources contribute platform effects and observations. Their component lifetime does
 * not own the windows: unbind preserves committed ownership, and only explicit retirement closes
 * native resources. Resource ids and context are opaque to this owner; no document or app is imported.
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
     * @param {Function} effects.keyFor Maps an opaque item id to its Group workspace key.
     * @param {Function} effects.open Opens with request context and the reserved topologyIdentity.
     * @param {Function} effects.close Closes an exact vessel; false or rejection retains retry authority.
     * @param {Function} [effects.context] Supplies additional runtime context for a binding.
     * @param {Function} [effects.prepare] Asynchronous admission; false refuses the connection.
     * @param {Function} [effects.bound] Embodies the accepted connection after state publication.
     * @param {Function} [effects.ownerChanged] Observes the ownership write, never owns its registry.
     * @param {Function} [effects.unbind] Unbinds projection; false retains semantic ownership.
     * @param {Function} [effects.released] Handles a released resource which was not retained.
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
        const source = this.sources.get(sourceId);
        if (source) source.active = false
    }

    /**
     * @summary Reads one pending native admission.
     * @param {String} sourceId
     * @param {String} itemId
     * @returns {Object|null}
     */
    getAdmission(sourceId, itemId) { return this.sources.get(sourceId)?.admissions.get(itemId) ?? null }

    /**
     * @summary Reads a connection which has not yet become committed ownership.
     * @param {String} sourceId
     * @param {String} itemId
     * @returns {Object|null}
     */
    getConnection(sourceId, itemId) { return this.sources.get(sourceId)?.connections.get(itemId) ?? null }

    /**
     * @summary Reads committed native ownership, including an unbound render target.
     * @param {String} sourceId
     * @param {String} itemId
     * @returns {Object|null}
     */
    getOwner(sourceId, itemId) { return this.sources.get(sourceId)?.owners.get(itemId) ?? null }

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
     * @param {String} itemId
     * @param {Object} [admission]
     * @returns {Boolean}
     */
    clearAdmission(sourceId, itemId, admission=this.getAdmission(sourceId, itemId)) {
        const source = this.sources.get(sourceId);
        return !!admission && source?.admissions.get(itemId) === admission && source.admissions.delete(itemId)
    }

    /**
     * @summary Removes a provisional connection.
     * @param {String} sourceId
     * @param {String} itemId
     * @returns {Boolean}
     */
    clearConnection(sourceId, itemId) { return this.sources.get(sourceId)?.connections.delete(itemId) ?? false }

    /**
     * @summary Records or withdraws committed ownership and consumes its provisional admission.
     * @param {String} sourceId
     * @param {String} itemId
     * @param {Object|null} entry
     * @param {Object|null} [connection=null]
     * @param {Boolean} [merge=false]
     * @returns {void}
     */
    recordOwner(sourceId, itemId, entry, connection=null, merge=false) {
        const source = this.sources.get(sourceId);
        if (!source) throw new Error('native source is not registered');
        if (merge) {
            const current = source.owners.get(itemId);
            current && Object.assign(current, entry)
        } else if (entry === null) {
            source.owners.delete(itemId);
            source.connections.delete(itemId)
        } else {
            source.owners.set(itemId, entry);
            if (connection) {
                source.connections.delete(itemId);
                this.clearAdmission(sourceId, itemId)
            }
        }
        source.active && source.effects.ownerChanged?.({itemId, entry, connection, merge})
    }

    /**
     * @summary Reserves a Group slot before opening its platform window, with late-result cleanup.
     * @param {String} sourceId
     * @param {Object} request The opaque resource context, carrying a nonempty itemId.
     * @returns {Promise<Object|null>}
     */
    async acquire(sourceId, request={}) {
        const source = this.sources.get(sourceId), {itemId} = request;
        if (!source?.active || typeof itemId !== 'string' || !itemId) return null;
        const effects = source.effects;
        if (!await this.retryRetirements(sourceId, itemId) || !source.active) return null;
        const reservation = this.manager.reserve({groupId: this.groupId, workspaceKey: effects.keyFor(itemId)});
        if (!reservation) return null;
        const admission = {connected: false, connectingWindowId: null, ...reservation,
            gestureToken: request.gestureToken ?? null, itemId, context: request, windowId: null, windowName: null};
        source.admissions.set(itemId, admission);
        let vessel;
        try { vessel = await effects.open({...request, topologyIdentity: reservation}) } catch { vessel = null }
        if (!vessel) {
            source.admissions.get(itemId) === admission && source.admissions.delete(itemId);
            !this.isDestroyed && this.manager.revoke(reservation);
            return null
        }
        const identity = {...vessel, ...reservation, gestureToken: admission.gestureToken, itemId};
        if (this.isDestroyed || !source.active || source.effects !== effects || source.admissions.get(itemId) !== admission) {
            // The captured effect survives destruction of the source and of this owner.
            if (this.isDestroyed) {
                try { await effects.close(identity) } catch {}
            } else {
                await this.retire(sourceId, identity, effects.close)
            }
            return null
        }
        admission.windowName = vessel.windowName || admission.windowName;
        const connection = source.connections.get(itemId);
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
     * @summary Retains close authority until the platform acknowledges the exact native generation.
     * @param {String} sourceId
     * @param {Object} vessel
     * @param {Function} [close] The effect captured for this native generation.
     * @returns {Promise<Boolean>}
     */
    async retire(sourceId, vessel={}, close) {
        const source = this.sources.get(sourceId);
        if (!source) return false;
        const key        = JSON.stringify([vessel.itemId, vessel.windowName, vessel.generationToken ?? null]);
        const retirement = {vessel, close: close ?? source.retirements.get(key)?.close ?? source.effects.close};
        source.retirements.set(key, retirement);
        let closed;
        try { closed = await retirement.close(vessel) } catch { closed = false }
        if (closed === false) return false;
        source.retirements.get(key) === retirement && source.retirements.delete(key);
        const matches = entry => entry && (vessel.generationToken
            ? entry.generationToken === vessel.generationToken : entry.windowName === vessel.windowName);
        const admission = source.admissions.get(vessel.itemId);
        matches(admission) && source.admissions.delete(vessel.itemId);
        matches(source.connections.get(vessel.itemId)) && source.connections.delete(vessel.itemId);
        return true
    }

    /**
     * @summary Admits only a source's reserved slot after its asynchronous platform preparation.
     * @param {Object} data The Group manager's accepted generation binding.
     * @returns {Promise<void>}
     */
    async onBind(data) {
        if (data.groupId !== this.groupId) return;
        for (const [sourceId, source] of this.sources) {
            const match = [...source.admissions].find(([, entry]) => entry.workspaceKey === data.workspaceKey);
            if (!source.active || !match) continue;
            const [itemId, admission] = match, effects = source.effects;
            if (admission.connected || admission.connectingWindowId && admission.connectingWindowId !== data.windowId) continue;
            admission.connectingWindowId = data.windowId;
            const context = {...effects.context?.(data), admission, data, itemId, ...data};
            let accepted;
            try { accepted = await effects.prepare?.(context) } catch (error) {
                source.admissions.get(itemId) === admission && (admission.connectingWindowId = null);
                throw error
            }
            if (!source.active || source.admissions.get(itemId) !== admission || admission.connectingWindowId !== data.windowId) continue;
            if (accepted === false) { admission.connectingWindowId = null; continue }
            const connection = {generation: data.generation, generationToken: admission.generationToken,
                gestureToken: admission.gestureToken, windowId: data.windowId, workspaceKey: data.workspaceKey,
                windowName  : context.activeVessel?.windowName || source.owners.get(itemId)?.windowName || admission.windowName};
            admission.connected = true;
            admission.windowId = data.windowId;
            if (!source.owners.has(itemId)) source.connections.set(itemId, connection);
            await effects.bound?.({...context, connection, owned: source.owners.has(itemId)});
            if (source.owners.has(itemId)) this.clearAdmission(sourceId, itemId, admission)
        }
    }

    /**
     * @summary Releases native binding state while preserving the Group's committed resource ownership.
     * @param {Object} data The generation that actually disconnected.
     * @returns {Promise<void>}
     */
    async onRelease(data) {
        if (data.groupId !== this.groupId) return;
        for (const [sourceId, source] of this.sources) {
            const owned    = [...source.owners].find(([, entry]) => entry.windowId === data.windowId);
            const retained = source.active && await source.effects.unbind?.(data) === false;
            const match    = owned || [...source.connections].find(([, entry]) => entry.windowId === data.windowId);
            if (!match) continue;
            const [itemId, entry] = match, admission = source.admissions.get(itemId);
            source.connections.delete(itemId);
            this.clearAdmission(sourceId, itemId, admission);
            if (owned) source.owners.set(itemId, {...entry, windowId: null});
            if (source.active && !retained) await source.effects.released?.({data, itemId, entry, admission, committed: !!owned})
        }
    }

    /**
     * @summary Cleans up an unbound provisional window when its reservation expires.
     * @param {Object} data The expired Group slot.
     * @returns {Promise<void>}
     */
    async onLeaseExpired(data) {
        if (data.groupId !== this.groupId) return;
        for (const [sourceId, source] of this.sources) {
            const match = [...source.admissions].find(([, entry]) => entry.workspaceKey === data.workspaceKey && !entry.connected);
            if (!match) continue;
            const [itemId, admission] = match, entry = source.owners.get(itemId);
            const vessel              = {...entry, ...admission, windowName: admission.windowName || entry?.windowName};
            if (await this.retire(sourceId, vessel) && source.active) {
                await source.effects.expired?.({data, itemId, entry, admission, vessel})
            }
        }
    }

    /**
     * @summary Explicit Group retirement closes its remaining native resources exactly once.
     * @param {...*} args
     */
    destroy(...args) {
        this.manager.un({bind: this.onBind, release: this.onRelease,
            leaseExpired: this.onLeaseExpired, scope: this});
        for (const source of this.sources.values()) {
            source.active = false;
            const vessels = new Map();
            for (const entries of [source.admissions, source.connections, source.owners]) {
                for (const [itemId, entry] of entries) {
                    if (entry.windowName) vessels.set(JSON.stringify([entry.windowName, entry.generationToken]), {...entry, itemId: entry.itemId ?? itemId})
                }
            }
            const close  = source.effects.close;
            const closes = new Map([...vessels].map(([key, vessel]) => [key, {vessel, close}]));
            for (const entry of source.retirements.values()) {
                closes.set(JSON.stringify([entry.vessel.windowName, entry.vessel.generationToken]), entry)
            }
            for (const entry of closes.values()) Promise.resolve().then(() => entry.close(entry.vessel)).catch(() => {})
        }
        this.sources.clear();
        super.destroy(...args)
    }
}

export default Neo.setupClass(NativeLifecycle);
