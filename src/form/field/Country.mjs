import ComboBox from './ComboBox.mjs';
import CountryFlags from '../../util/CountryFlags.mjs';
import CountryList from '../../list/Country.mjs';
import VDomUtil from '../../util/VDom.mjs';

/**
 * @class Neo.form.field.Country
 * @extends Neo.form.field.ComboBox
 */
class Country extends ComboBox {
    static config = {
        /**
         * @member {String} className='Neo.form.field.Country'
         * @protected
         */
        className: 'Neo.form.field.Country',
        /**
         * @member {String} ntype='countryfield'
         * @protected
         */
        ntype: 'countryfield',
        /**
         * @member {String[]} baseCls=['neo-countryfield','neo-combobox','neo-pickerfield','neo-textfield']
         */
        baseCls: ['neo-countryfield', 'neo-combobox', 'neo-pickerfield', 'neo-textfield'],
        /**
         * @member {Boolean} showFlags_=false
         * @reactive
         */
        showFlags_: false,
        /**
         * @member {Object} store
         */
        store: {
            data       : CountryFlags.countries,
            keyProperty: 'code',
            model      : {
                fields: [
                    {name: 'name', type: 'String'},
                    {name: 'code', type: 'String'}
                ]
            },
            sorters: [{
                property : 'name',
                direction: 'ASC'
            }]
        },
        /**
         * @member {String} valueField='name'
         */
        valueField: 'name',
        /**
         * You can either pass a field instance or a field reference
         * @member {Neo.form.field.Base|String|null} zipCodeField_=null
         * @reactive
         */
        zipCodeField_: null
    }

    /**
     * Triggered after the triggers config got changed
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetTriggers(value, oldValue) {
        super.afterSetTriggers(value, oldValue);

        let me           = this,
            inputWrapper = VDomUtil.find(me.vdom, me.getInputWrapperId());

        if (inputWrapper) {
            inputWrapper.vdom.cn.unshift({
                cls      : 'neo-country-flag-icon',
                id       : me.getFlagIconId(),
                tag      : 'img',
                removeDom: true,
                style: {
                    height : '15px',
                    width  : '15px',
                    margin : 'auto 5px auto 5px'
                }
            });

            me.updateFlag()
        }
    }

    /**
     * Triggered after the value config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @param {Boolean} [preventFilter=false]
     * @protected
     */
    afterSetValue(value, oldValue, preventFilter=false) {
        super.afterSetValue(value, oldValue, preventFilter);
        this.updateFlag()
    }

    /**
     * Triggered after the zipCodeField config got changed
     * @param {Neo.form.field.Base|null} value
     * @param {Neo.form.field.Base|null} oldValue
     * @protected
     */
    afterSetZipCodeField(value, oldValue) {
        if (value && value instanceof Neo.form.field.Base) {
            value.countryField = this
        }
    }

    /**
     * Triggered before the showFlags config gets changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    beforeSetShowFlags(value, oldValue) {
        if (value) {
            this.listConfig = {module: CountryList, ...this.listConfig}
        }

        return value
    }

    /**
     * Triggered after the showFlags config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowFlags(value, oldValue) {
        this.updateFlag()
    }

    /**
     *
     */
    updateFlag() {
        let me       = this,
            flagIcon = VDomUtil.find(me.vdom, me.getFlagIconId()),
            flagUrl, value;

        if (flagIcon) {
            value   = me.value;
            flagUrl = me.showFlags ? CountryFlags.getFlagUrl(Neo.isRecord(value) ? value.code : value) : null;

            if (flagUrl) {
                flagIcon.vdom.src       = flagUrl;
                flagIcon.vdom.removeDom = false
            } else {
                flagIcon.vdom.removeDom = true
            }

            me.update()
        }
    }

    /**
     * @returns {String}
     */
    getFlagIconId() {
        return `${this.id}__flag-icon`
    }
}

export default Neo.setupClass(Country);
