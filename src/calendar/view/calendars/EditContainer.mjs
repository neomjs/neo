import Button        from '../../../button/Base.mjs';
import ColorsList    from './ColorsList.mjs';
import FormContainer from '../../../form/Container.mjs';
import TextField     from '../../../form/field/Text.mjs';

/**
 * @class Neo.calendar.view.calendars.EditContainer
 * @extends Neo.form.Container
 */
class EditContainer extends FormContainer {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.calendars.EditContainer'
         * @protected
         */
        className: 'Neo.calendar.view.calendars.EditContainer',
        /**
         * @member {String[]} baseCls=['neo-calendar-edit-container']
         */
        baseCls: ['neo-calendar-edit-container'],
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
         * @member {Neo.calendar.view.MainContainer|null} owner=null
         */
        owner: null,
        /**
         * @member {Neo.calendar.model.Calendar|null} record_=null
         */
        record_: null,
        /**
         * @member {Number|null} unMountTimeoutId=null
         * @protected
         */
        unMountTimeoutId: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

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

        value && this.getField('name').then(field => {
            field.focus()
        })
    }

    /**
     * Triggered after the record config got changed
     * @param {Neo.calendar.model.Calendar} value
     * @param {Neo.calendar.model.Calendar} oldValue
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
     * Triggered before the record config gets changed
     * We need the before method to also get clicks on the same edit icon,
     * since it does trigger for not changed values.
     * @param {Neo.calendar.model.Calendar} value
     * @param {Neo.calendar.model.Calendar} oldValue
     * @protected
     */
    beforeSetRecord(value, oldValue) {
        let me = this;

        if (me.unMountTimeoutId) {
            clearTimeout(me.unMountTimeoutId);
            me.unMountTimeoutId = null;
        }

        return value;
    }

    /**
     *
     */
    createItems() {
        let me       = this,
            {record} = me;

        if (record) {
            me.colorsList = Neo.create({
                module      : ColorsList,
                appName     : me.appName,
                listeners   : {change: me.onColorChange, scope: me},
                parentId    : me.parentId,
                value       : record.color,
                wrapperStyle: {marginTop: '0.2em'},
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
            me.colorsList, {
                module : Button,
                cls    : ['neo-red'],
                handler: me.onDeleteButtonClick.bind(me),
                iconCls: 'fas fa-trash-alt',
                style  : {marginTop: '3em'},
                text   : 'Delete'
            }];

            super.createItems();
        }
    }

    /**
     * @param {Object} data
     * @param {Object} data.record
     */
    onColorChange(data) {
        this.record.color = data.record.name;
    }

    /**
     * @param {Object} data
     */
    onDeleteButtonClick(data) {
        let me = this;

        // todo: we could add a confirm dialog

        me.getModel().getStore('calendars').remove(me.record);
        me.unmount();
    }

    /**
     * @param {Object} [data]
     */
    onFocusLeave(data) {
        let me = this;

        // we need a short delay to get record-changes (clicking on another edit icon)
        me.unMountTimeoutId = setTimeout(() => {
            me.unMountTimeoutId = null;
            me.mounted && me.unmount();
        }, 200);
    }

    /**
     * @param {Object} data
     */
    onNameFieldChange(data) {
        if (!Neo.isEmpty(data.value)) {
            this.record.name = data.value;
        }
    }
}

export default Neo.setupClass(EditContainer);
