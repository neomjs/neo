import Button         from '../../../src/button/Base.mjs';
import MainStore      from './MainStore.mjs';
import TableContainer from '../../../src/table/Container.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.table.nestedRecordFields.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.table.nestedRecordFields.MainContainer',
        layout   : 'fit',
        style    : {padding: '20px'},

        items: [{
            module: TableContainer,
            store : MainStore,

            columns: [
                {dataField: 'user.firstname', text: 'Firstname'},
                {dataField: 'user.lastname',  text: 'Lastname'},
                {dataField: 'githubId',       text: 'Github Id'},
                {dataField: 'country',        text: 'Country'},
                {dataField: 'edit',           text: 'Edit Action', renderer: 'up.editRenderer'}
            ]
        }]
    }

    /**
     * @member {Neo.dialog.Base|null} dialog=null
     */
    dialog = null

    /**
     * @param {Object} data
     */
    editButtonHandler(data) {
        let me       = this,
            button   = data.component,
            {dialog} = me,
            {record} = button;

        if (!dialog) {
            import('./EditUserDialog.mjs').then(module => {
                me.dialog = Neo.create({
                    module         : module.default,
                    animateTargetId: button.id,
                    appName        : me.appName,
                    closeAction    : 'hide',
                    record,
                    windowId       : me.windowId
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
        let me       = this,
            widgetId = `${column.id}-widget-${index}`,
            button   = (column.widgetMap || (column.widgetMap = {}))[widgetId] || (column.widgetMap[widgetId] = Neo.create({
                module  : Button,
                appName : me.appName,
                handler : 'up.editButtonHandler',
                parentId: tableContainer.id,
                record,
                text    : 'Edit',
                windowId: me.windowId
            }));

        return button.vdom
    }
}

export default Neo.setupClass(MainContainer);
