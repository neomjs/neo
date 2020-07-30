import {default as CheckBoxField} from '../../../form/field/CheckBox.mjs';
import {default as Container}     from '../../../container/Base.mjs';
import {default as RadioField}    from '../../../form/field/Radio.mjs';

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
        this.createItems();
    }

    /**
     *
     */
    createItems() {
        let me             = this,
            labelWidth     = 140,
            monthComponent = me.getMonthComponent();

        me.items = [{
            module        : RadioField,
            checked       : monthComponent.dayNameFormat === 'narrow',
            fieldValue    : 'narrow',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : 'dayNameFormat',
            labelWidth    : labelWidth,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'cm_dayNameFormat',
            valueLabelText: 'narrow'
        }, {
            module        : RadioField,
            checked       : monthComponent.dayNameFormat === 'short',
            fieldValue    : 'short',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : labelWidth,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'cm_dayNameFormat',
            style         : {marginTop: '5px'},
            valueLabelText: 'short'
        }, {
            module        : RadioField,
            checked       : monthComponent.dayNameFormat === 'long',
            fieldValue    : 'long',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : labelWidth,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'cm_dayNameFormat',
            style         : {marginTop: '5px'},
            valueLabelText: 'long'
        }, {
            module        : RadioField,
            checked       : monthComponent.monthNameFormat === 'short',
            fieldValue    : 'short',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : 'monthNameFormat',
            labelWidth    : labelWidth,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'cm_monthNameFormat',
            style         : {marginTop: '10px'},
            valueLabelText: 'short'
        }, {
            module        : RadioField,
            checked       : monthComponent.monthNameFormat === 'long',
            fieldValue    : 'long',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : labelWidth,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'cm_monthNameFormat',
            style         : {marginTop: '5px'},
            valueLabelText: 'long'
        }, {
            module        : CheckBoxField,
            checked       : monthComponent.useScrollBoxShadows,
            flex          : 'none',
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onConfigChange, scope: me},
            name          : 'useScrollBoxShadows',
            style         : {marginTop: '10px'},
            valueLabelText: 'useScrollBoxShadows'
        }];

        super.createItems();
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

    /**
     *
     * @param {Object} data
     */
    onRadioChange(data) {
        if (data.value) {
            let name = data.component.name;

            if (name.startsWith('cm_')) {
                name = name.substring(3);
            }

            this.getMonthComponent()[name] = data.component.fieldValue;
        }
    }
}

Neo.applyClassConfig(MonthContainer);

export {MonthContainer as default};