import {default as Container}  from '../../../container/Base.mjs';
import {default as RadioField} from '../../../form/field/Radio.mjs';

/**
 * @class Neo.calendar.view.settings.GeneralContainer
 * @extends Neo.container.Base
 */
class GeneralContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.settings.GeneralContainer'
         * @protected
         */
        className: 'Neo.calendar.view.settings.GeneralContainer',
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

        let me       = this,
            calendar = me.up('calendar-maincontainer');

        me.items = [{
            module        : RadioField,
            checked       : calendar.weekStartDay === 0,
            fieldValue    : 0,
            flex          : 'none',
            hideValueLabel: false,
            labelText     : 'weekStartDay',
            labelWidth    : 110,
            listeners     : {change: me.onWeekStartDayChange, scope: me},
            name          : 'weekStartDay',
            valueLabelText: 'Sunday'
        }, {
            module        : RadioField,
            checked       : calendar.weekStartDay === 1,
            fieldValue    : 1,
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 110,
            listeners     : {change: me.onWeekStartDayChange, scope: me},
            name          : 'weekStartDay',
            style         : {marginTop: '5px'},
            valueLabelText: 'Monday'
        }];
    }

    /**
     *
     * @param opts
     */
    onWeekStartDayChange(opts) {
        if (opts.value) {
            this.up('calendar-maincontainer').weekStartDay = opts.component.fieldValue;
        }
    }
}

Neo.applyClassConfig(GeneralContainer);

export {GeneralContainer as default};