import Base             from '../../../core/Base.mjs';
import Authoring        from '../model/Authoring.mjs';
import Document         from '../model/WorkspaceDocument.mjs';
import PerspectiveState from '../projection/PerspectiveState.mjs';

/**
 * @summary Owns captured perspective declarations and the lifetime of one Workspace's selection requests.
 * A Group retains identity as an auxiliary participant in the document's atomic write.
 * Projection synchronizes the public config without restoring again; pending newer intent survives.
 * Documents remain with the Workspace and its Group. This owner imports no transaction machinery.
 * @class Neo.dashboard.dock.interaction.PerspectiveSelection
 * @extends Neo.core.Base
 */
class PerspectiveSelection extends Base {
    static config = {
        /** @member {String} className='Neo.dashboard.dock.interaction.PerspectiveSelection' */
        className: 'Neo.dashboard.dock.interaction.PerspectiveSelection',
        /** @member {Neo.dashboard.dock.Workspace|null} workspace=null The declaring host. */
        workspace: null
    }

    /** @member {Boolean} initialized=false Whether declarations have been captured. */
    initialized = false
    /** @member {String|null} publishedName=null Identity observed by the latest projection. */
    publishedName = null
    /** @member {String|null} pendingName=null Latest unresolved request, independent of projection. */
    pendingName = null
    /** @member {Promise} pending Settlement of the latest request. */
    pending = Promise.resolve({errors: []})
    /** @member {Map<String,Object>} #documents Captured lowered baselines. @private */
    #documents = new Map()
    /** @member {Number} #serial=0 Request generation. @private */
    #serial = 0
    /** @member {Boolean} #sync=false Suppresses restoration during public synchronization. @private */
    #sync = false
    /** @member {Boolean} #rejected=false Marks enum compensation rather than accepted intent. @private */
    #rejected = false
    /** @member {Object|null} #manager=null Borrowed Group authority. @private */
    #manager = null
    /** @member {String|null} #groupId=null Observed Group. @private */
    #groupId = null
    /** @member {String|null} #directName=null Identity for the standalone document path. @private */
    #directName = null
    /** @member {Object|null} #entry=null Group-owned identity participant. @private */
    #entry = null
    /** @member {Promise|null} #registration=null Queue-ordered identity registration. @private */
    #registration = null

    /** @summary Reads semantic identity independently of observer delivery. @member {String|null} committedName */
    get committedName() { return this.#entry?.capture().value.name ?? this.#directName }

    /** @summary The declared names: what a saved record may equal but never take. @member {String[]} names */
    get names() { return [...this.#documents.keys()] }

    /**
     * @summary The origin a snapshot carries: the accepted-write identity, never a published leaf.
     * An auto-save captures before projection, and the identity participant adopts with the document.
     * @returns {{declaredPerspective: String}}
     */
    provenance() { return {declaredPerspective: this.committedName} }

    /**
     * @summary The identity change a Group write adopts beside a restored snapshot's document: its
     * declared origin when this workspace declares it, else nothing — an originless snapshot, or one
     * captured under a name this workspace does not declare, retains the last committed or
     * initialized declared baseline.
     * @param {Object|null} metadata The snapshot's `metadata`
     * @returns {{workspaceKey: String, input: {name: String}}|null}
     */
    originChange(metadata) {
        const name = metadata?.declaredPerspective;

        return this.#documents.has(name) ? {workspaceKey: this.identityKey(), input: {name}} : null
    }

    /** @summary Captures declarations after the host's complete construction chain. @returns {Object} Initial zones. */
    capture() {
        const host     = this.workspace, supplied = host.dockModel !== null,
              declared = host.perspectives === null
                  ? {[Authoring.defaultPerspectiveName]: host.zones ?? {type: 'edge-zone'}}
                  : Neo.clone(host.perspectives, true, true);
        if (!declared || typeof declared !== 'object' || Array.isArray(declared) || !Object.keys(declared).length) {
            throw new TypeError('perspectives must be a nonempty map of names to zones')
        }
        for (const [name, zones] of Object.entries(declared)) {
            if (!name.trim()) throw new TypeError('perspective names must not be empty');
            const result = supplied && host.perspectives === null
                ? {document: Document.clone(host.dockModel), errors: []}
                : Authoring.fromZones(host.panes ?? {}, zones);
            if (result.errors.length) throw new TypeError(`perspectives.${name}: ${result.errors.join('; ')}`);
            this.#documents.set(name, Document.clone(result.document))
        }
        const first = this.#documents.keys().next().value;
        let   name  = host.activePerspective ?? first;
        if (!this.#documents.has(name)) {
            console.error('Supported values for activePerspective are:', ...this.#documents.keys());
            name = first
        }
        this.#directName = this.publishedName = name;
        host.activePerspective = name;
        return declared[name]
    }

    /** @summary Reads a fresh copy of a captured baseline. @param {String} name @returns {Object|null} */
    document(name) { return this.#documents.has(name) ? Document.clone(this.#documents.get(name)) : null }

    /** @summary Refuses unknown names against the captured set. @param {String} value @returns {String} */
    accept(value) {
        this.#rejected = false;
        if (this.#documents.has(value)) return value;
        this.#rejected = true;
        console.error('Supported values for activePerspective are:', ...this.#documents.keys());
        return this.committedName
    }

    /** @summary A config write admits intent unless it is synchronization from accepted truth. @param {String} value */
    onIntent(value) {
        const rejected = this.#rejected;
        this.#rejected = false;
        if (!this.#sync && !rejected) this.restore(value)
    }

    /** @summary Resolves the host's document participant without owning a registry. @returns {String|undefined} */
    workspaceKey() {
        const host = this.workspace, set = host.workspaceSet;
        return host.workspaceKey ?? set?.ids().find(key => set.getParticipant(key)?.componentId === host.id)
    }

    /** @summary Attaches a registered document owner without admitting a selection write. @returns {void} */
    connect() {
        if (!this.initialized || !this.workspace.workspaceSet?.has(this.workspaceKey())) return;
        const pending = this.attachGroup().then(() => ({errors: []}), error => ({errors: [error.message]}));
        if (this.pendingName === null) this.pending = pending
    }

    /**
     * @summary Registers auxiliary identity on the Group queue without admitting a nested write.
     * A replacement retains a name it declares, otherwise captures its initialized baseline.
     * The live owner supplies validation; the Group retains identity independently of view lifetime.
     * @returns {Promise<void>}
     */
    attachGroup() {
        const host    = this.workspace, manager = host.workspaceSet?.manager ?? host.transactionManager ?? Neo.manager?.Transaction,
              groupId = host.topologyGroupId;
        if (this.#manager === manager && this.#groupId === groupId && this.#registration) return this.#registration;
        this.#directName = this.committedName;
        this.#entry = null;
        this.#manager = manager;
        this.#groupId = groupId;
        if (!groupId || !manager) return Promise.resolve();
        const group = manager.get(groupId), key = this.workspaceKey(), identityKey = this.identityKey();
        if (!group || !key) return Promise.reject(new Error('dock participant not registered'));
        this.#registration = manager.enqueue(group, () => {
            if (this.isDestroyed || host.isDestroyed) throw new Error('perspective workspace destroyed');
            const participant = manager.getParticipant(groupId, key);
            if (!participant || participant.componentId && participant.componentId !== host.id) {
                throw new Error('perspective workspace replaced')
            }
            let entry = manager.getParticipant(groupId, identityKey);
            if (entry && entry.perspectiveSelection !== true) throw new Error('perspective participant key already in use');
            if (!entry) {
                const state = {value: Object.freeze({name: this.#directName}), revision: 0};
                entry = {
                    domain : 'dock', perspectiveSelection: true,
                    capture: () => ({value: entry.owner && !entry.owner.#documents.has(state.value.name)
                        ? {name: entry.owner.#directName} : state.value, revision: state.revision,
                        generation: manager.getBinding(groupId, key)?.generation ?? 0}),
                    prepare: value => {
                        if (!value || !entry.owner?.#documents.has(value.name)) throw new Error('unknown declared perspective');
                        return {name: value.name}
                    },
                    adopt     : value => {state.value = value; state.revision++},
                    compensate: captured => {state.value = captured.value; state.revision = captured.revision}
                };
                if (!manager.registerParticipant({groupId, workspaceKey: identityKey, participant: entry})) {
                    throw new Error('perspective participant could not register')
                }
            }
            entry.owner = this;
            this.#entry = entry;
            this.publishedName = this.committedName;
            if (this.pendingName === null) this.sync(this.committedName);
            PerspectiveState.publishDocument(host, host.dockModel)
        }).catch(error => {
            this.#registration = null;
            throw error
        });
        return this.#registration
    }

    /** @summary Names this document's auxiliary identity slot. @returns {String} */
    identityKey() { return `$perspective:${this.workspaceKey()}` }

    /** @summary Reads selection metadata only for this participant. @param {Object} context @returns {String|null} */
    identity(context) {
        const replay = context.cursorAction === 'undo' || context.cursorAction === 'redo',
              entry  = replay ? context.replayRow ?? context.row : context.descriptor,
              name   = context.cursorAction === 'undo' ? entry?.before : entry?.after;
        if (entry?.operation === 'restorePerspective' && entry.workspaceKey === this.workspaceKey() && this.#documents.has(name)) return name;
        // A snapshot restore carries its declared origin in the descriptor. Under a Group the identity
        // participant adopted that origin with the document, so committedName already reads it.
        const origin = replay ? undefined : context.descriptor?.declaredPerspective;
        return this.#documents.has(origin) ? origin : null
    }

    /** @summary Public synchronization preserves Effects and two-way bindings. @param {String} name */
    sync(name) {
        if (this.isDestroyed || this.workspace.isDestroyed) return;
        this.#sync = true;
        try { this.workspace.activePerspective = name } finally { this.#sync = false }
    }

    /** @summary Projects carried identity without overwriting a newer pending request. @param {Object} context */
    project(context) {
        // Under a Group the adopted identity participant is the truth for every projection, so a
        // hydrate that changed it publishes, and one that did not retains the baseline.
        const name = this.identity(context) ?? (this.#entry ? this.committedName : null);
        if (name === null) return;
        if (!this.#entry) this.#directName = name;
        this.publishedName = name;
        if (this.pendingName === null || this.pendingName === name) this.sync(name)
    }

    /**
     * @summary Restores a captured document; foreign-owned panes refuse before any adoption.
     * The callback captures the before-name inside the existing Group queue. It admits no write itself.
     * @param {String} name
     * @returns {Promise<{document:Object,errors:String[]}>}
     */
    restore(name = this.committedName) {
        const host = this.workspace, document = this.document(name), serial = ++this.#serial;
        this.pendingName = name;
        PerspectiveState.publishPending(host, name);
        let pending;
        try {
            if (!document) throw new Error(`unknown declared perspective "${name}"`);
            const key = this.workspaceKey(), set = host.workspaceSet;
            if (set && host.topologyGroupId) {
                if (!key) throw new Error('dock participant not registered');
                pending = this.attachGroup().then(() => this.#manager.write({
                    groupId: host.topologyGroupId,
                    cause  : 'perspective',
                    changes: [{workspaceKey: key, input: document},
                        {workspaceKey: this.identityKey(), input: {name}}],
                    descriptor       : {operation: 'restorePerspective', workspaceKey: key, after: name},
                    prepareDescriptor: ({descriptor}) => {
                        if (this.isDestroyed || host.isDestroyed) throw new Error('perspective workspace destroyed');
                        if (this.#entry.owner !== this) throw new Error('perspective workspace replaced');
                        for (const sibling of set.ids().filter(id => id !== key)) {
                            if (Object.keys(set.getDocument(sibling)?.items ?? {}).some(id => Object.hasOwn(document.items, id))) {
                                throw new Error(`perspective restore would duplicate a pane owned by "${sibling}"`)
                            }
                        }
                        return {...descriptor, before: this.committedName}
                    }
                }))
            } else {
                pending = host.onDockZoneDocumentChange(document, {
                    operation: 'restorePerspective', workspaceKey: key,
                    before   : this.committedName, after: name
                }, host);
                this.#directName = name
            }
        } catch (error) { pending = Promise.reject(error) }
        this.pending = Promise.resolve(pending).then(() => {
            if (!this.isDestroyed && !host.isDestroyed && serial === this.#serial) {
                this.pendingName = null;
                PerspectiveState.publishPending(host, null);
                this.sync(this.committedName)
            }
            return {document: host.dockModel, errors: []}
        }, error => {
            if (!this.isDestroyed && !host.isDestroyed && serial === this.#serial) {
                this.pendingName = null;
                PerspectiveState.publishPending(host, null);
                this.sync(this.committedName)
            }
            return {document: host.dockModel, errors: [error.message]}
        });
        return this.pending
    }

    /** @summary Releases the view's reference; the Group retains its identity participant. @param {...*} args */
    destroy(...args) {
        if (this.#entry?.owner === this) this.#entry.owner = null;
        super.destroy(...args)
    }
}

export default Neo.setupClass(PerspectiveSelection);
