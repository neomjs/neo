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
        }, {
            module        : RadioField,
            checked       : monthComponent.dayNameFormat === 'narrow',
            fieldValue    : 'narrow',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : 'dayNameFormat',
            labelWidth    : 170,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'dayNameFormat',
            style         : {marginTop: '10px'},
            valueLabelText: 'narrow'
        }, {
            module        : RadioField,
            checked       : monthComponent.dayNameFormat === 'short',
            fieldValue    : 'short',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 170,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'dayNameFormat',
            style         : {marginTop: '5px'},
            valueLabelText: 'short'
        }, {
            module        : RadioField,
            checked       : monthComponent.dayNameFormat === 'long',
            fieldValue    : 'long',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 170,
            listeners     : {change: me.onRadioChange, scope: me},
            name          : 'dayNameFormat',
            style         : {marginTop: '5px'},
            valueLabelText: 'long'
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

    /**
     *
     * @param {Object} data
     */
    onRadioChange(data) {
        if (data.value) {
            this.getMonthComponent()[data.component.name] = data.component.fieldValue;
        }
    }
}

Neo.applyClassConfig(MonthContainer);

export {MonthContainer as default};