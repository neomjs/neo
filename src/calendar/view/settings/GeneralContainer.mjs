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

        let me = this;

        me.items = [{
            module        : RadioField,
            checked       : true,
            flex          : 'none',
            hideValueLabel: false,
            labelText     : 'weekStartDay',
            labelWidth    : 110,
            name          : 'weekStartDay',
            valueLabelText: 'Sunday'
        }, {
            module        : RadioField,
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 110,
            name          : 'weekStartDay',
            style         : {marginTop: '5px'},
            valueLabelText: 'Monday'
        }];
    }
}

Neo.applyClassConfig(GeneralContainer);

export {GeneralContainer as default};