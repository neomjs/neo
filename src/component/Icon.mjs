import Component from './Base.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @class Neo.component.Icon
 * @extends Neo.component.Base
 */
class Icon extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.Icon'
         * @protected
         */
        className: 'Neo.component.Icon',
        /**
         * @member {String} ntype='icon'
         * @protected
         */
        ntype: 'icon',
        /**
         * @member {String[]} baseCls=['neo-icon']
         */
        baseCls: ['neo-icon'],
        /**
         * @member {String|null} cellIconCls_=null
         * @reactive
         */
        cellIconCls_: null,
        /**
         * @member {String} tag='i'
         */
        tag: 'i'
    }

    /**
     * Triggered after the cellIconCls config got changed
     * @param {String|String[]|null} value
     * @param {String|String[]|null} oldValue
     */
    afterSetCellIconCls(value, oldValue) {
        let cls = this.cls;

        NeoArray.removeAdd(cls, oldValue, value);

        this.cls = cls
    }

    /**
     * Triggered before the cellIconCls config gets changed. Converts the string into an array if needed.
     * @param {Array|String|null} value    The new value of the cellIconCls config.
     * @param {Array|String|null} oldValue The old value of the cellIconCls config.
     * @returns {Array}
     * @protected
     */
    beforeSetCellIconCls(value, oldValue) {
        if (value && !Array.isArray(value)) {
            value = value.split(' ').filter(Boolean)
        }

        return value
    }
}

export default Neo.setupClass(Icon);
