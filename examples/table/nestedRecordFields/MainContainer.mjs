import Button             from '../../../src/button/Base.mjs';
import MainContainerModel from './MainContainerModel.mjs';
import TableContainer     from '../../../src/table/Container.mjs';
import Viewport           from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.table.nestedRecordFields.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.table.nestedRecordFields.MainContainer'
         * @protected
         */
        className: 'Neo.examples.table.nestedRecordFields.MainContainer',
        /**
         * @member {Object|String} layout='fit'
         */
        layout: 'fit',
        /**
         * @member {Neo.model.Component} model=MainContainerModel
         */
        model: MainContainerModel,
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: TableContainer,
            bind  : {store : 'stores.mainStore'},

            columns: [
                {dataField: 'user.firstname', text: 'Firstname'},
                {dataField: 'user.lastname',  text: 'Lastname'},
                {dataField: 'githubId',       text: 'Github Id'},
                {dataField: 'country',        text: 'Country',     renderer: 'up.countryRenderer'},
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
    countryRenderer({record}) {
        let countryStore = this.getModel().getStore('countries');

        if (countryStore.getCount() > 0) {
            return countryStore.get(record.country).name
        }

        return ''
    }

    /**
     * @param {Object} data
     */
    editButtonHandler(data) {
        let me                          = this,
            button                      = data.component,
            {appName, dialog, windowId} = me,
            {record}                    = button;

        if (!dialog) {
            import('./EditUserDialog.mjs').then(module => {
                me.dialog = Neo.create({
                    module         : module.default,
                    animateTargetId: button.id,
                    appName,
                    model          : {parent: me.getModel()},
                    record,
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

        return button.vdom
    }
}

export default Neo.setupClass(MainContainer);
