import {default as CheckBoxField} from '../../../form/field/CheckBox.mjs';
import {default as Container}     from '../../../container/Base.mjs';

/**
 * @class Neo.calendar.view.settings.YearContainer
 * @extends Neo.container.Base
 */
class YearContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.settings.YearContainer'
         * @protected
         */
        className: 'Neo.calendar.view.settings.YearContainer',
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

        let me            = this,
            yearComponent = me.getYearComponent();

        me.items = [{
            module    : CheckBoxField,
            checked   : yearComponent.showWeekNumber,
            flex      : 'none',
            labelText : 'Show WeekNumber',
            labelWidth: 150,
            listeners : {change: me.onShowWeekNumberChange, scope: me},
            name      : 'showWeekNumber'
        }];
    }

    /**
     *
     * @return {Neo.calendar.view.WeekComponent}
     */
    getYearComponent() {
        return this.up('calendar-maincontainer').yearComponent;
    }

    /**
     *
     * @param opts
     */
    onShowWeekNumberChange(opts) {
        this.getYearComponent().showWeekNumber = opts.value;
    }
}

Neo.applyClassConfig(YearContainer);

export {YearContainer as default};