import Base          from '../core/Base.mjs';
import DockZoneModel from './DockZoneModel.mjs';
import Observable    from '../core/Observable.mjs';

/**
 * @summary The named perspective store: CRUD + list + lifecycle over ONE `dockLayoutCollection.v1`
 * document — the home that turns captured perspectives from one-shot values into named, durable,
 * switchable state.
 *
 * The store deliberately introduces NO new persisted shape (the docking ADR's anti-anchor): it
 * operates on the landed collection schema through `DockZoneModel`'s validators and constructors,
 * and every read or write crosses its boundary as plain JSON clones — no live component refs, no
 * functions, no window state can enter or leave (guardrail-specced). Mutations are atomic and
 * fail closed: the CANDIDATE collection validates as a whole before it replaces the current one,
 * so a rejected operation leaves the store byte-identical.
 *
 * Contracts (binding):
 *
 * - **Name collision is a USER decision, never silent.** `savePerspective` against an existing
 *   name returns a structured `collision` verdict (who holds the name, under which layoutId) and
 *   saves nothing unless the caller explicitly passes `replace: true`. `renamePerspective` obeys
 *   the same rule.
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
 * @class Neo.dashboard.DockPerspectiveStore
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 * @see Neo.dashboard.DockZoneModel
 * @see learn/agentos/HarnessDockZoneModel.md
 */
class DockPerspectiveStore extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockPerspectiveStore'
         * @protected
         */
        className: 'Neo.dashboard.DockPerspectiveStore',
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

        let errors = DockZoneModel.validateSavedLayoutCollection(value);

        if (errors.length) {
            this.lastErrors = errors;
            return oldValue ?? null
        }

        this.lastErrors = [];
        return DockZoneModel.clone(value)
    }

    /**
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetCollection(value, oldValue) {
        oldValue !== undefined && this.fire('collectionChange', {collection: DockZoneModel.clone(value)})
    }

    /**
     * Resolves a perspective entry by product name first (`perspectiveName`), technical id
     * second (`layoutId`).
     * @param {String} name
     * @returns {{layoutId: String, layout: Object}|null}
     * @protected
     */
    resolveEntry(name) {
        let layouts = this.collection?.layouts || {};

        for (const [layoutId, layout] of Object.entries(layouts)) {
            if (layout?.perspectiveName === name) return {layout, layoutId}
        }

        return layouts[name] ? {layout: layouts[name], layoutId: name} : null
    }

    /**
     * @param {String} name
     * @returns {Boolean}
     */
    exists(name) {
        return !!this.resolveEntry(name)
    }

    /**
     * Plain-JSON summaries of every stored perspective, in insertion order — the switcher's
     * list model. Never exposes the records themselves.
     * @returns {Object[]} `[{layoutId, title, perspectiveName, captureScope, revision}]`
     */
    list() {
        return Object.entries(this.collection?.layouts || {}).map(([layoutId, layout]) => ({
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
            validated = DockZoneModel.restoreSavedLayout(layout);

        if (validated.errors.length) {
            me.lastErrors = validated.errors;
            return {collision: null, errors: validated.errors, layoutId: null, saved: false}
        }

        let record   = DockZoneModel.clone(layout),
            name     = record.perspectiveName ?? record.layoutId,
            existing = me.resolveEntry(name);

        // Collision means a DIFFERENT record holds the name — re-saving your own layoutId under
        // its own name is the normal update flow, not a name dispute.
        if (existing && existing.layoutId !== record.layoutId && !replace) {
            return {
                collision: {holderLayoutId: existing.layoutId, holderTitle: existing.layout?.title ?? null, name},
                errors   : [],
                layoutId : null,
                saved    : false
            }
        }

        let base      = me.collection ?? DockZoneModel.createSavedLayoutCollection([], {}).collection,
            candidate = DockZoneModel.clone(base);

        // an explicit replace under a DIFFERENT layoutId retires the previous holder — one name,
        // one record, never two entries answering to it
        if (existing && existing.layoutId !== record.layoutId) {
            delete candidate.layouts[existing.layoutId]
        }

        candidate.layouts[record.layoutId] = record;
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

        let restored = DockZoneModel.restoreSavedLayout(entry.layout);

        if (restored.errors.length) {
            me.lastErrors = restored.errors;
            return {document: null, errors: restored.errors, layout: null}
        }

        let migrated  = DockZoneModel.migrateSavedLayout(DockZoneModel.clone(entry.layout)),
            candidate = DockZoneModel.clone(me.collection);

        candidate.layouts[entry.layoutId] = migrated;
        candidate.activeLayoutId          = entry.layoutId;

        if (!me.commit(candidate, 'perspectiveLoaded', {layoutId: entry.layoutId, name})) {
            return {document: null, errors: me.lastErrors, layout: null}
        }

        return {document: restored.document, errors: [], layout: DockZoneModel.clone(migrated)}
    }

    /**
     * Renames a stored perspective — collision-explicit like `savePerspective`: an existing
     * holder of the target name blocks the rename with the structured verdict.
     * @param {String} from
     * @param {String} to
     * @returns {{renamed: Boolean, collision: Object|null, errors: String[]}}
     */
    renamePerspective(from, to) {
        let me    = this,
            entry = me.resolveEntry(from);

        if (!entry) {
            return {collision: null, errors: [`no perspective named "${from}"`], renamed: false}
        }

        if (typeof to !== 'string' || !to.trim()) {
            return {collision: null, errors: ['the new name must be a non-empty string'], renamed: false}
        }

        let holder = me.resolveEntry(to);

        if (holder && holder.layoutId !== entry.layoutId) {
            return {
                collision: {holderLayoutId: holder.layoutId, holderTitle: holder.layout?.title ?? null, name: to},
                errors   : [],
                renamed  : false
            }
        }

        let candidate = DockZoneModel.clone(me.collection);

        candidate.layouts[entry.layoutId].perspectiveName = to;

        return me.commit(candidate, 'perspectiveRenamed', {from, layoutId: entry.layoutId, to}) ?
            {collision: null, errors: [], renamed: true} :
            {collision: null, errors: me.lastErrors, renamed: false}
    }

    /**
     * Removes a stored perspective by name — fail-closed on a missing name (a structured error,
     * never a silent no-op), and an `activeLayoutId` pointing at the removed record clears to
     * null rather than dangling.
     * @param {String} name
     * @returns {{removed: Boolean, errors: String[]}}
     */
    removePerspective(name) {
        let me    = this,
            entry = me.resolveEntry(name);

        if (!entry) {
            return {errors: [`no perspective named "${name}"`], removed: false}
        }

        let candidate = DockZoneModel.clone(me.collection);

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
     * Fail-closed without an adapter or a collection.
     * @returns {Promise<{persisted: Boolean, errors: String[]}>}
     */
    async persist() {
        let me = this;

        if (typeof me.persistenceAdapter?.write !== 'function') {
            return {errors: ['no persistence adapter with a write() seam is configured'], persisted: false}
        }

        if (!me.collection) {
            return {errors: ['nothing to persist: the store holds no collection'], persisted: false}
        }

        try {
            await me.persistenceAdapter.write(DockZoneModel.clone(me.collection));
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

        let errors = DockZoneModel.validateSavedLayoutCollection(payload);

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
            errors = DockZoneModel.validateSavedLayoutCollection(candidate);

        if (errors.length) {
            me.lastErrors = errors;
            return false
        }

        me.collection = candidate;
        me.fire(eventName, payload);
        return true
    }
}

export default Neo.setupClass(DockPerspectiveStore);
