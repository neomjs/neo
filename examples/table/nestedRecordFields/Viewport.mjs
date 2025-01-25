import BaseViewport          from '../../../src/container/Viewport.mjs';
import Button                from '../../../src/button/Base.mjs';
import TableContainer        from '../../../src/table/Container.mjs';
import ViewportStateProvider from './ViewportStateProvider.mjs';

/**
 * @class Neo.examples.table.nestedRecordFields.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.table.nestedRecordFields.Viewport'
         * @protected
         */
        className: 'Neo.examples.table.nestedRecordFields.Viewport',
        /**
         * @member {Neo.state.Provider} stateProvider=ViewportStateProvider
         */
        stateProvider: ViewportStateProvider,
        /**
         * @member {Object} style={padding:'1em'}
         */
        style: {padding: '1em'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype    : 'toolbar',
            flex     : 'none',
            reference: 'switch-theme-button',
            style    : {marginBottom: '1em'},

            items: ['->', {
                handler: 'up.onSwitchThemeButtonClick',
                iconCls: 'fas fa-moon',
                text   : 'Dark Theme'
            }]
        }, {
            module: TableContainer,
            bind  : {store : 'stores.mainStore'},

            columns: [
                {dataField: 'user.firstname', text: 'Firstname'},
                {dataField: 'user.lastname',  text: 'Lastname'},
                {dataField: 'githubId',       text: 'Github Id'},
                {dataField: 'country',        text: 'Country',     renderer: 'up.countryRenderer'},
                {dataField: 'edit',           text: 'Edit Action', renderer: 'up.editRenderer'}
            ],

            viewConfig: {
                highlightModifiedCells: true
            }
        }]
    }

    /**
     * @member {Neo.dialog.Base|null} dialog=null
     */
    dialog = null

    /**
     * @param {Object} data
     */
    countryRenderer({record}) {
        let countryStore = this.getStateProvider().getStore('countries');

        if (countryStore.getCount() > 0) {
            return countryStore.get(record.country).name
        }

        return ''
    }

    /**
     * @param {Object} data
     */
    editButtonHandler(data) {
        let me       = this,
            button   = data.component,
            {appName, dialog, theme, windowId} = me,
            {record} = button;

        if (!dialog) {
            import('./EditUserDialog.mjs').then(module => {
                me.dialog = Neo.create({
                    module         : module.default,
                    animateTargetId: button.id,
                    appName,
                    stateProvider  : {parent: me.getStateProvider()},
                    record,
                    theme,
                    windowId
                })
            })
        } else {
            dialog.animateTargetId = button.id;
            dialog.record          = record;

            dialog.show()
        }
    }

    /**
     * @param {Object} data
     */
    editRenderer({column, index, record, tableContainer}) {
        let me                  = this,
            {appName, windowId} = me,
            widgetId            = `${column.id}-widget-${index}`,
            button              = (column.widgetMap || (column.widgetMap = {}))[widgetId] || (column.widgetMap[widgetId] = Neo.create({
                module  : Button,
                appName,
                handler : 'up.editButtonHandler',
                parentId: tableContainer.id,
                record,
                text    : 'Edit',
                windowId
            }));

        me.view.updateDepth = -1;

        return button.createVdomReference()
    }

    /**
     * @param {Object} data
     */
    onSwitchThemeButtonClick(data) {
        let me          = this,
            button      = data.component,
            isDarkTheme = me.theme === 'neo-theme-dark',
            theme       = isDarkTheme ? 'neo-theme-light' : 'neo-theme-dark';

        button.set({
            iconCls: isDarkTheme ? 'fa fa-moon' : 'fa fa-sun',
            text   : isDarkTheme ? 'Dark Theme' : 'Light Theme'
        });

        me.theme = theme;

        if (me.dialog) {
            me.dialog.theme = theme
        }
    }
}

export default Neo.setupClass(Viewport);
