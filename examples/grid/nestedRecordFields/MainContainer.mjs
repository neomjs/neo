import Button                     from '../../../src/button/Base.mjs';
import GridContainer              from '../../../src/grid/Container.mjs';
import MainContainerStateProvider from './MainContainerStateProvider.mjs';
import Viewport                   from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.grid.nestedRecordFields.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.nestedRecordFields.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.nestedRecordFields.MainContainer',
        /**
         * @member {Object|String} layout='fit'
         */
        layout: 'fit',
        /**
         * @member {Neo.state.Provider} stateProvider=MainContainerStateProvider
         */
        stateProvider: MainContainerStateProvider,
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: GridContainer,
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
                    stateProvider  : {parent: me.getStateProvider()},
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

        me.view.updateDepth = -1;

        return button.createVdomReference()
    }
}

export default Neo.setupClass(MainContainer);
