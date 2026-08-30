import Base from './Base.mjs';

/**
 * `{attribute-name}` placeholders inside a payload template. Attribute names only — values come
 * from `getAttribute()`, never from code, which is what keeps the whole declaration JSON-safe.
 * @type {RegExp}
 */
const templateToken = /\{([\w-]+)\}/g;

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
 * Payload values are **templates over the source node's attributes**: `{data-record-id}` reads
 * `node.getAttribute('data-record-id')` at `dragstart` time. String substitution is the entire
 * main-thread execution surface.
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
 * purpose is to LAND on one.
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
                'unregister'
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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        // Capture phase throughout: grids and lists stop propagation of some of their own pointer
        // handling, and arming has to happen regardless. Nothing here cancels anything.
        document.addEventListener('mousedown', me.onMouseDown.bind(me), true);
        document.addEventListener('dragstart', me.onDragStart.bind(me), true);
        document.addEventListener('dragend',   me.onGestureEnd.bind(me), true);
        document.addEventListener('mouseup',   me.onGestureEnd.bind(me), true)
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

        if (!armed || event.target !== armed.node || !dataTransfer) {
            return
        }

        ({node} = armed);
        types   = armed.registration.types || {};

        Object.entries(types).forEach(([type, template]) => {
            dataTransfer.setData(type, template.replace(templateToken, (match, name) => node.getAttribute(name) ?? ''))
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

        if (armed) {
            armed.node.removeAttribute('draggable');
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

        const source = this.sourceOf(event);

        if (source && !source.node.draggable) {
            source.node.draggable = true;
            this.armed = source
        }
    }

    /**
     * Declares one component subtree as a native drag source. Re-registering an owner replaces its
     * declaration — which is what a reactive config setter needs.
     * @param {Object} data
     * @param {String} data.ownerId The owning component's id; matches are scoped to its DOM subtree.
     * @param {String} data.delegate CSS selector for the draggable nodes, resolved via `closest()`.
     * @param {Object} data.types Map of mime type -> attribute template (see the class comment).
     * @param {String} [data.effectAllowed='copy']
     */
    register({ownerId, delegate, types, effectAllowed}) {
        this.sources.set(ownerId, {delegate, effectAllowed, ownerId, types})
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

            if (node && document.getElementById(registration.ownerId)?.contains(node)) {
                return {node, registration}
            }
        }

        return null
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
