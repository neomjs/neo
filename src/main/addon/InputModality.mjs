import Base from './Base.mjs';

/**
 * @summary Owns pointer-versus-keyboard input truth for one main-thread document.
 *
 * Every Neo window has its own Main realm and therefore its own addon instance. Native document
 * input updates that realm's marker directly, while App-Worker callers route `setModality()` through
 * Remote Method Access with a `windowId` to stamp the focus-arrival document deterministically.
 * Consumers can key CSS on `data-input-modality` without moving DOM ownership into the App Worker.
 *
 * @class Neo.main.addon.InputModality
 * @extends Neo.main.addon.Base
 */
class InputModality extends Base {
    static config = {
        /**
         * Attribute written onto this realm's `documentElement`.
         * @member {String} attributeName='data-input-modality'
         */
        attributeName: 'data-input-modality',
        /**
         * @member {String} className='Neo.main.addon.InputModality'
         * @protected
         */
        className: 'Neo.main.addon.InputModality',
        /**
         * No external files need to delay remote readiness.
         * @member {Boolean} preloadFilesDelay=false
         * @protected
         */
        preloadFilesDelay: false,
        /**
         * App-Worker access to the modality query and named-window stamp.
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'getModality',
                'setModality'
            ]
        }
    }

    /**
     * The document captured by this Main realm. Keeping the reference makes teardown independent
     * from later global changes in tests and from popup lifecycle timing.
     * @member {Document|null} documentRef=null
     * @protected
     */
    documentRef = null
    /**
     * Shared listener options. `capture` observes the native cause before component handlers and
     * `passive` guarantees that modality tracking never changes event behavior.
     * @member {Object} listenerOptions
     * @protected
     */
    listenerOptions = {capture: true, passive: true}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const documentRef = this.documentRef = globalThis.document;

        if (documentRef?.documentElement) {
            documentRef.addEventListener('pointerdown', this.onPointerDown, this.listenerOptions);
            documentRef.addEventListener('mousedown',   this.onPointerDown, this.listenerOptions);
            documentRef.addEventListener('keydown',     this.onKeyDown,     this.listenerOptions)
        }
    }

    /**
     * Removes the realm-owned listeners and marker before the addon lifecycle ends.
     * @returns {void}
     */
    destroy() {
        const {attributeName, documentRef, listenerOptions} = this;

        if (documentRef?.documentElement) {
            documentRef.removeEventListener('pointerdown', this.onPointerDown, listenerOptions);
            documentRef.removeEventListener('mousedown',   this.onPointerDown, listenerOptions);
            documentRef.removeEventListener('keydown',     this.onKeyDown,     listenerOptions);
            documentRef.documentElement.removeAttribute(attributeName)
        }

        super.destroy()
    }

    /**
     * Reads this window document's current marker. App-Worker callers include `windowId` in the
     * first argument so Remote Method Access selects the intended Main realm before this executes.
     * @param {Object} [data]
     * @param {String} [data.windowId] Routing metadata consumed by Remote Method Access.
     * @returns {String|null}
     */
    getModality(data) {
        const root = this.documentRef?.documentElement;

        return root?.getAttribute(this.attributeName) || null
    }

    /**
     * Native keyboard input establishes keyboard modality for this document.
     * @returns {void}
     * @protected
     */
    onKeyDown = () => {
        this.setModality({modality: 'keyboard'})
    }

    /**
     * Native pointer or mouse input establishes pointer modality for this document.
     * @returns {void}
     * @protected
     */
    onPointerDown = () => {
        this.setModality({modality: 'pointer'})
    }

    /**
     * Stamps this Main realm's document with an explicit modality. The App Worker must pass the
     * target `windowId`; Remote Method Access consumes it for routing and this method owns only the
     * selected document mutation.
     * @param {Object} data
     * @param {'keyboard'|'pointer'} data.modality
     * @param {String} [data.windowId] Routing metadata consumed by Remote Method Access.
     * @returns {Boolean} Whether a marker was written.
     */
    setModality({modality} = {}) {
        const root = this.documentRef?.documentElement;

        if (!root || (modality !== 'keyboard' && modality !== 'pointer')) {
            return false
        }

        root.setAttribute(this.attributeName, modality);

        return true
    }
}

export default Neo.setupClass(InputModality);
