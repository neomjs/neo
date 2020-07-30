import {default as CheckBoxField} from '../../../form/field/CheckBox.mjs';
import {default as Container}     from '../../../container/Base.mjs';

/**
 * @class Neo.calendar.view.settings.MonthContainer
 * @extends Neo.container.Base
 */
class MonthContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.settings.MonthContainer'
         * @protected
         */
        className: 'Neo.calendar.view.settings.MonthContainer',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }}

    /**
     *
     * @param config
     */
    constructor(config) {
        super(config);

        let me             = this,
            monthComponent = me.getMonthComponent();

        me.items = [{
            module    : CheckBoxField,
            checked   : monthComponent.useScrollBoxShadows,
            flex      : 'none',
            labelText : 'useScrollBoxShadows',
            labelWidth: 170,
            listeners : {change: me.onConfigChange, scope: me},
            name      : 'useScrollBoxShadows'
        }];
    }

    /**
     *
     * @return {Neo.calendar.view.MonthComponent}
     */
    getMonthComponent() {
        return this.up('calendar-maincontainer').monthComponent;
    }

    /**
     *
     * @param {Object} data
     */
    onConfigChange(data) {
        this.getMonthComponent()[data.component.name] = data.value;
    }
}

Neo.applyClassConfig(MonthContainer);

export {MonthContainer as default};