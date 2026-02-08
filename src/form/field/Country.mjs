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
         * @member {Number} pickerWidth=200
         */
        pickerWidth: 300,
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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me           = this,
            inputWrapper = VDomUtil.find(me.vdom, me.getInputWrapperId());

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
    }

    /**
     * Triggered after the showFlags config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowFlags(value, oldValue) {
        let me       = this,
            flagIcon = VDomUtil.find(me.vdom, me.getFlagIconId());

        if (flagIcon) {
            flagIcon.vdom.removeDom = !value;
            me.update()
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

        let me = this;

        if (me.showFlags) {
            let flagIcon = VDomUtil.find(me.vdom, me.getFlagIconId()),
                flagUrl  = CountryFlags.getFlagUrl(value);

            if (flagIcon) {
                if (Neo.isRecord(value)) {
                    value = value.code
                }

                if (value && flagUrl) {
                    flagIcon.vdom.src       = flagUrl;
                    flagIcon.vdom.removeDom = false
                } else {
                    flagIcon.vdom.src       = '';
                    flagIcon.vdom.removeDom = true
                }

                me.update()
            }
        }
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
     * Triggered before the zipCodeField config gets changed
     * @param {Neo.form.field.Base|String|null} value
     * @param {Neo.form.field.Base|String|null} oldValue
     * @returns {Neo.form.field.Base|null}
     * @protected
     */
    beforeSetZipCodeField(value, oldValue) {
        let me = this;

        if (Neo.isString(value)) {
            return me.up().getReference(value)
        }

        return value
    }

    /**
     * @returns {String}
     */
    getFlagIconId() {
        return `${this.id}__flag-icon`
    }
}

export default Neo.setupClass(Country);
