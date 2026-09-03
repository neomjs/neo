import Base from './Base.mjs';

/**
 * Placeholders inside a payload template, in the two forms a declaration can name:
 * `{attribute-name}` resolves through `getAttribute()`, `{field:name}` through the registered
 * field map. The capture group tells them apart, so a template's meaning is fixed at parse time
 * rather than by what happens to be resolvable — and neither form ever runs consumer code, which
 * is what keeps the whole declaration JSON-safe.
 *
 * The field form cannot collide with an existing attribute template: `[\w-]+` never matched a
 * colon, so `{field:x}` was inert literal text before this form existed and no declaration can
 * have relied on it resolving.
 * @type {RegExp}
 */
const templateToken = /\{(field:)?([\w-]+)\}/g;

/**
 * The `body` class marking a native drag in flight, from `dragstart` to `dragend`. Frame shields
 * that key on other state — the dock rail reveal's in `dashboard/Container.scss` — lift while it is
 * present, so the drop can be hit-tested onto the frame it is aimed at.
 * @type {String}
 */
const nativeDragCls = 'neo-native-drag-active';

/**
 * @summary Declarative native HTML5 drag sources: `DataTransfer` filled from worker-declared config.
 *
 * The synthetic drag pipeline (DragDrop addon + the sensors) is right for the Neo world — records,
 * per-frame proxies, cross-window moves over one shared worker. It cannot carry a payload into
 * FOREIGN content: `DataTransfer` exists only synchronously inside a native `dragstart` on the main
 * thread, and pointer streams never enter another browsing context. Dragging an entity row into an
 * embedded editor iframe, another application, or the OS therefore needs a REAL native drag — and
 * before this addon, every consumer had to hand-roll a capture-phase main-thread addon to get one.
 *
 * ## The declaration travels as JSON, so no consumer code ever runs on main
 *
 * A component declares (see `Neo.component.Base#nativeDragZone`):
 *
 *     nativeDragZone: {
 *         delegate     : '.my-drag-source [data-record-id]',
 *         effectAllowed: 'copy',
 *         types        : {
 *             'application/x-entity-id': '{data-record-id}',
 *             'text/plain'             : 'entity:{data-record-id}'
 *         }
 *     }
 *
 * Payload values are **templates with two resolution sources**, and string substitution is the
 * entire main-thread execution surface for both:
 *
 * - `{data-record-id}` reads `node.getAttribute('data-record-id')` at `dragstart` time.
 * - `{field:name}` reads the registered field map, so a value that lives only in the app worker's
 *   store can reach the clipboard without first being written into the DOM.
 *
 * An unresolvable token yields `''` in either form — never the literal template text.
 *
 * ## Why the field map is pushed, and never fetched
 *
 * `DataTransfer` exists only synchronously inside a native `dragstart` on this thread, so there is
 * no moment at which the app worker can be asked anything. Attribute templates were the original
 * answer precisely because the DOM is the one authority already present. The field map keeps that
 * property by inverting the direction: the owning component sends `{nodeId: {field: value}}` with
 * the registration and refreshes it whenever its rows change, so resolution reads memory that was
 * already there before the gesture began. Anything that made `dragstart` await is the defect this
 * design exists to avoid.
 *
 * Node ids are the map's keys because a delegate node is what a gesture starts on. Pooled surfaces
 * recycle those ids across records as they scroll, which is exactly why the map is refreshed per
 * render rather than captured once at registration.
 *
 * ## The gesture lifecycle mirrors what a node needs, not what is convenient
 *
 * A node only fires `dragstart` while it carries `draggable` — but a STATIC attribute disables
 * text selection inside the node and changes touch behaviour. So the attribute exists per gesture:
 * armed on `mousedown` over a registered source (early enough — the browser decides drag-vs-select
 * on the first move after the press), removed on `dragend`/`mouseup`, leaving the DOM exactly as
 * the worker's vdom deltas expect between gestures.
 *
 * ## The partition with the synthetic pipeline is a contract, in both directions
 *
 * The two systems are mutually exclusive per gesture: once a sensor claims one, it installs a
 * document-level `dragstart` preventDefault, so a native drag there looks armed and is dead.
 *
 * **The registration is the partition line, and it is the only authority.** A gesture starting on
 * a registered source node is native — even under a `neo-draggable` ancestor — because
 * `sensor.Mouse#onMouseDown` consults {@link #claimsEvent} and declines those gestures. Everything
 * else, the sensor classes included, stays synthetic. One side owning the tiebreak is what makes
 * an overlap a defined state instead of a dead node: two mutually-deferring systems would both
 * decline it. Declined-by-sensor also means the synthetic pipeline's `dragstart` suppression is
 * never installed and `neo-drag-active` (the iframe shield's hook) is never stamped for a native
 * drag — load-bearing, since the shield makes iframes hit-test-inert and a native drag's whole
 * purpose is to LAND on one. What a native drag does stamp is `neo-native-drag-active` on `body`,
 * from `dragstart` to `dragend`: a frame shield keyed on something other than the gesture — the
 * dock rail reveal's — would otherwise hit-test the drop away from a frame that is not inside the
 * reveal, and the reveal's dismissal (a worker round trip) cannot win a race against `dragover`.
 *
 * @class Neo.main.addon.NativeDragSource
 * @extends Neo.main.addon.Base
 */
class NativeDragSource extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.NativeDragSource'
         * @protected
         */
        className: 'Neo.main.addon.NativeDragSource',
        /**
         * @member {Object} remote={app:[//...]}
         * @protected
         * @reactive
         */
        remote: {
            app: [
                'register',
                'unregister',
                'updateFields'
            ]
        }
    }

    /**
     * The node this addon armed for the current physical gesture, with its owning registration.
     * One at a time by construction: a pointer starts one gesture.
     * @member {Object|null} armed=null
     * @protected
     */
    armed = null

    /**
     * Registrations keyed by owner component id.
     * @member {Map<String,Object>} sources=new Map()
     * @protected
     */
    sources = new Map()

    /**
     * The bound document listeners, kept so {@link #destroy} can remove exactly what construct added.
     * @member {Object|null} listeners=null
     * @protected
     */
    listeners = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.listeners = {
            dragend  : me.onGestureEnd.bind(me),
            dragstart: me.onDragStart.bind(me),
            mousedown: me.onMouseDown.bind(me),
            mouseup  : me.onGestureEnd.bind(me)
        };

        // Capture phase throughout: grids and lists stop propagation of some of their own pointer
        // handling, and arming has to happen regardless. Nothing here cancels anything.
        Object.entries(me.listeners).forEach(([type, fn]) => document.addEventListener(type, fn, true))
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        Object.entries(this.listeners || {}).forEach(([type, fn]) => document.removeEventListener(type, fn, true));
        this.listeners = null;

        super.destroy(...args)
    }

    /**
     * Whether a registered native source claims this event's gesture — the sensor-side half of the
     * partition contract. Pure over the registrations and the event path, so the answer does not
     * depend on listener ordering between this addon and the sensors.
     * @param {MouseEvent} event
     * @returns {Boolean}
     */
    claimsEvent(event) {
        return !!this.sourceOf(event)
    }

    /**
     * The field values registered for one delegate node — the `{field:name}` resolution source.
     *
     * Reads BOTH DOM identity modes for the same reason {@link #sourceOf} resolves owners through
     * `DomAccess.getElement()`: `useDomIds: false` puts the node's id in `data-neo-id` and leaves
     * `id` empty, so keying on `node.id` alone would silently resolve nothing for half the
     * supported apps — and silently is how this whole class of defect hurts.
     *
     * Returns an empty object rather than null, so the caller's `?? ''` stays the single place a
     * missing value becomes the empty string.
     * @param {Object} registration
     * @param {HTMLElement} node
     * @returns {Object} field name -> value; empty when this node has no registered fields
     * @protected
     */
    fieldsFor(registration, node) {
        const nodeId = node.id || node.dataset?.neoId;

        return (nodeId && registration.fields?.[nodeId]) || {}
    }

    /**
     * Fills the drag data store. Only a drag this addon armed is answered: `mousedown` is where
     * every reason to stay out of a gesture gets decided, and a `dragstart` from any other
     * `draggable` node keeps whatever behaviour its owner gave it.
     * @param {DragEvent} event
     * @protected
     */
    onDragStart(event) {
        let {armed}        = this,
            {dataTransfer} = event,
            node, types;

        // Every native drag this document starts lifts the frame shields for its lifetime, armed by
        // this addon or not: `pointer-events: none` removes a frame as a drop target, and a drop has
        // to be able to land in an editor frame whichever node carried the payload. The rail reveal's
        // shield (`dashboard/Container.scss`) keys on this class; cleared in {@link #onGestureEnd}.
        document.body.classList.add(nativeDragCls);

        if (!armed || event.target !== armed.node || !dataTransfer) {
            return
        }

        ({node} = armed);
        types   = armed.registration.types || {};

        const fields = this.fieldsFor(armed.registration, node);

        Object.entries(types).forEach(([type, template]) => {
            dataTransfer.setData(type, template.replace(templateToken,
                (match, isField, name) => (isField ? fields[name] : node.getAttribute(name)) ?? ''))
        });

        dataTransfer.effectAllowed = armed.registration.effectAllowed || 'copy'
    }

    /**
     * Disarms the current gesture's node. `mouseup` covers the never-became-a-drag press;
     * `dragend` covers the real drag — the browser suppresses `mouseup` during one.
     * @protected
     */
    onGestureEnd() {
        let {armed} = this;

        document.body.classList.remove(nativeDragCls);

        if (armed) {
            // restore only addon-owned DOM state: a node that was draggable before stays draggable
            armed.addedAttribute && armed.node.removeAttribute('draggable');
            this.armed = null
        }
    }

    /**
     * Arms a registered source node for the starting gesture, unless the synthetic pipeline owns it.
     * @param {MouseEvent} event
     * @protected
     */
    onMouseDown(event) {
        // The same opening test the sensor makes: a non-primary button is the context menu, and
        // ctrl/meta-click is a secondary click on macOS. Arming either turns a menu into a drag.
        if (event.button !== 0 || event.ctrlKey || event.metaKey) {
            return
        }

        // A new press means any earlier drag is over. `dragend` never fires for a source node removed
        // from the DOM mid-drag, and a lift that outlived its drag would keep the reveal shield down.
        document.body.classList.remove(nativeDragCls);

        const source = this.sourceOf(event);

        if (source) {
            /*
                A registered node arms UNCONDITIONALLY — claim and arm must never diverge. A node
                that is already `draggable` (a link, an image, an author-set attribute) still made
                the sensor yield through {@link #claimsEvent}, so this addon owns its gesture and
                must fill the payload. What stays conditional is DOM restoration: only an attribute
                this addon ADDED is removed on terminal.
            */
            const addedAttribute = !source.node.draggable;

            addedAttribute && (source.node.draggable = true);

            this.armed = {...source, addedAttribute}
        }
    }

    /**
     * Declares one component subtree as a native drag source. Re-registering an owner replaces its
     * declaration — which is what a reactive config setter needs.
     * @param {Object} data
     * @param {String} data.ownerId The owning component's id; matches are scoped to its DOM subtree.
     * @param {String} data.delegate CSS selector for the draggable nodes, resolved via `closest()`.
     * @param {Object} data.types Map of mime type -> payload template (see the class comment).
     * @param {String} [data.effectAllowed='copy']
     * @param {Object|null} [data.fields=null] `{nodeId: {field: value}}` backing `{field:name}`
     *     tokens. Omitted by every declaration that uses attribute templates only, which is why
     *     its absence has to behave exactly like today rather than throw.
     */
    register({ownerId, delegate, types, effectAllowed, fields=null}) {
        this.sources.set(ownerId, {delegate, effectAllowed, fields, ownerId, types})
    }

    /**
     * Resolves the registered source node a gesture started on, if any: the closest delegate match
     * that lives inside its owner's subtree. First matching registration wins, insertion order.
     * @param {MouseEvent} event
     * @returns {Object|null} `{node, registration}`
     * @protected
     */
    sourceOf(event) {
        for (const registration of this.sources.values()) {
            const node = event.target?.closest?.(registration.delegate);

            /*
                Owner resolution goes through `DomAccess.getElement()` — the authority for BOTH DOM
                identity modes (`id` attributes and `useDomIds: false`'s `data-neo-id`). A direct
                `getElementById` here would silently never match half the supported apps. Runtime
                lookup rather than an import: the namespace is guaranteed on a booted main thread,
                and it keeps the seam swappable for the unit harness.
            */
            if (node && Neo.main?.DomAccess?.getElement(registration.ownerId)?.contains?.(node)) {
                return {node, registration}
            }
        }

        return null
    }

    /**
     * Replaces one live registration's field map, leaving the rest of the declaration alone.
     *
     * This is the per-render refresh path, so it must NOT re-register: a full `register` would
     * rebuild the entry and lose its position in the insertion order `sourceOf` resolves by, and
     * a pooled surface calls this on every scroll frame.
     *
     * An unknown owner is a no-op rather than an error. The refresh is fired by a render, and a
     * render can outlive a retirement by one frame — treating that ordinary race as a failure
     * would make it look like a defect every time a drag source unmounts.
     * @param {Object} data
     * @param {String} data.ownerId
     * @param {Object|null} data.fields `{nodeId: {field: value}}`
     */
    updateFields({ownerId, fields}) {
        const registration = this.sources.get(ownerId);

        registration && (registration.fields = fields ?? null)
    }

    /**
     * Retires one owner's declaration. A gesture already armed finishes on its own lifecycle.
     * @param {Object} data
     * @param {String} data.ownerId
     */
    unregister({ownerId}) {
        this.sources.delete(ownerId)
    }
}

export default Neo.setupClass(NativeDragSource);
