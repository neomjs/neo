import Base     from '../core/Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @class Neo.util.KeyNavigation
 * @extends Neo.core.Base
 */
class KeyNavigation extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.KeyNavigation'
         * @protected
         */
        className: 'Neo.util.KeyNavigation',
        /**
         * @member {String} ntype='keynav'
         * @protected
         */
        ntype: 'keynav',
        /**
         * Internally stores the component id inside _component
         * @member {Neo.component.Base|null} component_=null
         */
        component_: null,
        /**
         * Set this to true in case the keydown event is supposed to bubble upwards inside the component tree
         * @member {Boolean} keyDownEventBubble=false
         */
        keyDownEventBubble: false,
        /**
         * @member {Array|null} keys_=null
         */
        keys_: null
    }

    add(value) {
        this._keys.push(...this.parseKeys(value))
    }

    /**
     * @protected
     * @returns {Neo.component.Base}
     */
    beforeGetComponent() {
        return Neo.getComponent(this._component)
    }

    /**
     * @param {Neo.component.Base} value
     * @protected
     * @returns {String} the component id
     */
    beforeSetComponent(value) {
        return value?.id
    }

    /**
     *
     */
    destroy() {
        this.unregister();
        super.destroy()
    }

    /**
     * @param {Object} data
     */
    onKeyDown(data) {
        // Using the chrome auto-fill feature does trigger a keydown event, not containing a key. See: #64
        if (data.key) {
            let me           = this,
                upperCaseKey = data.key.toUpperCase(),
                scope;

            upperCaseKey = me.parseUpperCaseKey(upperCaseKey);

            me.keys.forEach(key => {
                scope = Neo.isString(key.scope) ? Neo.get(key.scope) : key.scope;

                if (key.key.toUpperCase() === upperCaseKey) {
                    if (Neo.isFunction(key.fn)) {
                        key.fn.apply(scope, [data, me.component])
                    } else {
                        scope[key.fn]?.apply(scope, [data, me.component])
                    }
                }
            })
        }
    }

    /**
     * @param {Object} value
     * @returns {Object}
     */
    parseKeys(value) {
        if (!Array.isArray(value)) {
            let componentId = this._component,
                keyArray    = [];

            if (componentId) {
                Object.entries(value).forEach(([key, val]) => {
                    if (key !== 'scope') {
                        keyArray.push({
                            fn   : val,
                            key,
                            scope: value.scope || componentId // todo: support VCs later on
                        })
                    }
                });

                value = keyArray
            }
        }

        return value
    }

    /**
     * Replaces specific key names, e.g. " " => SPACE
     * @param {String} key
     * @protected
     * @returns {String}
     */
    parseUpperCaseKey(key) {
        switch (key) {
            case ' ':
                key = 'SPACE';
                break
            case 'ARROWDOWN':
                key = 'DOWN';
                break
            case 'ARROWLEFT':
                key = 'LEFT';
                break
            case 'ARROWRIGHT':
                key = 'RIGHT';
                break
            case 'ARROWUP':
                key = 'UP';
                break
        }

        return key
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        let me = this;

        me.component = component;
        me.keys      = me.parseKeys(me.keys);

        component.addDomListeners({
            keydown: {
                bubble: me.keyDownEventBubble,
                fn    : me.onKeyDown,
                scope : me
            }
        })
    }

    /**
     * Remove a key listener using the same config used when creating it
     * @param {Object} config
     */
    removeKey(config) {
        let me   = this,
            keys = me._keys,
            i    = 0,
            len  = keys.length,
            key;

        for (; i < len; i++) {
            key = keys[i];

            if (Neo.isEqual(key, config)) {
                NeoArray.remove(keys, key);
                break
            }
        }
    }

    /**
     * Remove multiple key listeners passing an array of config items
     * @param {Array} items
     */
    removeKeys(items) {
        Array.isArray(items) && items.forEach(item => this.removeKey(item))
    }

    /**
     *
     */
    unregister() {
        // todo: remove the dom listener from the owner component
    }
}

export default Neo.setupClass(KeyNavigation);
