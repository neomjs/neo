import Controller from '../../../src/controller/Component.mjs';

/**
 * @class DevRank.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    /**
     * Valid values for mainContentLayout
     * @member {String[]} mainContentLayouts=['card','cube','mixed']
     * @protected
     * @static
     */
    static mainContentLayouts = ['card', 'cube', 'mixed']

    static config = {
        /**
         * @member {String} className='DevRank.view.ViewportController'
         * @protected
         */
        className: 'DevRank.view.ViewportController',
        /**
         * @member {Object} routes
         */
        routes: {
            '/home' : 'onHomeRoute',
            '/learn': 'onLearnRoute'
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        Neo.main.addon.LocalStorage.readLocalStorageItem({
            key     : 'devrankTheme',
            windowId: me.windowId
        }).then(({value}) => {
            if (value) {
                me.setTheme(value, false)
            } else if (Neo.config.prefersDarkTheme) {
                me.setTheme('neo-theme-neo-dark', false)
            }
        })
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHomeRoute(params, value, oldValue) {
        // todo
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onLearnRoute(params, value, oldValue) {
        // todo
    }

    /**
     * @param {Object} data
     */
    async onSwitchTheme(data) {
        let me       = this,
            viewport = me.component,
            oldTheme = viewport.theme || 'neo-theme-neo-light',
            newTheme = oldTheme === 'neo-theme-neo-light' ? 'neo-theme-neo-dark' : 'neo-theme-neo-light',
            radius, x, y;

        if (data.clientX) {
            x      = data.clientX;
            y      = data.clientY;
            radius = Math.hypot(Math.max(x, 3000 - x), Math.max(y, 3000 - y)) // simplified max calculation
        }

        await Neo.main.DomAccess.startViewTransition({
            animate: {
                keyframes: [
                    {clipPath: `circle(0px at ${x}px ${y}px)`},
                    {clipPath: `circle(${radius}px at ${x}px ${y}px)`}
                ],
                options: {
                    duration     : 500,
                    easing       : 'ease-in',
                    pseudoElement: '::view-transition-new(root)'
                }
            },
            delay   : 100,
            windowId: me.windowId
        });

        me.setTheme(newTheme)
    }

    /**
     * @param {String} theme
     * @param {Boolean} [updateStorage=true]
     */
    setTheme(theme, updateStorage=true) {
        let me      = this,
            btn     = me.getReference('theme-switch-button'),
            iconCls = theme === 'neo-theme-neo-dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';

        me.component.theme = theme;

        if (btn) {
            btn.iconCls = iconCls
        }

        if (updateStorage) {
            Neo.main.addon.LocalStorage.updateLocalStorageItem({
                key     : 'devrankTheme',
                value   : theme,
                windowId: me.windowId
            })
        }
    }
}

export default Neo.setupClass(ViewportController);
