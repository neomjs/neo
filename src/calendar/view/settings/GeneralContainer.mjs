import CheckBoxField from '../../../form/field/CheckBox.mjs';
import Container     from '../../../container/Base.mjs';
import Fieldset      from '../../../form/Fieldset.mjs';
import NumberField   from '../../../form/field/Number.mjs';
import RadioField    from '../../../form/field/Radio.mjs';
import TimeField     from '../../../form/field/Time.mjs';

/**
 * @class Neo.calendar.view.settings.GeneralContainer
 * @extends Neo.container.Base
 */
class GeneralContainer extends Container {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.settings.GeneralContainer'
         * @protected
         */
        className: 'Neo.calendar.view.settings.GeneralContainer',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     *
     */
    createItems() {
        let me       = this,
            calendar = me.up('calendar-maincontainer'),
            data     = me.data;

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
            checked       : data.locale === 'default',
            fieldValue    : 'default',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : 'locale',
            labelWidth    : 110,
            listeners     : {change: me.onRadioDataChange, scope: me},
            name          : 'locale',
            style         : {marginTop: '5px'},
            valueLabelText: 'default'
        }, {
            module        : RadioField,
            checked       : data.locale === 'de-DE',
            fieldValue    : 'de-DE',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 110,
            listeners     : {change: me.onRadioDataChange, scope: me},
            name          : 'locale',
            style         : {marginTop: '5px'},
            valueLabelText: 'de-DE'
        }, {
            module        : RadioField,
            checked       : data.locale === 'en-US',
            fieldValue    : 'en-US',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 110,
            listeners     : {change: me.onRadioDataChange, scope: me},
            name          : 'locale',
            style         : {marginTop: '5px'},
            valueLabelText: 'en-US'
        }, {
            module        : RadioField,
            checked       : data.locale === 'es-ES',
            fieldValue    : 'es-ES',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 110,
            listeners     : {change: me.onRadioDataChange, scope: me},
            name          : 'locale',
            style         : {marginTop: '5px'},
            valueLabelText: 'es-ES'
        }, {
            module        : RadioField,
            checked       : data.locale === 'fr-FR',
            fieldValue    : 'fr-FR',
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 110,
            listeners     : {change: me.onRadioDataChange, scope: me},
            name          : 'locale',
            style         : {marginTop: '5px'},
            valueLabelText: 'fr-FR'
        }, {
            module        : RadioField,
            checked       : data.weekStartDay === 0,
            fieldValue    : 0,
            flex          : 'none',
            hideValueLabel: false,
            labelText     : 'weekStartDay',
            labelWidth    : 110,
            listeners     : {change: me.onRadioDataChange, scope: me},
            name          : 'weekStartDay',
            style         : {marginTop: '10px'},
            valueLabelText: 'Sunday'
        }, {
            module        : RadioField,
            checked       : data.weekStartDay === 1,
            fieldValue    : 1,
            flex          : 'none',
            hideValueLabel: false,
            labelText     : '',
            labelWidth    : 110,
            listeners     : {change: me.onRadioDataChange, scope: me},
            name          : 'weekStartDay',
            style         : {marginTop: '5px'},
            valueLabelText: 'Monday'
        }, {
            module        : CheckBoxField,
            checked       : data.showWeekends,
            flex          : 'none',
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onDataChange, scope: me},
            name          : 'showWeekends',
            style         : {marginTop: '10px'},
            valueLabelText: 'showWeekends'
        }, {
            module        : CheckBoxField,
            checked       : data.scrollNewYearFromTop,
            flex          : 'none',
            hideLabel     : true,
            hideValueLabel: false,
            listeners     : {change: me.onDataChange, scope: me},
            name          : 'scrollNewYearFromTop',
            style         : {marginTop: '10px'},
            valueLabelText: 'scrollNewYearFromTop'
        }, {
            module              : TimeField,
            clearToOriginalValue: true,
            flex                : 'none',
            labelText           : 'startTime',
            labelWidth          : 110,
            listeners           : {change: me.onDataChange, scope: me},
            maxValue            : '10:00',
            minValue            : '00:00',
            name                : 'startTime',
            stepSize            : 60 * 60, // 1h
            style               : {marginTop: '10px'},
            value               : data.startTime,
            width               : '14em'
        }, {
            module              : TimeField,
            clearToOriginalValue: true,
            flex                : 'none',
            labelText           : 'endTime',
            labelWidth          : 110,
            listeners           : {change: me.onDataChange, scope: me},
            maxValue            : '23:00',
            minValue            : '14:00',
            name                : 'endTime',
            stepSize            : 60 * 60, // 1h
            value               : data.endTime !== '24:00' ? data.endTime : null,
            width               : '14em'
        },{
            module: Fieldset,
            flex  : 'none',
            style : {marginTop: '5px'},
            title : 'Event Configs',
            items : [{
                module        : RadioField,
                checked       : data.events.border === 'all-sides',
                fieldValue    : 'all-sides',
                flex          : 'none',
                hideValueLabel: false,
                labelText     : 'Border',
                labelWidth    : 80,
                listeners     : {change: me.onRadioDataChange, scope: me},
                name          : 'events.border',
                valueLabelText: 'All sides'
            }, {
                module        : RadioField,
                checked       : data.events.border === 'left',
                fieldValue    : 'left',
                flex          : 'none',
                hideValueLabel: false,
                labelText     : '',
                labelWidth    : 80,
                listeners     : {change: me.onRadioDataChange, scope: me},
                name          : 'events.border',
                style         : {marginTop: '5px'},
                valueLabelText: 'Left'
            }, {
                module        : RadioField,
                checked       : data.events.border === 'right',
                fieldValue    : 'right',
                flex          : 'none',
                hideValueLabel: false,
                labelText     : '',
                labelWidth    : 80,
                listeners     : {change: me.onRadioDataChange, scope: me},
                name          : 'events.border',
                style         : {marginTop: '5px'},
                valueLabelText: 'Right'
            }, {
                module        : RadioField,
                checked       : data.events.enableResizingAcrossOppositeEdge,
                fieldValue    : true,
                flex          : 'none',
                hideValueLabel: false,
                labelText     : 'Resizing',
                labelWidth    : 80,
                listeners     : {change: me.onRadioDataChange, scope: me},
                name          : 'events.enableResizingAcrossOppositeEdge',
                style         : {marginTop: '15px'},
                valueLabelText: 'X opposite edge'
            }, {
                module        : RadioField,
                checked       : !data.events.enableResizingAcrossOppositeEdge,
                fieldValue    : false,
                flex          : 'none',
                hideValueLabel: false,
                labelText     : '',
                labelWidth    : 80,
                listeners     : {change: me.onRadioDataChange, scope: me},
                name          : 'events.enableResizingAcrossOppositeEdge',
                style         : {marginTop: '5px'},
                valueLabelText: 'Min duration'
            }, {
                module        : CheckBoxField,
                checked       : data.events.enableDrag,
                flex          : 'none',
                hideLabel     : true,
                hideValueLabel: false,
                listeners     : {change: me.onDataChange, scope: me},
                name          : 'events.enableDrag',
                style         : {marginTop: '15px'},
                valueLabelText: 'Enable drag'
            }, {
                module        : CheckBoxField,
                checked       : data.events.enableEdit,
                flex          : 'none',
                hideLabel     : true,
                hideValueLabel: false,
                listeners     : {change: me.onDataChange, scope: me},
                name          : 'events.enableEdit',
                style         : {marginTop: '10px'},
                valueLabelText: 'Enable edit'
            }]
        }];

        super.createItems();
    }

    /**
     * @param {Object} data
     */
    onConfigChange(data) {
        this.up('calendar-maincontainer')[data.component.name] = data.value;
    }

    /**
     * @param {Object} data
     */
    onDataChange(data) {
        this.getModel().setData(data.component.name, data.value);
    }

    /**
     * @param {Object} data
     */
    onRadioDataChange(data) {
        if (data.value) {
            this.getModel().setData(data.component.name, data.component.fieldValue);
        }
    }
}

Neo.setupClass(GeneralContainer);

export default GeneralContainer;
