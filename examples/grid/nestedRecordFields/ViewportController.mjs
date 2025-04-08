import Component from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.grid.nestedRecordFields.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.nestedRecordFields.ViewportController'
         * @protected
         */
        className: 'Neo.examples.grid.nestedRecordFields.ViewportController'
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
     * @param {Record[]} items
     */
    onCountryStoreLoad(items) {
        let me        = this,
            mainStore = me.getStore('mainStore'),
            country;

        // if the main table store is already loaded, the country field renderer had no data
        if (mainStore.getCount() > 0) {
            mainStore.items.forEach(record => {
                country = record.country;

                // hack resetting the current value to get a new record change
                record.toJSON().country = null;

                record.country = country
            })
        }
    }

    /**
     * @param {Object} data
     */
    onSwitchDragModeButtonClick(data) {
        let button     = data.component,
            grid       = this.getReference('grid'),
            {sortZone} = grid.headerToolbar;

        if (button.iconCls === 'fas fa-check') {
            button.set({iconCls: 'far fa-square'});
            sortZone.moveColumnContent = true
        } else {
            button.set({iconCls: 'fas fa-check'});
            sortZone.moveColumnContent = false
        }
    }

    /**
     * @param {Object} data
     */
    onSwitchThemeButtonClick(data) {
        let me          = this,
            button      = data.component,
            isDarkTheme = me.theme !== 'neo-theme-light',
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

export default Neo.setupClass(ViewportController);
