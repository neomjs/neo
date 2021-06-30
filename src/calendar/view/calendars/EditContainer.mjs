import ColorsList    from './ColorsList.mjs';
import FormContainer from '../../../form/Container.mjs';
import TextField     from '../../../form/field/Text.mjs';

/**
 * @class Neo.calendar.view.calendars.EditContainer
 * @extends Neo.form.Container
 */
class EditContainer extends FormContainer {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.calendars.EditContainer'
         * @protected
         */
        className: 'Neo.calendar.view.calendars.EditContainer',
        /**
         * @member {String} ntype='calendar-edit-container'
         * @protected
         */
        ntype: 'calendar-edit-container',
        /**
         * @member {String[]} cls=['neo-calendar-edit-container']
         */
        cls: ['neo-calendar-edit-container'],
        /**
         * @member {Neo.calendar.view.calendars.ColorsList|null} colorsList=null
         */
        colorsList: null,
        /**
         * @member {Object|null} colorsListConfig=null
         */
        colorsListConfig: null,
        /**
         * @member {Object|null} nameFieldConfig=null
         */
        nameFieldConfig: null,
        /**
         * @member {Neo.calendar.view.week.Component|null} owner=null
         */
        owner: null,
        /**
         * @member {Neo.calendar.model.Calendar|null} record_=null
         */
        record_: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        // focus trap, see: https://github.com/neomjs/neo/issues/2306
        this.vdom.tabIndex = -1;
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value) {
            this.getField('name').focus();
        }
    }

    /**
     * Triggered after the record config got changed
     * @param {Neo.calendar.model.Event} value
     * @param {Neo.calendar.model.Event} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        let me = this;

        if (value && oldValue) {
            me.reset({
                name: value.name
            });

            me.colorsList.value = value.color;
        } else if (value) {
            me.createItems();
        }
    }

    /**
     *
     */
    createItems() {
        let me     = this,
            record = me.record;

        if (record) {
            me.colorsList = Neo.create({
                module   : ColorsList,
                appName  : me.appName,
                listeners: {change: me.onColorChange, scope: me},
                parentId : me.parentId,
                style    : {marginTop: '0.5em'},
                value    : record.color,
                ...me.colorsListConfig
            });

            me.items = [{
                module              : TextField,
                clearToOriginalValue: true,
                flex                : 'none',
                labelPosition       : 'inline',
                labelText           : 'Calendar Name',
                listeners           : {change: me.onNameFieldChange, scope: me},
                name                : 'name',
                required            : true,
                value               : record.name,
                ...me.nameFieldConfig
            },
            me.colorsList];

            super.createItems();
        }
    }

    /**
     *
     * @param {Object} data
     */
    onFocusLeave(data) {
        // todo: only unmount if not getting assigned to a new record

        // we need a short delay, since a TimeField picker could be open
        setTimeout(() => {
           this.unmount();
        }, 100)
    }

    /**
     *
     * @param {Object} data
     * @param {Object} data.record
     */
    onColorChange(data) {
        this.record.color = data.record.name;
    }

    /**
     *
     * @param {Object} data
     */
    onNameFieldChange(data) {
        if (!Neo.isEmpty(data.value)) {
            this.record.name = data.value;
        }
    }
}

Neo.applyClassConfig(EditContainer);

export {EditContainer as default};
