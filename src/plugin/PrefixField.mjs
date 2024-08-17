import Base from './Base.mjs';

/**
 * @class Neo.plugin.PrefixField
 * @extends Neo.plugin.Base
 *
 * @example
 *
 *     {
 *         module   : TextField,
 *         labelText: 'Credit Card',
 *         plugins  : [{
 *             module : PrefixPlugin, // import PrefixPlugin from '../../src/plugin/PrefixField.mjs';
 *             pattern: 'dd/mm/yyyy',
 *             slots  : 'dmy',        // characters allowed to replace
 *             accept : /\d/          // either '[A-Z]' or regex or undefined
 *         }]
 *     }
 */
class PrefixField extends Base {
    static config = {
        /**
         * @member {String} className='Neo.plugin.PrefixField'
         * @protected
         */
        className: 'Neo.plugin.PrefixField',
        /**
         * @member {String} ntype='plugin-prefixfield'
         * @protected
         */
        ntype: 'plugin-prefixfield',
        /**
         * Custom cls added to the inputEl
         * @member {String} inputCls='neo-prefixfield-input'
         */
        inputCls: 'neo-prefixfield-input',
        /**
         * Custom cls added to the inputEl
         * @member {String} inputCls='neo-prefixfield-input'
         */
        labelCls: 'neo-prefixfield-label',
        /**
         * Custom cls to add to the owner component
         * @member {String} ownerCls='neo-prefixfield'
         */
        ownerCls: 'neo-prefixfield',
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

    /**
     * First accepted place to enter a value
     * @member {Number} first
     * @protected
     */
    first = null
    /**
     * Array of numbers, which shows the previous entry point
     * @member {Array[]} prev
     * @protected
     */
    prev = null
    /**
     * Position of the cursor inside input element
     * @member {Object} selection
     * @protected
     */
    selection = null

    /**
     * State if selection should be updated
     * @member {Boolean} ignoreSelection
     * @protected
     */
    ignoreSelection = false
    /**
     * State if last entry was the back button
     * @member {Boolean} back
     * @protected
     */
    back = false

    /**
     * @param {Object} config
     */
    construct(config) {
        let me = this;

        super.construct(config);

        me.addListeners();
        me.addCss();
    }

    /**
     * Add a custom cls to the owner component
     */
    addCss() {
        const me      = this,
              {owner} = me,
              inputEl = owner.getInputEl(),
              labelEl = owner.getLabelEl();

        owner    .addCls(me.ownerCls);
        inputEl.cls.push(me.inputCls);
        labelEl.cls.push(me.labelCls)
    }

    /**
     * Add listeners
     * @protected
     */
    addListeners() {
        let me      = this,
            {owner} = me;

        owner.addDomListeners([
            {keydown        : me.onFieldKeyDown        , scope: me},
            {focusin        : me.onFieldFocus          , scope: me},
            {focusout       : me.onFieldBlur           , scope: me},
            {selectionchange: me.onFieldSelectionChange, scope: me}
        ]);

        me.owner.on('mounted', () => {
            Neo.currentWorker.insertThemeFiles(owner.appName, owner.windowId, me.__proto__)
        }, me, {once: true})
    }


    /**
     * After setting accept format output
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetAccept(value, oldValue) {
        this.owner.value && this.format()
    }

    /**
     * After setting pattern recalc other values and set placeholder
     * @param {Set} value
     * @param {Set} oldValue
     * @protected
     */
    afterSetPattern(value, oldValue) {
        this.owner.placeholderText = value;
        this.recalcFirstAndPref()
    }

    /**
     * After setting slots recalc other values
     * @param {Set} value
     * @param {Set} oldValue
     * @protected
     */
    afterSetSlots(value, oldValue) {
        this.recalcFirstAndPref()
    }

    /**
     * Before the new value for slots will be set we create a Set from the string
     * @param {String} value
     * @return {Set}
     * @protected
     */
    beforeSetSlots(value) {
        return new Set(value || "_")
    }

    /**
     * Remove unwanted entries and limit length
     * @param {String} input
     * @returns {any[]}
     * @protected
     */
    clean(input) {
        const me     = this,
              accept = new RegExp(this.accept || "\\d", "g");

        input = input.match(accept) || [];
        input = Array.from(me.pattern, c =>
            input[0] === c || me.slots.has(c) ? input.shift() || c : c
        );

        return input.slice(0, me.pattern.length)
    }

    /**
     * Calculate position and output correct String to Field
     * @protected
     */
    format() {
        let me                = this,
            el                = me.owner,
            {prev, selection} = me,
            clean             = me.clean.bind(me),
            value             = el.value || '';

        const [i, j] = [selection.start, selection.end].map(i => {
            i = me.clean(value.slice(0, i)).findIndex(c => me.slots.has(c));
            return i < 0 ? prev[prev.length - 1] : me.back ? prev[i - 1] || me.first : i
        });

        el.value = clean(value).join``;
        me.ignoreSelection = true;

        Neo.main.DomAccess.selectNode({id: el.getInputElId(), start: i, end: j});
        me.ignoreSelection = false;

        me.back = false
    }

    /**
     * Event
     * @param {Object} data
     * @returns {false|string}
     * @protected
     */
    onFieldBlur(data) {
        let {owner, pattern} = this;

        return owner.value === pattern && (owner.value = '')
    }

    /**
     * Event
     * @param {Object} data
     * @protected
     */
    onFieldFocus(data) {
        this.format()
    }

    /**
     * Event
     * @param {Object} data
     * @protected
     */
    onFieldKeyDown(data) {
        this.back = data.key === "Backspace"
    }

    /**
     * Event
     * @param {Object} data
     * @protected
     */
    onFieldSelectionChange(data) {
        let sel  = this.selection,
            dSel = data.selection;

        // Do not run, if ignore state or same start and end data
        if (this.ignoreSelection || (dSel.start === sel.start && dSel.end === sel.end)) {
            return
        }

        this.selection = dSel;
        this.format()
    }

    /**
     * Calc values for first and prev
     * @protected
     */
    recalcFirstAndPref() {
        let me               = this,
            {pattern, slots} = me;

        me.prev = (j => Array.from(pattern, (c, i) => slots.has(c) ? j = i + 1 : j))(0);
        me.first = [...pattern].findIndex(c => slots.has(c));

        me.selection = {start: me.first, end: me.first};

        me.owner.value && me.format()
    }
}

export default Neo.setupClass(PrefixField);
