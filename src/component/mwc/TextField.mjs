import Component from '../../../src/component/Base.mjs';

let moduleLoaded = false;

/**
 * @class Neo.component.mwc.TextField
 * @extends Neo.component.Base
 */
class TextField extends Component {
    static config = {
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
         * @member {String} name_=''
         */
        name_: '',
        /**
         * @member {Boolean} outlined_=false
         */
        outlined_: false,
        /**
         * @member {String} placeholder_=''
         */
        placeholder_: '',
        /**
         * @member {Boolean} required_=false
         */
        required_: false,
        /**
         * @member {String} value_=''
         */
        value_: '',
        /**
         * @member {Object} _vdom={tag:'mwc-textfield'}
         */
        _vdom:
        {tag: 'mwc-textfield'}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (!Neo.config.mainThreadAddons.includes('Mwc')) {
            console.error('Please include "Mwc" into the mainThreadAddons of your neo-config.json file.');
        }

        if (!moduleLoaded) {
            moduleLoaded = true;
            Neo.main.addon.Mwc.loadTextFieldModule();
        }

        let me = this;

        me.addDomListeners(
            {input: me.onInputValueChange, scope: me}
        );
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
     * Triggered after the name config got changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetName(value, oldValue) {
        this.changeVdomRootKey('name', value);
    }

    /**
     * Triggered after the outlined config got changed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetOutlined(value, oldValue) {
        this.changeVdomRootKey('outlined', value);
    }

    /**
     * Triggered after the placeholder config got changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetPlaceholder(value, oldValue) {
        this.changeVdomRootKey('placeholder', value);
    }

    /**
     * Triggered after the required config got changed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetRequired(value, oldValue) {
        this.changeVdomRootKey('required', value);
    }

    /**
     * Triggered after the value config got changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me = this;

        me.changeVdomRootKey('value', value);

        me.fire('change', {
            component: me,
            oldValue,
            value
        });
    }

    /**
     * Returns true if the textarea passes validity checks.
     * Returns false and fires an invalid event on the textfield otherwise.
     * @returns {Promise<Boolean>}
     */
    checkValidity() {
        return Neo.main.addon.Mwc.checkValidity(this.id);
    }

    /**
     * @param {Object} data
     * @param {Neo.component.mwc.TextField} data.component
     * @param {Object[]} data.path
     * @param {Boolean} data.valid
     * @param {String} data.value
     */
    onInputValueChange(data) {
        let me       = this,
            value    = data.value,
            oldValue = me.value;

        if (value !== oldValue) {
            me.value = value;
        }
    }

    /**
     * Runs checkValidity() method, and if it returns false,
     * then it reports to the user that the input is invalid.
     * @returns {Promise<Boolean>}
     */
    reportValidity() {
        return Neo.main.addon.Mwc.reportValidity(this.id);
    }
}

Neo.setupClass(TextField);

export default TextField;
