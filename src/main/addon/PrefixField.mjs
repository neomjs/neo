import Base from './Base.mjs';

/**
 * @summary Main-thread input mask controller for `Neo.plugin.PrefixField`.
 * Formats `<input>.value` and updates caret selection synchronously on Main ahead of bubble-phase `DomEvents`.
 * @class Neo.main.addon.PrefixField
 * @extends Neo.main.addon.Base
 */
class PrefixField extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.PrefixField'
         * @protected
         */
        className: 'Neo.main.addon.PrefixField',
        /**
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'register',
                'setConfigs',
                'unregister'
            ]
        }
    }

    /**
     * Per-input state keyed by DOM element id.
     * @member {Map<String, Object>} fields=new Map()
     * @protected
     */
    fields = new Map()

    /**
     * @param {Object} state
     * @param {String} input
     * @returns {String[]}
     * @protected
     */
    clean(state, input) {
        if (!state.pattern) {
            return [...String(input || '')]
        }

        const accept  = new RegExp(state.accept.source, state.accept.flags);
        let   matches = String(input || '').match(accept) || [];

        return Array.from(state.pattern, char =>
            matches[0] === char || state.slots.has(char) ? matches.shift() || char : char
        ).slice(0, state.pattern.length)
    }

    /**
     * @param {String|null} acceptSource
     * @param {String|null} acceptFlags
     * @returns {RegExp}
     * @protected
     */
    compileAccept(acceptSource, acceptFlags) {
        const source = acceptSource || '\\d',
              flags  = acceptFlags || '';

        return new RegExp(source, flags.includes('g') ? flags : `${flags}g`)
    }

    /**
     * @param {Object} state
     * @param {String} value
     * @param {Number} start
     * @param {Number} end
     * @returns {Number[]}
     * @protected
     */
    computeSelection(state, value, start, end) {
        const {first, prev, slots} = state;

        return [start, end].map(pos => {
            const nextSlot = this.clean(state, value.slice(0, pos)).findIndex(char => slots.has(char));
            return nextSlot < 0 ? (prev[prev.length - 1] ?? value.length) : state.back ? (prev[nextSlot - 1] || first) : nextSlot
        })
    }

    /**
     * @param {Object} args
     */
    destroy(...args) {
        for (const id of [...this.fields.keys()]) {
            this.unregister({id})
        }

        super.destroy(...args)
    }

    /**
     * Dispatches a bubbling `input` event while suppressing re-entrant formatting so `DomEvents` syncs App Worker state.
     * @param {Object} state
     * @protected
     */
    dispatchSyncInput(state) {
        state.formatting = true;
        try {
            state.el.dispatchEvent(new Event('input', {bubbles: true}))
        } finally {
            state.formatting = false
        }
    }

    /**
     * @param {Object}  state
     * @param {Boolean} [notifyWorker=false]
     * @protected
     */
    formatElement(state, notifyWorker=false) {
        if (state.formatting || !state.pattern) return;

        const {el}   = state,
              before = el.value || '',
              start  = el.selectionStart ?? before.length,
              end    = el.selectionEnd   ?? start,
              [i, j] = this.computeSelection(state, before, start, end),
              after  = this.clean(state, before).join('');

        state.formatting = true;
        try {
            el.value = after;
            el.setSelectionRange(i, j)
        } finally {
            state.formatting = false;
            state.back       = false
        }

        if (notifyWorker && after !== before) {
            this.dispatchSyncInput(state)
        }
    }

    /**
     * @param {Object} state
     * @protected
     */
    onClick(state) {
        if (state.formatting || !state.pattern) return;

        const {el, first, slots} = state;

        if (el.selectionStart === el.selectionEnd) {
            const firstUnfilled = this.clean(state, el.value).findIndex(char => slots.has(char));

            if (firstUnfilled >= 0 && (el.selectionStart < first || el.selectionStart > firstUnfilled)) {
                el.setSelectionRange(firstUnfilled, firstUnfilled)
            }
        }
    }

    /**
     * @param {Object} state
     * @protected
     */
    onFocusIn(state) {
        this.formatElement(state, true)
    }

    /**
     * @param {Object} state
     * @protected
     */
    onFocusOut(state) {
        if (state.formatting || !state.pattern) return;

        const {el, pattern} = state;

        if (el.value === pattern) {
            state.formatting = true;
            el.value         = '';
            state.formatting = false;
            this.dispatchSyncInput(state)
        }
    }

    /**
     * @param {Object} state
     * @protected
     */
    onInput(state) {
        this.formatElement(state, false)
    }

    /**
     * @param {Object}        state
     * @param {KeyboardEvent} event
     * @protected
     */
    onKeyDown(state, event) {
        state.back = event.key === 'Backspace'
    }

    /**
     * @param {Object} state
     * @param {Object} config
     * @protected
     */
    recalcState(state, {acceptFlags, acceptSource, pattern, slots}) {
        if (pattern !== undefined) {
            state.pattern = pattern
        }

        if (slots !== undefined || !state.slots) {
            state.slots = new Set(slots || '_')
        }

        if (acceptSource !== undefined || acceptFlags !== undefined || !state.accept) {
            state.accept = this.compileAccept(acceptSource, acceptFlags)
        }

        if (state.pattern) {
            state.prev  = (j => Array.from(state.pattern, (char, idx) => state.slots.has(char) ? j = idx + 1 : j))(0);
            const first = [...state.pattern].findIndex(char => state.slots.has(char));
            state.first = first < 0 ? 0 : first
        } else {
            state.prev  = [];
            state.first = 0
        }
    }

    /**
     * @param {Object}      data
     * @param {String}      data.id
     * @param {String|null} [data.acceptFlags=null]
     * @param {String|null} [data.acceptSource=null]
     * @param {String|null} [data.pattern=null]
     * @param {String|null} [data.slots=null]
     * @returns {Boolean}
     */
    register(data) {
        const me = this,
              el = globalThis.document?.getElementById(data.id);

        if (!el) {
            return false
        }

        if (me.fields.has(data.id)) {
            me.unregister({id: data.id})
        }

        const state = {
            accept    : null,
            back      : false,
            el,
            first     : 0,
            formatting: false,
            id        : data.id,
            listeners : null,
            pattern   : null,
            prev      : [],
            slots     : null
        };

        me.recalcState(state, data);

        const listeners = {
            click   : me.onClick.bind(me, state),
            focusin : me.onFocusIn.bind(me, state),
            focusout: me.onFocusOut.bind(me, state),
            input   : me.onInput.bind(me, state),
            keydown : me.onKeyDown.bind(me, state)
        };

        state.listeners = listeners;

        Object.entries(listeners).forEach(([type, fn]) => {
            el.addEventListener(type, fn)
        });

        el.dataset.neoPrefixReady = 'true';
        me.fields.set(data.id, state);

        if (el.value || document.activeElement === el) {
            me.formatElement(state, true)
        }

        return true
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @returns {Boolean}
     */
    setConfigs(data) {
        const me    = this,
              state = me.fields.get(data.id);

        if (!state) {
            return me.register(data)
        }

        me.recalcState(state, data);

        if (state.el.value || document.activeElement === state.el) {
            me.formatElement(state, true)
        }

        return true
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @returns {Boolean}
     */
    unregister({id}) {
        const state = this.fields.get(id);

        if (!state) {
            return false
        }

        const {el, listeners} = state;

        if (el && listeners) {
            Object.entries(listeners).forEach(([type, fn]) => {
                el.removeEventListener(type, fn)
            });

            delete el.dataset.neoPrefixReady
        }

        this.fields.delete(id);
        return true
    }
}

export default Neo.setupClass(PrefixField);
