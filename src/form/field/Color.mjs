import ColorList from '../../list/Color.mjs'
import ComboBox  from './ComboBox.mjs';
import VDomUtil  from '../../util/VDom.mjs';

/**
 * @class Neo.form.field.Color
 * @extends Neo.form.field.ComboBox
 */
class Color extends ComboBox {
    static config = {
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
         * @member {String[]} baseCls=['neo-colorfield','neo-combobox','neo-pickerfield','neo-textfield']
         */
        baseCls: ['neo-colorfield', 'neo-combobox', 'neo-pickerfield', 'neo-textfield'],
        /**
         * The data.Model field which contains the color value
         * @member {String} colorField='name'
         */
        colorField: 'name',
        /**
         * Override the formatter to apply a custom background-color styling.
         * E.g. using CSS vars for different themes
         * @member {Function} colorField=(scope,data)=>data[scope.colorField]
         */
        colorFormatter: (scope,data) => data[scope.colorField],
        /**
         * @member {Object|null} listConfig
         */
        listConfig: {
            module            : ColorList,
            colorField        : '@config:colorField',
            colorFormatter    : '@config:colorFormatter',
            silentSelectUpdate: true
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me           = this,
            inputWrapper = VDomUtil.find(me.vdom, me.getInputWrapperId());

        inputWrapper.vdom.cn.unshift({
            cls  : 'neo-color',
            id   : me.getColorIndicatorId(),
            style: {
                backgroundColor: me.getColor()
            }
        });

        me.update()
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
            colorIndicator = VDomUtil.find(me.vdom, me.getColorIndicatorId())?.vdom,
            {list, record} = me,
            selectionModel = me.list?.selectionModel;

        if (colorIndicator) {
            colorIndicator.style.backgroundColor = me.getColor()
        }

        if (record) {
            selectionModel?.select(list.getItemId(record[me.store.keyProperty]))
        } else {
            selectionModel?.deselectAll(true)
        }

        // the super call will trigger the vdom update
        super.afterSetValue(value, oldValue, preventFilter)
    }

    /**
     * @returns {String}
     */
    getColor() {
        let me                  = this,
            {inputValue, value} = me;

        return value ? me.colorFormatter(me, value) : me.forceSelection ? null : inputValue
    }

    /**
     * @returns {String}
     */
    getColorIndicatorId() {
        return `${this.id}__color-indicator`
    }

    /**
     * @protected
     */
    onSelectPostLastItem() {
        let {list} = this,
            index  = list.store.getCount() - 1;

        list.vdom.cn[index] = list.createItem(list.store.getAt(index), index);

        super.onSelectPostLastItem()
    }

    /**
     * @protected
     */
    onSelectPreFirstItem() {
        let {list} = this;

        list.vdom.cn[0] = list.createItem(list.store.getAt(0), 0);

        super.onSelectPreFirstItem()
    }
}

export default Neo.setupClass(Color);
