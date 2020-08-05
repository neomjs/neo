import {default as CheckBoxField} from '../../../form/field/CheckBox.mjs';
import {default as Container}   from '../../../container/Base.mjs';
import {default as NumberField} from '../../../form/field/Number.mjs';
import {default as RadioField}  from '../../../form/field/Radio.mjs';

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
        this.createItems();
    }

    /**
     *
     */
    createItems() {
        let me       = this,
            calendar = me.up('calendar-maincontainer');

        me.items = [{
            module    : NumberField,
            clearable : true,
            flex      : 'none',
            labelText : 'baseFontSize',
            labelWidth: 110,
            listeners : {change: me.onConfigChange, scope: me},
            maxValue  : 20,
            minValue  : 10,
            name      : 'baseFontSize',
            value     : calendar.baseFontSize
        }, {
            module        : RadioField,
            checked       : calendar.locale === 'default',
            fieldValue    : 'default',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : 'locale',
            labelWidth    : 110,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'locale',
            style         : {marginTop: '5px'},
            valueLabelText: 'default'
        }, {
            module        : RadioField,
            checked       : calendar.locale === 'de-DE',
            fieldValue    : 'de-DE',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 110,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'locale',
            style         : {marginTop: '5px'},
            valueLabelText: 'de-DE'
        }, {
            module        : RadioField,
            checked       : calendar.locale === 'en-US',
            fieldValue    : 'en-US',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 110,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'locale',
            style         : {marginTop: '5px'},
            valueLabelText: 'en-US'
        }, {
            module        : RadioField,
            checked       : calendar.locale === 'es-ES',
            fieldValue    : 'es-ES',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 110,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'locale',
            style         : {marginTop: '5px'},
            valueLabelText: 'es-ES'
        }, {
            module        : RadioField,
            checked       : calendar.locale === 'fr-FR',
            fieldValue    : 'fr-FR',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 110,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'locale',
            style         : {marginTop: '5px'},
            valueLabelText: 'fr-FR'
        }, {
            module        : RadioField,
            checked       : calendar.weekStartDay === 0,
            fieldValue    : 0,
            flex          : 'none',
            hideValueLabel: false,
            labelText     : 'weekStartDay',
            labelWidth    : 110,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'weekStartDay',
            style         : {marginTop: '10px'},
            valueLabelText: 'Sunday'
        }, {
            module        : RadioField,
            checked       : calendar.weekStartDay === 1,
            fieldValue    : 1,
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 110,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'weekStartDay',
            style         : {marginTop: '5px'},
            valueLabelText: 'Monday'
        }, {
            module        : CheckBoxField,
            checked       : calendar.showWeekends,
            flex          : 'none',
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange, scope: me},
            name          : 'showWeekends',
            style         : {marginTop: '10px'},
            valueLabelText: 'showWeekends'
        }, {
            module        : CheckBoxField,
            checked       : calendar.scrollNewYearFromTop,
            flex          : 'none',
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange, scope: me},
            name          : 'scrollNewYearFromTop',
            style         : {marginTop: '10px'},
            valueLabelText: 'scrollNewYearFromTop'
        }];

        super.createItems();
    }

    /**
     *
     * @param {Object} data
     */
    onConfigChange(data) {
        this.up('calendar-maincontainer')[data.component.name] = data.value;
    }

    /**
     *
     * @param {Object} data
     */
    onRadioChange(data) {
        if (data.value) {
            this.up('calendar-maincontainer')[data.component.name] = data.component.fieldValue;
        }
    }
}

Neo.applyClassConfig(GeneralContainer);

export {GeneralContainer as default};