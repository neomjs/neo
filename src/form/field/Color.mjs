import ColorList from '../../list/Color.mjs'
import Select    from './Select.mjs';
import VDomUtil  from '../../util/VDom.mjs';

/**
 * @class Neo.form.field.Color
 * @extends Neo.form.field.Select
 */
class Color extends Select {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.form.field.Color'
         * @protected
         */
        className: 'Neo.form.field.Color',
        /**
         * @member {String} ntype='colorfield'
         * @protected
         */
        ntype: 'colorfield',
        /**
         * @member {String[]} cls=['neo-colorfield','neo-selectfield','neo-pickerfield','neo-textfield']
         */
        cls: ['neo-colorfield', 'neo-selectfield', 'neo-pickerfield', 'neo-textfield'],
        /**
         * @member {Object|null} listConfig={module:ColorList}
         */
        listConfig: {
            module: ColorList
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            vdom         = me.vdom,
            inputWrapper = VDomUtil.findVdomChild(vdom, {id: me.getInputWrapperId()});

        inputWrapper.vdom.cn.unshift({
            cls  : 'neo-color',
            id   : me.getColorIndicatorId(),
            style: {
                backgroundColor: 'red'
            }
        });

        me.vdom = vdom;
    }

    /**
     * Triggered after the value config got changed
     * @param {Number|String|null} value
     * @param {Number|String|null} oldValue
     * @param {Boolean} [preventFilter=false]
     * @protected
     */
    afterSetValue(value, oldValue, preventFilter=false) {
        let me             = this,
            vdom           = me.vdom,
            colorIndicator = VDomUtil.findVdomChild(vdom, {id: me.getColorIndicatorId()})?.vdom,
            record         = me.store.get(value);

        if (colorIndicator) {
            colorIndicator.style.backgroundColor = record ? record[me.displayField] : value;
        }

        super.afterSetValue(value, oldValue, preventFilter);
    }

    /**
     *
     * @returns {String}
     */
    getColorIndicatorId() {
        return `${this.id}__color-indicator`;
    }
}

Neo.applyClassConfig(Color);

export {Color as default};
