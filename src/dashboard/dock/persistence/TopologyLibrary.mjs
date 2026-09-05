import Base              from '../../../core/Base.mjs';
import Persistence       from '../model/Persistence.mjs';
import WorkspaceDocument from '../model/WorkspaceDocument.mjs';

/**
 * @summary One Group's named topology records and persistence seam.
 * @description The owning bootstrap creates this library lazily and supplies its storage adapter.
 * All wire rules remain in Persistence: this class holds one validated topology collection, with
 * isolated reads and explicit selection. It creates no Workspace, window, Group, or history row.
 *
 * prepareSelection() returns an isolated candidate without changing the active selection;
 * adoptCollection() is the explicit adopter a transaction owner can compose with other participants.
 * The local version fences stale candidates and storage reads. Persistence calls serialize, and an
 * acknowledgement for an older version never makes newer state clean. An optional Group attachment
 * retains its truth across reconnect leases and retires only after a current durable acknowledgement.
 *
 * @class Neo.dashboard.dock.persistence.TopologyLibrary
 * @extends Neo.core.Base
 */
class TopologyLibrary extends Base {
    /**
     * @summary Creates a window-independent browser storage adapter for one logical root.
     * @description IndexedDB is available in the App Worker after its last render target leaves.
     * A write resolves on transaction completion, never merely on the put request's success.
     * Each operation closes its connection, so no database handle outlives the library owner.
     * @param {String} key Stable storage identity, independent of the current window generation.
     * @returns {{read: Function, write: Function}}
     * @static
     */
    static createIndexedDBAdapter(key) {
        if (typeof key !== 'string' || !key.trim()) throw new Error('topology storage requires a root key');

        const transact = (mode, value) => new Promise((resolve, reject) => {
            const request = indexedDB.open('neo-dock-topologies', 1);

            request.onupgradeneeded = () => request.result.createObjectStore('collections');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const database = request.result;
                let transaction;

                try {
                    transaction = database.transaction('collections', mode);
                    const store     = transaction.objectStore('collections'),
                          operation = mode === 'readonly' ? store.get(key) : store.put(value, key);

                    transaction.oncomplete = () => {
                        database.close();
                        resolve(mode === 'readonly' ? operation.result ?? null : undefined)
                    };
                    transaction.onabort = () => {
                        database.close();
                        reject(transaction.error ?? new Error('topology storage transaction aborted'))
                    }
                } catch (error) {
                    transaction?.abort();
                    database.close();
                    reject(error)
                }
            }
        });

        return {read: () => transact('readonly'), write: collection => transact('readwrite', collection)}
    }

    static config = {
        /** @member {String} className='Neo.dashboard.dock.persistence.TopologyLibrary' */
        className: 'Neo.dashboard.dock.persistence.TopologyLibrary',
        /**
         * The validated neo.dock.topologyCollection.v1 document; null means nothing has been adopted.
         * @member {Object|null} collection_=null
         * @reactive
         */
        collection_: null,
        /**
         * Storage wiring. read() resolves to a collection or null; write(collection) acknowledges
         * those bytes by resolving and reports failure by rejecting. Only plain JSON crosses it.
         * @member {Object|null} persistenceAdapter=null
         */
        persistenceAdapter: null
    }

    /** @member {String[]} lastErrors=[] */
    lastErrors = []
    /** @member {Promise} #ioQueue */
    #ioQueue = Promise.resolve()
    /** @member {Number} #persistedVersion=0 */
    #persistedVersion = 0
    /** @member {Number} #version=0 */
    #version = 0
    /** @member {Object|null} #attachment=null */
    #attachment = null
    /** @member {Promise<Boolean>|null} #retirement=null */
    #retirement = null
    /** @member {Number|null} #retryTimer=null */
    #retryTimer = null

    /**
     * @summary Retains one Group and observes its existing binding lease, independently of windows.
     * @param {Object} options
     * @param {Neo.manager.Transaction} options.manager The generic Group authority.
     * @param {String} options.groupId
     * @param {Function} options.capture Returns the current `{topology, errors}` snapshot.
     * @param {Function} options.dispose Releases the host's components after Group retirement.
     * @param {Number} [options.retryDelayMs=1000] Bounded delay between failed persistence attempts.
     * @returns {Boolean}
     */
    attachGroup({manager, groupId, capture, dispose, retryDelayMs=1000}) {
        if (this.#attachment || this.isDestroyed || !Number.isFinite(retryDelayMs) || retryDelayMs < 1) return false;
        const group = manager.get(groupId);
        if (!group || typeof capture !== 'function' || typeof dispose !== 'function' || !manager.retainGroup(groupId, this)) return false;

        const listener = {
            commit: data => {
                if (data.groupId === groupId) this.persistCurrent()
            },
            bind: data => {
                if (data.groupId === groupId) {
                    this.#clearRetry();
                    group.persistenceState = 'active'
                }
            },
            leaseExpired: data => {
                if (data.groupId === groupId) this.retireIfHeadless()
            },
            scope: this
        };

        this.#attachment = {capture, dispose, group, groupId, listener, manager, retryDelayMs};
        manager.on(listener);
        group.persistenceState = 'active';
        return true
    }

    /**
     * @summary Cancels the persistence retry when a binder returns or the owner retires.
     * @private
     */
    #clearRetry() {
        if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
        this.#retryTimer = null
    }

    /**
     * @summary Captures committed Group truth before asking storage to acknowledge it.
     * @returns {Promise<Object>} The persistence receipt; capture failure preserves the held library.
     */
    async persistCurrent() {
        const attachment = this.#attachment;
        if (!attachment || this.isDestroyed) return {persisted: false, current: false, errors: ['no live Group attachment']};

        try {
            const {topology, errors} = attachment.capture();
            if (errors.length) return {persisted: false, current: false, errors};
            const saved = this.save(topology, {activate: true, replace: true});
            if (saved.errors.length) return {persisted: false, current: false, errors: saved.errors};
            return {...await this.persist(), topology}
        } catch (error) {
            return {persisted: false, current: false, errors: [String(error?.message ?? error)]}
        }
    }

    /**
     * @summary Retires after the Group queue, reconnect lease, references and storage all permit it.
     * @description Concurrent callers share the attempt. A bind or queued write arriving during I/O
     * invalidates retirement. Failure keeps the same Group and retries; it never replays history.
     * @returns {Promise<Boolean>} Whether this attempt retired the Group.
     */
    retireIfHeadless() {
        if (this.#retirement) return this.#retirement;
        const attachment = this.#attachment;
        if (!attachment || this.isDestroyed) return Promise.resolve(false);

        const {group, groupId, manager} = attachment,
              live                      = () => !this.isDestroyed && this.#attachment === attachment && manager.get(groupId) === group;

        this.#retirement = (async () => {
            const queue = group.queue;
            await queue;
            if (!live() || group.bindings.size || group.queue !== queue) return false;

            const result = await this.persistCurrent();
            if (!live() || group.bindings.size) return false;

            const latest    = attachment.capture(),
                  unchanged = !latest.errors.length && JSON.stringify(latest.topology) === JSON.stringify(result.topology);

            group.persistenceState = result.persisted && result.current && unchanged && !this.dirty ? 'headless-clean' : 'headless-dirty';
            group.provider?.setData({persistenceState: group.persistenceState});

            if (!result.persisted || !result.current || !unchanged || this.dirty || group.queue !== queue ||
                group.retainedReferences.size !== 1 || !group.retainedReferences.has(this)) return false;

            manager.releaseGroup(groupId, this);
            manager.retireGroup(groupId);
            manager.fire('groupRetired', {groupId});
            attachment.dispose();
            return true
        })().finally(() => {
            this.#retirement = null;
            if (live() && !group.bindings.size) {
                this.#clearRetry();
                this.#retryTimer = setTimeout(() => {
                    this.#retryTimer = null;
                    this.retireIfHeadless()
                }, attachment.retryDelayMs)
            }
        });

        return this.#retirement
    }

    /**
     * @summary Releases only this library's listener, retry and retained reference.
     */
    destroy() {
        this.#clearRetry();
        const attachment = this.#attachment;
        this.#attachment = null;
        if (attachment) {
            attachment.manager.un(attachment.listener);
            attachment.manager.releaseGroup(attachment.groupId, this)
        }
        super.destroy()
    }

    /**
     * @summary Whether the current collection differs from the last acknowledged storage version.
     * @returns {Boolean}
     */
    get dirty() {
        return this.#version !== this.#persistedVersion
    }

    /**
     * @summary The local adoption version; it is never added to the persisted schema.
     * @returns {Number}
     */
    get version() {
        return this.#version
    }

    /**
     * @summary Validates assignments before cloning; a refused candidate preserves the held document.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @returns {Object|null}
     * @protected
     */
    beforeSetCollection(value, oldValue) {
        const errors = value == null ? [] : Persistence.validateTopologyCollection(value);

        this.lastErrors = errors;

        return errors.length ? oldValue ?? null : value == null ? null : WorkspaceDocument.clone(value)
    }

    /**
     * @summary Counts adopted changes; initializing an unobserved library is not a dirty write.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetCollection(value, oldValue) {
        if (oldValue !== undefined || value !== null) this.#version++
    }

    /**
     * @summary Public collection reads are isolated JSON.
     * @param {Object|null} value
     * @returns {Object|null}
     * @protected
     */
    beforeGetCollection(value) {
        return value === null ? null : WorkspaceDocument.clone(value)
    }

    /**
     * @summary Prepares an explicit or persisted active selection without adopting it.
     * @param {String} [layoutId] Omission uses the validated activeLayoutId, never the first key.
     * @returns {{collection: Object|null, topology: Object|null, version: Number, errors: String[]}}
     */
    prepareSelection(layoutId) {
        const collection = this.collection,
              version    = this.#version;

        if (collection && layoutId !== undefined) collection.activeLayoutId = layoutId;

        const {topology, errors} = Persistence.restoreActiveTopology(collection);

        return {collection: errors.length ? null : collection, topology, version, errors}
    }

    /**
     * @summary Resolves an isolated topology without changing the selection.
     * @param {String} [layoutId]
     * @returns {{topology: Object|null, errors: String[]}}
     */
    resolve(layoutId) {
        const {topology, errors} = this.prepareSelection(layoutId);

        return {topology, errors}
    }

    /**
     * @summary Adopts one complete candidate; an optional version fence rejects a stale preparation.
     * @param {Object} collection A complete topology collection, including its explicit active id.
     * @param {Object} [options={}]
     * @param {Number} [options.expectedVersion] The version returned by prepareSelection().
     * @returns {{adopted: Boolean, version: Number, errors: String[]}}
     */
    adoptCollection(collection, {expectedVersion} = {}) {
        const errors = this.isDestroyed
            ? ['topology library is destroyed']
            : expectedVersion !== undefined && expectedVersion !== this.#version
                ? ['topology collection changed after preparation']
                : Persistence.validateTopologyCollection(collection);

        if (errors.length) {
            if (!this.isDestroyed) this.lastErrors = errors;
            return {adopted: false, version: this.#version, errors}
        }

        this.collection = collection;
        return {adopted: true, version: this.#version, errors: []}
    }

    /**
     * @summary Stores one normalized record. Replacing an id and activating it are explicit choices.
     * A first save requires activate:true because a nonempty collection must name its active topology.
     * @param {Object} topology A neo.dock.topology.v1 record.
     * @param {Object} [options={}]
     * @param {Boolean} [options.replace=false] Permit replacement of this exact layoutId.
     * @param {Boolean} [options.activate=false] Select this record in the resulting collection.
     * @returns {{saved: Boolean, layoutId: String|null, collision: Object|null, errors: String[]}}
     */
    save(topology, {replace = false, activate = false} = {}) {
        const result = Persistence.restoreTopology(topology);

        if (result.errors.length) {
            this.lastErrors = result.errors;
            return {saved: false, layoutId: null, collision: null, errors: result.errors}
        }

        const record    = result.topology,
              layoutId  = record.layoutId,
              candidate = this.collection ?? Persistence.createTopologyCollection([], {activeLayoutId: null}).collection;

        if (Object.hasOwn(candidate.topologies, layoutId) && replace !== true) {
            const errors = [`topology "${layoutId}" already exists; replacement must be explicit`];

            this.lastErrors = errors;
            return {saved: false, layoutId, collision: {layoutId, title: candidate.topologies[layoutId].title}, errors}
        }

        candidate.topologies[layoutId] = record;
        if (activate === true) candidate.activeLayoutId = layoutId;

        const {adopted, errors} = this.adoptCollection(candidate);

        return {saved: adopted, layoutId, collision: null, errors}
    }

    /**
     * @summary Serializes storage operations without turning a failed operation into a poisoned tail.
     * @param {Function} operation
     * @returns {Promise<Object>}
     * @private
     */
    #enqueue(operation) {
        const result = this.#ioQueue.then(operation);

        this.#ioQueue = result.then(() => {}, () => {});
        return result
    }

    /**
     * @summary Hydrates only a validated collection. A late read cannot replace a newer local adoption.
     * Missing storage leaves the current state untouched; warm reuse should not call this method.
     * @returns {Promise<{hydrated: Boolean, errors: String[]}>}
     */
    async hydrate() {
        const version = this.#version,
              adapter = this.persistenceAdapter;

        if (typeof adapter?.read !== 'function') {
            return {hydrated: false, errors: ['no persistence adapter with a read() seam is configured']}
        }

        const read = adapter.read.bind(adapter);

        return this.#enqueue(async () => {
            if (this.isDestroyed) return {hydrated: false, errors: ['topology library is destroyed']};

            let payload;
            try {
                payload = await read()
            } catch (error) {
                const errors = [error?.message || 'the persistence adapter rejected the read'];
                if (!this.isDestroyed) this.lastErrors = errors;
                return {hydrated: false, errors}
            }

            if (payload == null) return {hydrated: false, errors: []};

            const {adopted, errors} = this.adoptCollection(payload, {expectedVersion: version});

            if (adopted) this.#persistedVersion = this.#version;
            return {hydrated: adopted, errors}
        })
    }

    /**
     * @summary Writes a validated snapshot in request order. persisted acknowledges that version;
     * current additionally proves it still matches the held collection. Failure never discards truth.
     * @returns {Promise<{persisted: Boolean, current: Boolean, version: Number, errors: String[]}>}
     */
    async persist() {
        const version = this.#version,
              adapter = this.persistenceAdapter,
              errors  = this.isDestroyed
                  ? ['topology library is destroyed']
                  : typeof adapter?.write !== 'function'
                      ? ['no persistence adapter with a write() seam is configured']
                      : Persistence.validateTopologyCollection(this._collection);

        if (errors.length) {
            if (!this.isDestroyed) this.lastErrors = errors;
            return {persisted: false, current: false, version, errors}
        }

        const snapshot = WorkspaceDocument.clone(this._collection),
              write    = adapter.write.bind(adapter);

        return this.#enqueue(async () => {
            if (this.isDestroyed) return {persisted: false, current: false, version, errors: ['topology library is destroyed']};

            try {
                await write(snapshot)
            } catch (error) {
                const errors = [error?.message || 'the persistence adapter rejected the write'];
                if (!this.isDestroyed) this.lastErrors = errors;
                return {persisted: false, current: false, version, errors}
            }

            if (this.isDestroyed) return {persisted: true, current: false, version, errors: []};

            this.#persistedVersion = version;
            this.lastErrors = [];
            return {persisted: true, current: version === this.#version, version, errors: []}
        })
    }
}

export default Neo.setupClass(TopologyLibrary);
