import Base from '../../core/Base.mjs';

/**
 * Helper class to include Google's Material Web Components into your neo.mjs app
 * https://www.amcharts.com/docs/v4/
 * @class Neo.main.addon.PrefixField
 * @extends Neo.core.Base
 * @singleton
 */
class PrefixField extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.PrefixField'
         * @protected
         */
        className: 'Neo.main.addon.PrefixField',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'initialize',
                'destroy',
                'updateAccept',
                'updatePattern',
                'updateSlots',
            ]
        },

        /**
         * regex to calculate if entered value is acceptable
         * Preset to numbers only
         *
         * @member {regex|null} accept
         */
        accept_: null,
        /**
         * @member {String} pattern=null
         */
        pattern_: null,
        /**
         * Only add a String. A Set will be automatically created
         * @member {String|Set|null} slots=null
         */
        slots_: null
    }

    destroy() {

    }

    elIds = new Map();

    prev;

    back = false;

    /**
     *
     * @param {Object} data
     * @param {String} data.elId
     * @param {String} data.pattern
     * @param {String} data.slots
     * @param {String} data.accept
     */
    initialize(data) {
        const me = this;

        me.elId     = data.elId;

        const el      = me.el = document.getElementById(data.elId),
              pattern = me.pattern = data.pattern,
              slots = me.slots = new Set(data.slots || "_");

        me.accept = data.accept;
        me.prev   = (j => Array.from(pattern, (c, i) => slots.has(c) ? j = i + 1 : j))(0);
        me.first  = [...pattern].findIndex(c => slots.has(c));

        me.addListeners();
        me.addCss();
    }

    addCss() {
        this.el.classList.add('tiny-prefix-field-input');
    }

    addListeners() {
        const me       = this,
              el       = me.el,
              formatFn = me.format.bind(me);

        el.addEventListener("keypress", me.onKeyDown.bind(me));
        el.addEventListener("input", formatFn);
        el.addEventListener("focusin", formatFn);
        el.addEventListener("focusout", me.onBlur.bind(me));
    }

    onBlur() {
        const pattern = this.pattern,
              el      = this.el;

        return el.value === pattern && (el.value = "");
    }

    onKeyDown(event) {
        this.back = (event.key === "Backspace");
    }

    clean(input) {
        const el      = this.el,
              accept  = new RegExp(this.accept || "\\d", "g"),
              pattern = this.pattern,
              slots   = this.slots;

        input = input.match(accept) || [];

        return Array.from(pattern, c =>
            input[0] === c || slots.has(c) ? input.shift() || c : c
        );
    }

    format() {
        const me    = this,
              el    = this.el,
              prev  = this.prev,
              clean = this.clean.bind(this);
        console.log(el.selectionStart, el.selectionEnd);
        const [i, j] = [el.selectionStart, el.selectionEnd].map(i => {
            i = clean(el.value.slice(0, i)).findIndex(c => me.slots.has(c));
            return i < 0 ? prev[prev.length - 1] : me.back ? prev[i - 1] || me.first : i;
        });

        el.value = clean(el.value).join``;
        el.setSelectionRange(i, j);

        this.back = false;
    }
}

let instance = Neo.applyClassConfig(PrefixField);

export default instance;
