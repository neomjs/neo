import Component from '../../../src/component/Base.mjs';

let moduleLoaded = false;

/**
 * @class Neo.component.mwc.Button
 * @extends Neo.component.Base
 */
class Button extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.mwc.Button'
         * @protected
         */
        className: 'Neo.component.mwc.Button',
        /**
         * @member {String} ntype='mwc-button'
         * @protected
         */
        ntype: 'mwc-button',
        /**
         * @member {Boolean} dense_=false
         */
        dense_: false,
        /**
         * Shortcut for domListeners={click:handler}
         * A string based value assumes that the handlerFn lives inside a ComponentController
         * @member {Function|String|null} handler_=null
         */
        handler_: null,
        /**
         * @member {String} icon_=''
         */
        icon_: '',
        /**
         * @member {String} label_=''
         */
        label_: '',
        /**
         * @member {Boolean} outlined_=false
         */
        outlined_: false,
        /**
         * @member {Boolean} raised_=false
         */
        raised_: false,
        /**
         * @member {Boolean} unelevated_=false
         */
        unelevated_: false,
        /**
         * @member {Object} _vdom={tag:'mwc-button'}
         */
        _vdom:
        {tag: 'mwc-button'}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (!Neo.config.mainThreadAddons.includes('Mwc')) {
            console.error('Please include "Mwc" into the mainThreadAddons of your neo-config.json file.')
        }

        if (!moduleLoaded) {
            moduleLoaded = true;
            Neo.main.addon.Mwc.loadButtonModule()
        }
    }

    /**
     * Triggered after the dense config got changed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDense(value, oldValue) {
        this.changeVdomRootKey('dense', value)
    }

    /**
     * Triggered after the disabled config got changed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @override
     * @protected
     */
    afterSetDisabled(value, oldValue) {
        this.changeVdomRootKey('disabled', value)
    }

    /**
     * Triggered after the handler config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetHandler(value, oldValue) {
        value && this.addDomListeners({
            click: value,
            scope: this
        })
    }

    /**
     * Triggered after the icon config got changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetIcon(value, oldValue) {
        this.changeVdomRootKey('icon', value)
    }

    /**
     * Triggered after the label config got changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLabel(value, oldValue) {
        this.changeVdomRootKey('label', value)
    }

    /**
     * Triggered after the outlined config got changed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetOutlined(value, oldValue) {
        this.changeVdomRootKey('outlined', value || null)
    }

    /**
     * Triggered after the raised config got changed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetRaised(value, oldValue) {
        this.changeVdomRootKey('raised', value || null)
    }

    /**
     * Triggered after the unelevated config got changed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUnelevated(value, oldValue) {
        this.changeVdomRootKey('unelevated', value || null)
    }
}

export default Neo.setupClass(Button);
