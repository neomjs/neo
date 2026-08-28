import Base        from '../../../core/Base.mjs';
import Document    from '../model/Document.mjs';
import Persistence from '../model/Persistence.mjs';
import Observable  from '../../../core/Observable.mjs';

// Prototype-shaped keys are rejected at the write boundary: `layouts[key]` assignment with
// '__proto__' mutates the object's prototype instead of adding a record, and inherited
// function keys ('constructor') satisfy truthy lookups with garbage. Fail closed at entry —
// no read-side special-casing can stay complete.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * @summary The named perspective store: CRUD + list + lifecycle over ONE `dockLayoutCollection.v1`
 * document — the home that turns captured perspectives from one-shot values into named, durable,
 * switchable state.
 *
 * The store deliberately introduces NO new persisted shape (the docking ADR's anti-anchor): it
 * operates on the landed collection schema through the model tier validators and constructors (Document, Persistence),
 * and every read or write crosses its boundary as plain JSON clones — no live component refs, no
 * functions, no window state can enter or leave (guardrail-specced). Mutations are atomic and
 * fail closed: the CANDIDATE collection validates as a whole before it replaces the current one,
 * so a rejected operation leaves the store byte-identical.
 *
 * Contracts (binding):
 *
 * - **Public reads are isolated.** The `collection` getter hands out a deep clone — no caller
 *   can reach the held document, so state changes only ever enter through the atomic commit
 *   seam (whole-candidate validation + lifecycle events). `persist()` additionally revalidates
 *   before writing: bytes that do not validate never reach the adapter as `persisted: true`.
 * - **Name collision is a USER decision, never silent.** `savePerspective` against an existing
 *   name returns a structured `collision` verdict (who holds the name, under which layoutId) and
 *   saves nothing unless the caller explicitly passes `replace: true`. `renamePerspective(from,
 *   to, {replace})` obeys the same rule with the same atomic retire-the-holder semantics.
 * - **One namespace, both keys reachable.** `perspectiveName` and `layoutId` share one
 *   resolution namespace: a save whose layoutId an OTHER record's perspectiveName would shadow
 *   (or vice versa) is a collision, so every stored record stays addressable through both
 *   documented paths. Prototype-shaped keys (`__proto__`, `constructor`, `prototype`) are
 *   rejected at the write boundary.
 * - **Removing the active perspective repoints, never dangles.** With siblings present the
 *   successor is the caller's `replacementName` or the first remaining record (insertion
 *   order), reusing the landed `removeSavedLayout` invariant; removing the last record clears
 *   `activeLayoutId` to null.
 * - **Loads migrate honestly.** `loadPerspective` runs the stored record through the landed
 *   `restoreSavedLayout` seam — legacy v1 records gain the perspective fields with honest
 *   defaults, invalid records fail closed with the validator's own errors, and the MIGRATED
 *   record is what the store hands back (and re-commits, so the collection converges forward).
 * - **Persistence is a caller-injected seam.** The optional `persistenceAdapter`
 *   (`{read(): Promise<Object|null>, write(collection): Promise}`) keeps storage tech app-side
 *   (LocalStorage, files, remote) — the store guarantees only that plain validated JSON crosses
 *   it, in both directions.
 * - **Names resolve against `perspectiveName` first, `layoutId` second** — the product-facing
 *   key wins; the technical key stays addressable.
 *
 * Lifecycle events for UI binding (the switcher consumes these): `perspectiveSaved`,
 * `perspectiveLoaded`, `perspectiveRemoved`, `perspectiveRenamed`, `collectionChange` — each
 * fires AFTER the atomic commit, carrying plain-JSON payloads only.
 *
 * @class Neo.dashboard.dock.persistence.PerspectiveLibrary
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 * @see Neo.dashboard.dock.model.Document
 * @see Neo.dashboard.dock.model.Persistence
 * @see learn/agentos/DockZoneModel.md
 */
class PerspectiveLibrary extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.persistence.PerspectiveLibrary'
         * @protected
         */
        className: 'Neo.dashboard.dock.persistence.PerspectiveLibrary',
        /**
         * @member {String} ntype='dock-perspective-store'
         * @protected
         */
        ntype: 'dock-perspective-store',
        /**
         * @member {Array} mixins=[Observable]
         */
        mixins: [Observable],
        /**
         * The managed `dockLayoutCollection.v1` document. Assignments validate as a whole and
         * FAIL CLOSED: an invalid candidate is rejected (the previous collection stays) with the
         * validator errors surfaced on {@link #lastErrors}.
         * @member {Object|null} collection_=null
         * @reactive
         */
        collection_: null,
        /**
         * Optional storage seam: `{read(): Promise<Object|null>, write(collection): Promise}`.
         * The store passes plain validated JSON clones through it — never live references. A
         * non-reactive config: the adapter is wiring, not state.
         * @member {Object|null} persistenceAdapter=null
         */
        persistenceAdapter: null
    }
    /**
     * The saved layout collection schema for named layout perspectives. The collection envelope
     * stays v1: its `layouts` values migrate individually at restore time.
     * @member {String} LAYOUT_COLLECTION_SCHEMA='neo.harness.dockLayoutCollection.v1'
     * @static
     */
    static LAYOUT_COLLECTION_SCHEMA = 'neo.harness.dockLayoutCollection.v1'

    /**
     * Top-level fields allowed in a named saved-layout collection.
     * @member {Set<String>} savedLayoutCollectionKeys
     * @protected
     * @static
     */
    static savedLayoutCollectionKeys = new Set(['schema', 'activeLayoutId', 'layouts', 'metadata', 'revision'])

    /**
     * @summary Validates a named saved-layout collection and each contained saved-layout wrapper.
     * @param {Object} collection
     * @returns {String[]} the (possibly empty) list of invariant violations
     * @static
     */
    static validateSavedLayoutCollection(collection) {
        let errors = [];

        if (!Document.isJsonRecord(collection)) {
            return ['saved layout collection must be a JSON object']
        }

        if (collection.schema !== PerspectiveLibrary.LAYOUT_COLLECTION_SCHEMA) {
            errors.push(`schema must be ${PerspectiveLibrary.LAYOUT_COLLECTION_SCHEMA}`)
        }

        if (!Object.hasOwn(collection, 'activeLayoutId')) {
            errors.push('activeLayoutId is required')
        } else if (collection.activeLayoutId !== null && (typeof collection.activeLayoutId !== 'string' || !collection.activeLayoutId.trim())) {
            errors.push('activeLayoutId must be a non-empty string or null')
        }

        if (!Document.isJsonRecord(collection.layouts)) {
            errors.push('layouts must be a JSON object')
        }

        if (Object.hasOwn(collection, 'metadata') && !Document.isJsonRecord(collection.metadata)) {
            errors.push('metadata must be a JSON object')
        }

        let secretKey = Object.hasOwn(collection, 'metadata')
            ? Document.findSecretMetadataKey(collection.metadata, 'layoutCollection.metadata')
            : null;

        if (secretKey) {
            errors.push(`layout collection metadata contains secret-like field "${secretKey.key}" at ${secretKey.path}: ${secretKey.reason}`)
        }

        let unexpectedKey = Document.findUnexpectedKey(collection, PerspectiveLibrary.savedLayoutCollectionKeys, 'layoutCollection');

        if (unexpectedKey) {
            errors.push(`layout collection contains unexpected field "${unexpectedKey.key}" at ${unexpectedKey.path}: ${unexpectedKey.reason}`)
        }

        let nonJson = Document.findNonJsonValue(collection, 'layoutCollection');

        if (nonJson) {
            errors.push(`layout collection ${nonJson.path} is not JSON-only: ${nonJson.reason}`)
        }

        if (Document.isJsonRecord(collection.layouts)) {
            for (const [layoutId, savedLayout] of Object.entries(collection.layouts)) {
                if (!layoutId.trim()) {
                    errors.push('layout keys must be non-empty strings');
                    continue
                }

                if (!Document.isJsonRecord(savedLayout)) {
                    errors.push(`layout "${layoutId}" must be a JSON object`);
                    continue
                }

                if (savedLayout.layoutId !== layoutId) {
                    errors.push(`layout key "${layoutId}" must match saved layout id "${savedLayout.layoutId}"`)
                }

                let restored = Persistence.restoreSavedLayout(savedLayout);

                if (restored.errors.length) {
                    errors.push(...restored.errors.map(error => `layout "${layoutId}": ${error}`))
                }
            }
        }

        let layoutCount = Document.isJsonRecord(collection.layouts) ? Object.keys(collection.layouts).length : 0;

        if (collection.activeLayoutId === null && layoutCount > 0) {
            errors.push('activeLayoutId must name an existing layout when layouts are present')
        } else if (typeof collection.activeLayoutId === 'string' && Document.isJsonRecord(collection.layouts) && !Object.hasOwn(collection.layouts, collection.activeLayoutId)) {
            errors.push(`activeLayoutId "${collection.activeLayoutId}" does not exist`)
        }

        return errors
    }

    /**
     * @summary Creates a storage-free collection of named saved-layout wrappers.
     * @param {Array<Object>|Object<String,Object>} [layouts=[]]
     * @param {Object} [options={}] {activeLayoutId, metadata, revision}
     * @returns {{collection:(Object|null), errors:String[]}}
     * @static
     */
    static createSavedLayoutCollection(layouts=[], options={}) {
        if (!Array.isArray(layouts) && !Document.isJsonRecord(layouts)) {
            return {collection: null, errors: ['layouts must be an array or JSON object']}
        }

        if (!Document.isJsonRecord(options)) {
            return {collection: null, errors: ['options must be a JSON object']}
        }

        let collection = {
                schema        : PerspectiveLibrary.LAYOUT_COLLECTION_SCHEMA,
                activeLayoutId: Object.hasOwn(options, 'activeLayoutId') ? options.activeLayoutId : null,
                layouts       : {},
                metadata      : Object.hasOwn(options, 'metadata') ? options.metadata : {}
            },
            entries    = Array.isArray(layouts)
                ? layouts.map((layout, index) => [Document.isJsonRecord(layout) ? layout.layoutId : `index-${index}`, layout])
                : Object.entries(layouts),
            errors     = [];

        for (const [layoutId, savedLayout] of entries) {
            if (typeof layoutId !== 'string' || !layoutId.trim()) {
                errors.push('layoutId must be a non-empty string');
                continue
            }

            collection.layouts[layoutId] = Document.clone(savedLayout)
        }

        if (!Object.hasOwn(options, 'activeLayoutId')) {
            collection.activeLayoutId = Object.keys(collection.layouts)[0] ?? null
        }

        if (Object.hasOwn(options, 'revision')) {
            collection.revision = options.revision
        }

        errors.push(...PerspectiveLibrary.validateSavedLayoutCollection(collection));

        return errors.length
            ? {collection: null, errors}
            : {collection: Document.clone(collection), errors: []}
    }

    /**
     * @summary Adds or replaces a saved-layout wrapper in a collection.
     * @param {Object} collection
     * @param {Object} savedLayout
     * @param {Object} [options={}] {activate}
     * @returns {{collection:Object, errors:String[]}}
     * @static
     */
    static upsertSavedLayout(collection, savedLayout, options={}) {
        let errors = PerspectiveLibrary.validateSavedLayoutCollection(collection);

        if (errors.length) {
            return {collection, errors}
        }

        let restored = Persistence.restoreSavedLayout(savedLayout);

        if (restored.errors.length) {
            return {collection, errors: restored.errors}
        }

        let doc      = Document.clone(collection),
            layoutId = savedLayout.layoutId;

        doc.layouts[layoutId] = Document.clone(savedLayout);

        if (options?.activate === true || doc.activeLayoutId === null) {
            doc.activeLayoutId = layoutId
        }

        errors = PerspectiveLibrary.validateSavedLayoutCollection(doc);

        return errors.length ? {collection, errors} : {collection: Document.clone(doc), errors: []}
    }

    /**
     * @summary Selects the active saved layout by id without restoring it.
     * @param {Object} collection
     * @param {String} layoutId
     * @returns {{collection:Object, errors:String[]}}
     * @static
     */
    static selectSavedLayout(collection, layoutId) {
        let errors = PerspectiveLibrary.validateSavedLayoutCollection(collection);

        if (errors.length) {
            return {collection, errors}
        }

        if (typeof layoutId !== 'string' || !layoutId.trim()) {
            return {collection, errors: ['layoutId must be a non-empty string']}
        }

        if (!Object.hasOwn(collection.layouts, layoutId)) {
            return {collection, errors: [`layoutId "${layoutId}" does not exist`]}
        }

        let doc = Document.clone(collection);

        doc.activeLayoutId = layoutId;

        return {collection: Document.clone(doc), errors: []}
    }

    /**
     * @summary Removes a saved layout and requires an explicit replacement when removing the active one.
     * @param {Object} collection
     * @param {Object} args {layoutId, replacementLayoutId}
     * @returns {{collection:Object, errors:String[]}}
     * @static
     */
    static removeSavedLayout(collection, {layoutId, replacementLayoutId} = {}) {
        let errors = PerspectiveLibrary.validateSavedLayoutCollection(collection);

        if (errors.length) {
            return {collection, errors}
        }

        if (typeof layoutId !== 'string' || !layoutId.trim()) {
            return {collection, errors: ['layoutId must be a non-empty string']}
        }

        if (!Object.hasOwn(collection.layouts, layoutId)) {
            return {collection, errors: [`layoutId "${layoutId}" does not exist`]}
        }

        let removingActive = collection.activeLayoutId === layoutId;

        if (removingActive) {
            if (typeof replacementLayoutId !== 'string' || !replacementLayoutId.trim()) {
                return {collection, errors: ['removing the active layout requires replacementLayoutId']}
            }

            if (replacementLayoutId === layoutId) {
                return {collection, errors: ['replacementLayoutId must differ from the removed layoutId']}
            }

            if (!Object.hasOwn(collection.layouts, replacementLayoutId)) {
                return {collection, errors: [`replacementLayoutId "${replacementLayoutId}" does not exist`]}
            }
        }

        let doc = Document.clone(collection);

        delete doc.layouts[layoutId];

        if (removingActive) {
            doc.activeLayoutId = replacementLayoutId
        }

        errors = PerspectiveLibrary.validateSavedLayoutCollection(doc);

        return errors.length ? {collection, errors} : {collection: Document.clone(doc), errors: []}
    }

    /**
     * @summary Restores the active saved-layout wrapper from a named layout collection.
     * @param {Object} collection
     * @returns {{document:(Object|null), errors:String[]}}
     * @static
     */
    static restoreActiveSavedLayout(collection) {
        let errors = PerspectiveLibrary.validateSavedLayoutCollection(collection);

        if (errors.length) {
            return {document: null, errors}
        }

        if (typeof collection.activeLayoutId !== 'string' || !Object.hasOwn(collection.layouts, collection.activeLayoutId)) {
            return {document: null, errors: ['activeLayoutId must name an existing layout']}
        }

        return Persistence.restoreSavedLayout(collection.layouts[collection.activeLayoutId])
    }


    /**
     * Validator errors of the most recent rejected operation or assignment — empty after every
     * successful commit. Plain runtime state for UI binding; never persisted.
     * @member {String[]} lastErrors=[]
     */
    lastErrors = []

    /**
     * Fail-closed whole-collection validation on every assignment: `null` stays allowed (an
     * empty store); anything else must validate as a `dockLayoutCollection.v1` or the previous
     * value survives.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @returns {Object|null}
     * @protected
     */
    beforeSetCollection(value, oldValue) {
        if (value === null || value === undefined) {
            this.lastErrors = [];
            return null
        }

        let errors = PerspectiveLibrary.validateSavedLayoutCollection(value);

        if (errors.length) {
            this.lastErrors = errors;
            return oldValue ?? null
        }

        this.lastErrors = [];
        return Document.clone(value)
    }

    /**
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetCollection(value, oldValue) {
        oldValue !== undefined && this.fire('collectionChange', {collection: Document.clone(value)})
    }

    /**
     * Public reads are isolated: the getter hands out a deep clone, so no caller can mutate the
     * held document behind the commit seam (no validation bypass, no silent event-less state).
     * Internal code reads the raw `_collection` backing field on purpose.
     * @param {Object|null} value
     * @returns {Object|null}
     * @protected
     */
    beforeGetCollection(value) {
        return value ? Document.clone(value) : value
    }

    /**
     * Resolves a perspective entry by product name first (`perspectiveName`), technical id
     * second (`layoutId`) — own-property lookup only, so inherited keys can never satisfy the
     * id path.
     * @param {String} name
     * @returns {{layoutId: String, layout: Object}|null}
     * @protected
     */
    resolveEntry(name) {
        let layouts = this._collection?.layouts || {};

        for (const [layoutId, layout] of Object.entries(layouts)) {
            if (layout?.perspectiveName === name) return {layout, layoutId}
        }

        return Object.hasOwn(layouts, name) ? {layout: layouts[name], layoutId: name} : null
    }

    /**
     * @param {String} name
     * @returns {Boolean}
     */
    exists(name) {
        return !!this.resolveEntry(name)
    }

    /**
     * Read-only record resolve by name — the inspection seam for scope-honest consumers (the
     * Neural Link restore tool reads the record's `captureScope` through this BEFORE any state
     * moves). Same resolution rule as every other verb (`perspectiveName` first, `layoutId`
     * second), returns a clone, advances nothing: no `activeLayoutId` movement, no migration
     * commit, no lifecycle event — the read-path twin of {@link #loadPerspective}.
     * @param {String} name
     * @returns {{layoutId: String, layout: Object}|null}
     */
    getPerspective(name) {
        let entry = this.resolveEntry(name);

        return entry ? {layout: Document.clone(entry.layout), layoutId: entry.layoutId} : null
    }

    /**
     * Plain-JSON summaries of every stored perspective, in insertion order — the switcher's
     * list model. Never exposes the records themselves.
     * @returns {Object[]} `[{layoutId, title, perspectiveName, captureScope, revision}]`
     */
    list() {
        return Object.entries(this._collection?.layouts || {}).map(([layoutId, layout]) => ({
            captureScope   : layout?.captureScope ?? null,
            layoutId,
            perspectiveName: layout?.perspectiveName ?? null,
            revision       : layout?.revision ?? null,
            title          : layout?.title ?? null
        }))
    }

    /**
     * Saves one v2 saved-layout record under its name. The record must validate through the
     * landed restore seam (which also migrates legacy inputs forward). An existing holder of the
     * name (or layoutId) yields the structured collision verdict — nothing saves unless the
     * caller decides with `replace: true`.
     * @param {Object} layout A `dockLayout.v1` saved-layout record.
     * @param {Object} [options={}]
     * @param {Boolean} [options.replace=false] The caller's explicit collision decision.
     * @param {Boolean} [options.activate=true] Point `activeLayoutId` at the saved record.
     * @returns {{saved: Boolean, layoutId: String|null, collision: Object|null, errors: String[]}}
     */
    savePerspective(layout, {replace = false, activate = true} = {}) {
        let me        = this,
            validated = Persistence.restoreSavedLayout(layout);

        if (validated.errors.length) {
            me.lastErrors = validated.errors;
            return {collision: null, errors: validated.errors, layoutId: null, saved: false}
        }

        let record = Document.clone(layout),
            unsafe = [record.layoutId, record.perspectiveName].filter(key => UNSAFE_KEYS.has(key));

        if (unsafe.length) {
            let errors = unsafe.map(key => `"${key}" is not a usable perspective key`);
            me.lastErrors = errors;
            return {collision: null, errors, layoutId: null, saved: false}
        }

        let name     = record.perspectiveName ?? record.layoutId,
            existing = me.resolveEntry(name),
            // the technical id must STAY reachable after the save: another record's
            // perspectiveName shadowing the incoming layoutId would win the name-first scan
            // and make this record unaddressable by id — same collision, other namespace
            shadow   = name === record.layoutId ? null : me.resolveEntry(record.layoutId);

        shadow?.layoutId === record.layoutId && (shadow = null);

        // Collision means a DIFFERENT record holds the name (or shadows the id) — re-saving
        // your own layoutId under its own name is the normal update flow, not a name dispute.
        for (const dispute of [existing, shadow]) {
            if (dispute && dispute.layoutId !== record.layoutId && !replace) {
                return {
                    collision: {
                        holderLayoutId: dispute.layoutId,
                        holderTitle   : dispute.layout?.title ?? null,
                        name          : dispute === existing ? name : record.layoutId
                    },
                    errors  : [],
                    layoutId: null,
                    saved   : false
                }
            }
        }

        let base      = me._collection ?? PerspectiveLibrary.createSavedLayoutCollection([], {}).collection,
            candidate = Document.clone(base);

        // an explicit replace retires every previous holder — one name, one record, never two
        // entries answering to it (in either namespace)
        for (const dispute of [existing, shadow]) {
            if (dispute && dispute.layoutId !== record.layoutId) {
                delete candidate.layouts[dispute.layoutId]
            }
        }

        candidate.layouts[record.layoutId] = record;

        // a retired holder may have been the active record: the replacement inherits activeness
        // rather than leaving the pointer dangling (the whole-candidate validator would reject)
        if (candidate.activeLayoutId !== null && !Object.hasOwn(candidate.layouts, candidate.activeLayoutId)) {
            candidate.activeLayoutId = record.layoutId
        }

        activate && (candidate.activeLayoutId = record.layoutId);

        return me.commit(candidate, 'perspectiveSaved', {layoutId: record.layoutId, name}) ?
            {collision: null, errors: [], layoutId: record.layoutId, saved: true} :
            {collision: null, errors: me.lastErrors, layoutId: null, saved: false}
    }

    /**
     * Loads a stored perspective by name: the record runs the landed restore seam (validation +
     * honest v1→v2 migration), the MIGRATED record re-commits so the collection converges
     * forward, and both the record and its restored primary document return to the caller.
     * @param {String} name
     * @returns {{layout: Object|null, document: Object|null, errors: String[]}}
     */
    loadPerspective(name) {
        let me    = this,
            entry = me.resolveEntry(name);

        if (!entry) {
            return {document: null, errors: [`no perspective named "${name}"`], layout: null}
        }

        let restored = Persistence.restoreSavedLayout(entry.layout);

        if (restored.errors.length) {
            me.lastErrors = restored.errors;
            return {document: null, errors: restored.errors, layout: null}
        }

        let migrated  = Persistence.migrateSavedLayout(Document.clone(entry.layout)),
            candidate = Document.clone(me._collection);

        candidate.layouts[entry.layoutId] = migrated;
        candidate.activeLayoutId          = entry.layoutId;

        if (!me.commit(candidate, 'perspectiveLoaded', {layoutId: entry.layoutId, name})) {
            return {document: null, errors: me.lastErrors, layout: null}
        }

        return {document: restored.document, errors: [], layout: Document.clone(migrated)}
    }

    /**
     * Renames a stored perspective — collision-explicit like `savePerspective`, with the same
     * atomic decision path: an existing holder of the target name blocks the rename with the
     * structured verdict, and `replace: true` retires that holder and renames in ONE commit.
     * @param {String} from
     * @param {String} to
     * @param {Object} [options={}]
     * @param {Boolean} [options.replace=false] The caller's explicit collision decision.
     * @returns {{renamed: Boolean, collision: Object|null, errors: String[]}}
     */
    renamePerspective(from, to, {replace = false} = {}) {
        let me    = this,
            entry = me.resolveEntry(from);

        if (!entry) {
            return {collision: null, errors: [`no perspective named "${from}"`], renamed: false}
        }

        if (typeof to !== 'string' || !to.trim()) {
            return {collision: null, errors: ['the new name must be a non-empty string'], renamed: false}
        }

        if (UNSAFE_KEYS.has(to)) {
            let errors = [`"${to}" is not a usable perspective key`];
            me.lastErrors = errors;
            return {collision: null, errors, renamed: false}
        }

        let holder = me.resolveEntry(to);

        holder?.layoutId === entry.layoutId && (holder = null);

        if (holder && !replace) {
            return {
                collision: {holderLayoutId: holder.layoutId, holderTitle: holder.layout?.title ?? null, name: to},
                errors   : [],
                renamed  : false
            }
        }

        let candidate = Document.clone(me._collection);

        if (holder) {
            delete candidate.layouts[holder.layoutId];

            // the retired holder may have been active: the renamed record inherits activeness
            // rather than leaving the pointer dangling
            if (candidate.activeLayoutId !== null && !Object.hasOwn(candidate.layouts, candidate.activeLayoutId)) {
                candidate.activeLayoutId = entry.layoutId
            }
        }

        candidate.layouts[entry.layoutId].perspectiveName = to;

        return me.commit(candidate, 'perspectiveRenamed', {from, layoutId: entry.layoutId, to}) ?
            {collision: null, errors: [], renamed: true} :
            {collision: null, errors: me.lastErrors, renamed: false}
    }

    /**
     * Removes a stored perspective by name — fail-closed on a missing name (a structured error,
     * never a silent no-op). Removing the ACTIVE record with siblings present repoints
     * `activeLayoutId` to the caller's `replacementName` or the first remaining record
     * (insertion order), through the landed `removeSavedLayout` invariant; removing the last
     * record clears it to null.
     * @param {String} name
     * @param {Object} [options={}]
     * @param {String} [options.replacementName] Explicit successor for the active pointer. Always
     * validated when provided (must name a remaining record) — never a silently ignored option;
     * consulted for repointing only when the removed record was active.
     * @returns {{removed: Boolean, errors: String[]}}
     */
    removePerspective(name, {replacementName} = {}) {
        let me    = this,
            entry = me.resolveEntry(name);

        if (!entry) {
            return {errors: [`no perspective named "${name}"`], removed: false}
        }

        let layouts        = me._collection.layouts,
            removingActive = me._collection.activeLayoutId === entry.layoutId,
            siblings       = Object.keys(layouts).filter(layoutId => layoutId !== entry.layoutId),
            successorId    = null;

        // a provided successor validates unconditionally (never a silently ignored option),
        // even when the removal would not need one
        if (replacementName !== undefined) {
            let successor = me.resolveEntry(replacementName);

            if (!successor || successor.layoutId === entry.layoutId) {
                return {errors: [`no remaining perspective named "${replacementName}" to activate`], removed: false}
            }

            successorId = successor.layoutId
        }

        if (removingActive && siblings.length) {
            let replacementLayoutId = successorId ?? siblings[0],
                result              = PerspectiveLibrary.removeSavedLayout(me._collection, {layoutId: entry.layoutId, replacementLayoutId});

            if (result.errors.length) {
                me.lastErrors = result.errors;
                return {errors: result.errors, removed: false}
            }

            return me.commit(result.collection, 'perspectiveRemoved', {layoutId: entry.layoutId, name}) ?
                {errors: [], removed: true} :
                {errors: me.lastErrors, removed: false}
        }

        let candidate = Document.clone(me._collection);

        delete candidate.layouts[entry.layoutId];

        if (candidate.activeLayoutId === entry.layoutId) {
            candidate.activeLayoutId = null
        }

        return me.commit(candidate, 'perspectiveRemoved', {layoutId: entry.layoutId, name}) ?
            {errors: [], removed: true} :
            {errors: me.lastErrors, removed: false}
    }

    /**
     * Writes the current collection through the injected adapter as a plain validated clone.
     * Fail-closed without an adapter or a collection — and REVALIDATED at the boundary: bytes
     * that do not validate as a collection never reach the adapter, so `persisted: true` is a
     * validity claim, not just an I/O result.
     * @returns {Promise<{persisted: Boolean, errors: String[]}>}
     */
    async persist() {
        let me = this;

        if (typeof me.persistenceAdapter?.write !== 'function') {
            return {errors: ['no persistence adapter with a write() seam is configured'], persisted: false}
        }

        if (!me._collection) {
            return {errors: ['nothing to persist: the store holds no collection'], persisted: false}
        }

        let errors = PerspectiveLibrary.validateSavedLayoutCollection(me._collection);

        if (errors.length) {
            me.lastErrors = errors;
            return {errors, persisted: false}
        }

        try {
            await me.persistenceAdapter.write(Document.clone(me._collection));
            return {errors: [], persisted: true}
        } catch (error) {
            return {errors: [error?.message || 'the persistence adapter rejected the write'], persisted: false}
        }
    }

    /**
     * Reads a collection through the injected adapter and adopts it ONLY when it validates —
     * a corrupt payload leaves the store untouched with the validator errors returned.
     * @returns {Promise<{hydrated: Boolean, errors: String[]}>}
     */
    async hydrate() {
        let me = this;

        if (typeof me.persistenceAdapter?.read !== 'function') {
            return {errors: ['no persistence adapter with a read() seam is configured'], hydrated: false}
        }

        let payload;

        try {
            payload = await me.persistenceAdapter.read()
        } catch (error) {
            return {errors: [error?.message || 'the persistence adapter rejected the read'], hydrated: false}
        }

        if (payload === null || payload === undefined) {
            return {errors: [], hydrated: false}
        }

        let errors = PerspectiveLibrary.validateSavedLayoutCollection(payload);

        if (errors.length) {
            me.lastErrors = errors;
            return {errors, hydrated: false}
        }

        me.collection = payload;
        return {errors: [], hydrated: true}
    }

    /**
     * The single atomic commit seam every mutation funnels through: whole-candidate validation,
     * fail-closed rejection, then the lifecycle event AFTER the new collection is live.
     * @param {Object} candidate The next collection document.
     * @param {String} eventName Lifecycle event to fire on success.
     * @param {Object} payload Plain-JSON event payload.
     * @returns {Boolean} committed
     * @protected
     */
    commit(candidate, eventName, payload) {
        let me     = this,
            errors = PerspectiveLibrary.validateSavedLayoutCollection(candidate);

        if (errors.length) {
            me.lastErrors = errors;
            return false
        }

        me.collection = candidate;
        me.fire(eventName, payload);
        return true
    }
}

export default Neo.setupClass(PerspectiveLibrary);
