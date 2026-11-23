import App from '../../../src/desktop/model/App.mjs';

/**
 * @summary One launchable app, or a group of apps, in the desktop's navigation tree: the engine's app with the
 * permission key that grants it.
 *
 * A group names no permission: the apps store's filter keeps a group exactly when it keeps one of the group's apps
 * (`Neo.data.TreeStore` ancestor preservation), so a group needs no rule of its own and never shows up empty. A group
 * that matched the filter itself would keep its whole subtree, which is why groups carry no permission.
 * @class WebDesktop.model.App
 * @extends Neo.desktop.model.App
 */
class WebDesktopApp extends App {
    static config = {
        /**
         * @member {String} className='WebDesktop.model.App'
         * @protected
         */
        className: 'WebDesktop.model.App',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'permission',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(WebDesktopApp);
