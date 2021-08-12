import Component from '../../../src/component/Base.mjs';

let moduleLoaded = false;

/**
 * @class Neo.component.mwc.TextField
 * @extends Neo.component.Base
 */
class Button extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.mwc.TextField'
         * @protected
         */
        className: 'Neo.component.mwc.TextField',
        /**
         * @member {String} ntype='mwc-textfield'
         * @protected
         */
        ntype: 'mwc-textfield',
        /**
         * Displays a helper text below the field
         * @member {String} helper_=''
         */
        helper_: '',
        /**
         * @member {String} icon_=''
         */
        icon_: '',
        /**
         * @member {String} iconTrailing_=''
         */
        iconTrailing_: '',
        /**
         * @member {String} label_=''
         */
        label_: '',
        /**
         * @member {Boolean} outlined_=false
         */
        outlined_: false,
        /**
         * @member {Object} _vdom={tag:'mwc-textfield'}
         */
        _vdom:
        {tag: 'mwc-textfield'}
    }}

    /**
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        if (!Neo.config.mainThreadAddons.includes('Mwc')) {
            console.error('Please include "Mwc" into the mainThreadAddons of your neo-config.json file.');
        }

        if (!moduleLoaded) {
            moduleLoaded = true;
            Neo.main.addon.Mwc.loadTextFieldModule();
        }
    }

    /**
     * Triggered after the disabled config got changed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @override
     * @protected
     */
    afterSetDisabled(value, oldValue) {
        this.changeVdomRootKey('disabled', value);
    }

    /**
     * Triggered after the helper config got changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetHelper(value, oldValue) {
        this.changeVdomRootKey('helper', value);
    }

    /**
     * Triggered after the icon config got changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetIcon(value, oldValue) {
        this.changeVdomRootKey('icon', value);
    }

    /**
     * Triggered after the iconTrailing config got changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetIconTrailing(value, oldValue) {
        this.changeVdomRootKey('iconTrailing', value);
    }

    /**
     * Triggered after the label config got changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLabel(value, oldValue) {
        this.changeVdomRootKey('label', value);
    }

    /**
     * Triggered after the outlined config got changed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetOutlined(value, oldValue) {
        this.changeVdomRootKey('outlined', value || null);
    }
}

Neo.applyClassConfig(Button);

export {Button as default};
