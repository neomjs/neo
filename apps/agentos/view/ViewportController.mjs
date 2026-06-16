import Controller from '../../../src/controller/Component.mjs';

/**
 * @class AgentOS.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        className: 'AgentOS.view.ViewportController'
    }

    /**
     * @summary Applies the persisted harness theme before the viewport settles.
     */
    onComponentConstructed() {
        let me = this;

        Neo.main.addon.LocalStorage.readLocalStorageItem({
            key     : 'agentosTheme',
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
     * @summary Toggles the harness between the Neo dark and light themes.
     * @param {Object} data
     */
    async onSwitchTheme(data) {
        let me       = this,
            viewport = me.component,
            oldTheme = viewport.theme || 'neo-theme-neo-light',
            newTheme = oldTheme === 'neo-theme-neo-light' ? 'neo-theme-neo-dark' : 'neo-theme-neo-light',
            radius, x, y;

        if (data.clientX !== undefined && data.clientY !== undefined) {
            x      = data.clientX;
            y      = data.clientY;
            radius = Math.hypot(Math.max(x, 3000 - x), Math.max(y, 3000 - y))
        } else {
            x      = 0;
            y      = 0;
            radius = 3000
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
     * @summary Applies and persists the active harness theme.
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
                key     : 'agentosTheme',
                value   : theme,
                windowId: me.windowId
            })
        }
    }
}

export default Neo.setupClass(ViewportController);
