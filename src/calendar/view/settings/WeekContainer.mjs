import {default as Container}  from '../../../container/Base.mjs';
import {default as RadioField} from '../../../form/field/Radio.mjs';

/**
 * @class Neo.calendar.view.settings.WeekContainer
 * @extends Neo.container.Base
 */
class WeekContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.settings.WeekContainer'
         * @protected
         */
        className: 'Neo.calendar.view.settings.WeekContainer',
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
            weekComponent = me.getWeekComponent();

        me.items = [{
            module        : RadioField,
            checked       : weekComponent.timeAxisPosition === 'start',
            fieldValue    : 'start',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : 'timeAxisPosition',
            labelWidth    : 130,
            name          : 'timeAxisPosition',
            valueLabelText: 'start',

            listeners: {
                change: me.onTimeAxisPositionChange,
                scope : me
            }
        }, {
            module        : RadioField,
            checked       : weekComponent.timeAxisPosition === 'end',
            fieldValue    : 'end',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 130,
            name          : 'timeAxisPosition',
            style         : {marginTop: '5px'},
            valueLabelText: 'end',

            listeners: {
                change: me.onTimeAxisPositionChange,
                scope : me
            }
        }];
    }

    /**
     *
     * @return {Neo.calendar.view.WeekComponent}
     */
    getWeekComponent() {
        return this.up('calendar-maincontainer').weekComponent;
    }

    /**
     *
     * @param opts
     */
    onTimeAxisPositionChange(opts) {
        if (opts.value) {
            this.getWeekComponent().timeAxisPosition = opts.component.fieldValue;
        }
    }
}

Neo.applyClassConfig(WeekContainer);

export {WeekContainer as default};