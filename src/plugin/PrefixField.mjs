import Plugin from './Base.mjs';

/**
 * @summary Input-mask plugin for `Neo.form.field.Text` backed by `Neo.main.addon.PrefixField`.
 * Delegates live DOM keystroke/paste/caret masking to the Main Thread addon while keeping App-Worker config
 * reactivity and programmatic `owner.value` formatting synchronous in the worker.
 * @class Neo.plugin.PrefixField
 * @extends Neo.plugin.Base
 */
class PrefixField extends Plugin {
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
         * @member {String} inputCls='neo-prefixfield-input'
         */
        inputCls: 'neo-prefixfield-input',
        /**
         * @member {String} labelCls='neo-prefixfield-label'
         */
        labelCls: 'neo-prefixfield-label',
        /**
         * @member {String} ownerCls='neo-prefixfield'
         */
        ownerCls: 'neo-prefixfield',
        /**
         * Character class or RegExp deciding accepted input characters (defaults to digits `/\d/`).
         * @member {RegExp|String|null} accept_=null
         * @reactive
         */
        accept_: null,
        /**
         * Mask template string (e.g. `'dd/mm/yyyy'`).
         * @member {String|null} pattern_=null
         * @reactive
         */
        pattern_: null,
        /**
         * Characters in `pattern` treated as fillable input slots (converted to a `Set`).
         * @member {String|Set|null} slots_=null
         * @reactive
         */
        slots_: null
    }

    /**
     * @member {Number|null} first=null
     * @protected
     */
    first = null
    /**
     * @member {Number[]|null} prev=null
     * @protected
     */
    prev = null
    /**
     * @member {Function|null} priorBeforeSetValue=null
     * @protected
     */
    priorBeforeSetValue = null
    /**
     * @member {String} rawSlots='_'
     * @protected
     */
    rawSlots = '_'

    /**
     * @param {Object} config
     */
    construct(config) {
        let me = this;

        super.construct(config);

        me.bindOwnerValueHook();
        me.addCss()
    }

    /**
     * Adds mask classes to the owner field and its input/label VDOM nodes.
     */
    addCss() {
        const me      = this,
              {owner} = me,
              inputEl = owner.getInputEl(),
              labelEl = owner.getLabelEl();

        owner.addCls(me.ownerCls);
        inputEl && !inputEl.cls.includes(me.inputCls) && inputEl.cls.push(me.inputCls);
        labelEl && !labelEl.cls.includes(me.labelCls) && labelEl.cls.push(me.labelCls)
    }

    /**
     * @param {RegExp|String|null} value
     * @param {RegExp|String|null} oldValue
     * @protected
     */
    afterSetAccept(value, oldValue) {
        let me = this;

        if (oldValue !== undefined) {
            me.formatOwnerValue();
            me.syncMainAddon()
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetPattern(value, oldValue) {
        let me = this;

        me.owner.placeholderText = value;
        me.recalcFirstAndPref();

        if (oldValue !== undefined) {
            me.syncMainAddon()
        }
    }

    /**
     * @param {Set} value
     * @param {Set} oldValue
     * @protected
     */
    afterSetSlots(value, oldValue) {
        let me = this;

        me.recalcFirstAndPref();

        if (oldValue !== undefined) {
            me.syncMainAddon()
        }
    }

    /**
     * @summary Unregisters `InputMask` from `oldValue` and re-registers when moving while mounted.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        const me      = this,
              {owner} = me;

        if (oldValue && oldValue !== value && owner) {
            const elId = owner.getInputElId();

            Neo.currentWorker?.getAddon?.('PrefixField', oldValue)?.then(addon => {
                addon?.unregister?.({id: elId, windowId: oldValue})
            })
        }

        if (value && oldValue !== undefined && oldValue !== value && owner?.mounted && !me.isDestroyed) {
            me.onOwnerMounted()
        }
    }

    /**
     * @param {String|Set|null} value
     * @returns {Set}
     * @protected
     */
    beforeSetSlots(value) {
        const chars = value instanceof Set ? [...value].join('') : (value || '_');

        this.rawSlots = chars || '_';
        return new Set(this.rawSlots)
    }

    /**
     * Wraps `owner.beforeSetValue` so programmatic value writes format atomically before `change` fires.
     * @protected
     */
    bindOwnerValueHook() {
        const me      = this,
              {owner} = me;

        me.priorBeforeSetValue = Object.hasOwn(owner, 'beforeSetValue') ? owner.beforeSetValue : null;

        owner.beforeSetValue = function(value, oldValue) {
            const baseFn     = me.priorBeforeSetValue || owner.__proto__.beforeSetValue,
                  normalized = baseFn ? baseFn.call(owner, value, oldValue) : value;

            if (Neo.isString(normalized) && normalized !== '' && me.pattern) {
                return me.clean(normalized).join('')
            }

            return normalized
        };

        if (Neo.isString(owner.value) && owner.value !== '' && me.pattern) {
            me.formatOwnerValue()
        }
    }

    /**
     * Strips unaccepted characters and maps accepted input into `pattern` slots, preserving `RegExp` flags.
     * @param {String} input
     * @returns {String[]}
     * @protected
     */
    clean(input) {
        const me = this;

        if (!me.pattern) {
            return [...String(input || '')]
        }

        const rawAccept = me.accept,
              source    = rawAccept instanceof RegExp ? rawAccept.source : (rawAccept || '\\d'),
              baseFlags = rawAccept instanceof RegExp ? rawAccept.flags  : '',
              flags     = baseFlags.includes('g') ? baseFlags : `${baseFlags}g`,
              accept    = new RegExp(source, flags);

        let matches = String(input || '').match(accept) || [];

        return Array.from(me.pattern, char =>
            matches[0] === char || me.slots.has(char) ? matches.shift() || char : char
        ).slice(0, me.pattern.length)
    }

    /**
     * @param {Array} args
     */
    destroy(...args) {
        const me      = this,
              {owner} = me;

        if (owner && !owner.isDestroyed) {
            if (me.priorBeforeSetValue) {
                owner.beforeSetValue = me.priorBeforeSetValue
            } else {
                delete owner.beforeSetValue
            }
        }

        const windowId = me.windowId || owner?.windowId;

        if (owner && windowId) {
            const elId = owner.getInputElId();

            Neo.currentWorker?.getAddon?.('PrefixField', windowId)?.then(addon => {
                addon?.unregister?.({id: elId, windowId})
            })
        }

        super.destroy(...args)
    }

    /**
     * Re-applies `clean()` to an existing non-empty `owner.value`.
     * @protected
     */
    formatOwnerValue() {
        const {owner, pattern} = this;

        if (pattern && Neo.isString(owner?.value) && owner.value !== '') {
            owner.value = this.clean(owner.value).join('')
        }
    }

    /**
     * @returns {Object}
     * @protected
     */
    getAddonPayload() {
        const me        = this,
              {owner}   = me,
              rawAccept = me.accept;

        return {
            acceptFlags : rawAccept instanceof RegExp ? rawAccept.flags  : null,
            acceptSource: rawAccept instanceof RegExp ? rawAccept.source : (rawAccept ?? null),
            id          : owner.getInputElId(),
            pattern     : me.pattern,
            slots       : me.rawSlots,
            windowId    : owner.windowId
        }
    }

    /**
     * Registers or re-registers the Main-Thread mask controller whenever the owner mounts.
     */
    async onOwnerMounted() {
        const me      = this,
              {owner} = me;

        if (!owner || !owner.windowId || me.isDestroyed) return;

        const addon = await Neo.currentWorker.getAddon('PrefixField', owner.windowId);

        if (!me.isDestroyed && owner.mounted) {
            await addon?.register?.(me.getAddonPayload())
        }
    }

    /**
     * @protected
     */
    recalcFirstAndPref() {
        const me               = this,
              {pattern, slots} = me;

        if (!pattern || !slots) return;

        me.prev  = (j => Array.from(pattern, (char, idx) => slots.has(char) ? j = idx + 1 : j))(0);
        me.first = [...pattern].findIndex(char => slots.has(char));

        me.formatOwnerValue()
    }

    /**
     * Pushes live `accept`/`pattern`/`slots` changes to the Main-Thread addon when mounted.
     * @returns {Promise<void>}
     * @protected
     */
    async syncMainAddon() {
        const me      = this,
              {owner} = me;

        if (!owner?.mounted || !owner.windowId || me.isDestroyed) return;

        const addon = await Neo.currentWorker.getAddon('PrefixField', owner.windowId);

        if (!me.isDestroyed && owner.mounted) {
            await addon?.setConfigs?.(me.getAddonPayload())
        }
    }
}

export default Neo.setupClass(PrefixField);
