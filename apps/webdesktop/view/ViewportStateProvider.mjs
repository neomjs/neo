import Accounts      from '../store/Accounts.mjs';
import Apps          from '../store/Apps.mjs';
import Files         from '../store/Files.mjs';
import Permissions   from '../store/Permissions.mjs';
import StateProvider from '../../../src/state/Provider.mjs';

/**
 * @summary The desktop's one source of state: who signed in, and which permission keys they hold.
 *
 * `permissions` decides everything the account sees. The provider writes it into the apps store's permission filter
 * (`onDataPropertyChange()`); the launcher and every start-menu level are bound to that store and follow. No view reads
 * a permission key to decide whether an app shows.
 * @class WebDesktop.view.ViewportStateProvider
 * @extends Neo.state.Provider
 */
class ViewportStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.ViewportStateProvider'
         * @protected
         */
        className: 'WebDesktop.view.ViewportStateProvider',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * The signed-in account record, null while signed out
             * @member {WebDesktop.model.Account|null} data.account=null
             */
            account: null,
            /**
             * The granted permission keys
             * @member {String[]} data.permissions=[]
             */
            permissions: [],
            /**
             * True shows the panel that simulates the backend changing permissions
             * @member {Boolean} data.permissionsPanel=false
             */
            permissionsPanel: false,
            /**
             * The viewport's theme. The controller writes it with the viewport (`setTheme()`), and the taskbar's theme
             * button and the Settings app read it.
             * @member {String|null} data.theme=null
             */
            theme: null
        },
        /**
         * `documents` and `recycleBin` live here, not in their apps' views: deleting and restoring move a file between
         * two windows that each load on their first open
         * @member {Object} stores
         */
        stores: {
            accounts   : Accounts,
            apps       : Apps,
            documents  : {module: Files, responseRoot: 'documents', filters: [{property: 'folder', value: null}]},
            permissions: Permissions,
            recycleBin : {module: Files, responseRoot: 'recycleBin'}
        }
    }

    /**
     * Mirrors the granted keys into the apps store's filter, the app's only visibility rule.
     * @param {String} key
     * @param {*}      value
     * @param {*}      oldValue
     */
    onDataPropertyChange(key, value, oldValue) {
        super.onDataPropertyChange(key, value, oldValue);

        if (key === 'permissions') {
            this.getStore('apps').getFilter('permission').value = value
        }
    }
}

export default Neo.setupClass(ViewportStateProvider);
