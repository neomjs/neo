import Component         from '../../../src/controller/Component.mjs';
import Toast             from '../../../src/component/Toast.mjs';
import {INITIAL_RECORDS} from './MainStore.mjs';

/**
 * @summary View controller for the dialog row-editing grid example, managing `EditUserDialog` instantiation,
 * country-name rendering, store reset, column drag mode, and dark/light theme switching.
 * @class Neo.examples.grid.nestedRecordFields.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Component {
    static config = {
        className: 'Neo.examples.grid.nestedRecordFields.ViewportController'
    }

    /**
     * @member {Neo.dialog.Base|null} dialog=null
     */
    dialog = null

    /**
     * Resolves `record['address.country']` ISO codes through `stores.countries`.
     * @param {Object} data
     * @returns {String}
     */
    countryRenderer({gridContainer, record}) {
        let code         = record['address.country'],
            countryStore = gridContainer.getStateProvider().getStore('countries');

        if (countryStore.getCount() > 0) {
            return countryStore.get(code)?.name || code || ''
        }

        return code || ''
    }

    /**
     * @summary Opens the editor for the row represented by the activated Edit button.
     * @param {Object} data
     */
    editButtonHandler(data) {
        const button = data.component;

        return this.openEditor(button.record, button)
    }

    /**
     * @summary Edits the current Grid selection from the compact floating Button.
     * @param {Object} data
     */
    onFloatingEditClick(data) {
        const button   = data.component,
              [record] = this.getReference('grid').view.selectedRecords;

        if (record) {
            return this.openEditor(record, button)
        }

        Neo.toast({
            appName : button.appName,
            msg     : 'Select a row to edit a contact.',
            position: 'bl',
            windowId: button.windowId
        })
    }

    /**
     * @summary Opens the shared contact editor with the actual action as its focus-return target.
     * @param {Neo.data.Record} record
     * @param {Neo.button.Base} opener
     * @protected
     */
    async openEditor(record, opener) {
        const me                  = this,
              {appName, windowId} = opener,
              theme               = me.component.theme || opener.theme;

        if (!me.dialog) {
            const {default: EditUserDialog} = await import('./EditUserDialog.mjs');

            if (!me.dialog) {
                me.dialog = Neo.create({
                    module         : EditUserDialog,
                    animateTargetId: opener.id,
                    appName,
                    record,
                    stateProvider  : {parent: me.getStateProvider()},
                    theme,
                    windowId
                });

                return
            }
        }

        me.dialog.set({animateTargetId: opener.id, record, theme});
        me.dialog.show()
    }

    /**
     * @summary Observes the root viewport theme so the toolbar toggle button and open dialog track the active scheme.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        let me = this;

        me.observeConfig(me.component, 'theme', () => me.syncThemeButton());
        me.syncThemeButton()
    }

    /**
     * Repaints grid rows once `stores.countries` finishes loading so country names replace ISO codes cleanly.
     */
    onCountryStoreLoad() {
        this.getReference('grid')?.body?.createViewData(false, true)
    }

    /**
     * Restores all 28 partner records to their initial unmodified state and closes the dialog if open.
     */
    onResetButtonClick() {
        let me        = this,
            mainStore = me.getStore('mainStore'),
            dragBtn   = me.getReference('drag-mode-button'),
            grid      = me.getReference('grid');

        if (me.dialog && !me.dialog.hidden) {
            me.dialog.hide(false)
        }

        if (mainStore) {
            mainStore.data = [];
            mainStore.data = Neo.clone(INITIAL_RECORDS, true)
        }

        if (dragBtn && grid?.headerToolbar?.sortZone) {
            dragBtn.set({iconCls: 'far fa-square'});
            grid.headerToolbar.sortZone.moveColumnContent = true
        }
    }

    /**
     * Toggles whether dragging a column header moves column cell content live or headers only.
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
     * @summary Switches the viewport and open dialog between `neo-theme-dark` and `neo-theme-light`.
     * @param {Object} data
     */
    onSwitchThemeButtonClick(data) {
        let me          = this,
            button      = data.component,
            isDarkTheme = me.component.getTheme() !== 'neo-theme-light',
            theme       = isDarkTheme ? 'neo-theme-light' : 'neo-theme-dark';

        me.component.theme = theme;

        Neo.toast({
            appName       : button.appName,
            msg           : isDarkTheme ? 'Light Theme' : 'Dark Theme',
            position      : 'tl',
            slideDirection: 'left',
            title         : 'Switched Theme',
            windowId      : button.windowId
        })
    }

    /**
     * @summary Aligns the toolbar theme toggle button and any open dialog with the viewport's current theme.
     */
    syncThemeButton() {
        let me      = this,
            button  = me.getReference('theme-button'),
            theme   = me.component.getTheme(),
            isLight = theme === 'neo-theme-light';

        button?.set({
            iconCls: isLight ? 'fa fa-moon' : 'fas fa-sun',
            text   : isLight ? 'Dark Theme' : 'Light Theme'
        });

        if (me.dialog) {
            me.dialog.theme = theme
        }
    }
}

export default Neo.setupClass(ViewportController);
