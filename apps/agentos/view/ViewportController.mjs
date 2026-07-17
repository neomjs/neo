import Controller           from '../../../src/controller/Component.mjs';
import {installFleetBridge} from '../../../src/ai/fleet/installFleetBridge.mjs';

/**
 * @class AgentOS.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        className: 'AgentOS.view.ViewportController',
        routes   : {
            '/accounts': 'onAccountsRoute',
            '/chat'    : 'onChatRoute',
            '/control' : 'onControlRoute',
            '/fleet'   : 'onFleetRoute',
            '/home'    : 'onHomeRoute'
        }
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
     * @summary The ONE product-shaped Fleet-bridge injector — (re)wires the authenticated
     * app↔fleet transport in the App-Worker realm, where the bridge actually lives.
     *
     * Why this exists: the process bearer is an in-memory hand-off and the bearer slot the boot
     * path reads lives in the App Worker's global — a realm no page-side init script can reach.
     * So the Option-B delivery story is boot-fail-closed, then inject THROUGH the worker: the
     * Neural Link (dev browser), the Electron main process (product), and the e2e fixture (tests)
     * all call exactly this method, and `installFleetBridge` being idempotent makes the re-wire
     * safe at any time. The bearer arrives as an argument and is handed straight through — never
     * stored on the controller, never logged, never readable back off this surface.
     *
     * @param {Object} config `{url, bearerToken}` — the loopback fleet endpoint + process bearer;
     *     `installFleetBridge` enforces the URL policy and refuses credential-shaped query params.
     * @returns {Boolean} true once the authenticated bridge is (re)published — the bridge object
     *     itself deliberately does not cross this seam (Neural Link callers get a serializable ack,
     *     not a live handle carrying the credentialed `send`).
     */
    wireFleetBridge(config) {
        installFleetBridge(config);
        return true
    }

    /**
     * @summary Activates the shell keeper-view whose header button owns the route.
     * @param {String} route
     */
    activateRoute(route) {
        let shell = this.getReference('shell'),
            tab   = shell?.getTabBar()?.items?.find(button => button.route === route);

        if (tab) {
            shell.activeIndex = tab.index
        }
    }

    /**
     * @summary Activates the Accounts keeper-view from the route.
     */
    onAccountsRoute() {
        this.activateRoute('/accounts')
    }

    /**
     * @summary Activates the Chat keeper-view from the route.
     */
    onChatRoute() {
        this.activateRoute('/chat')
    }

    /**
     * @summary Activates the Control keeper-view from the route.
     */
    onControlRoute() {
        this.activateRoute('/control')
    }

    /**
     * @summary Activates the Fleet keeper-view from the route.
     */
    onFleetRoute() {
        this.activateRoute('/fleet')
    }

    /**
     * @summary Activates the Home keeper-view from the route.
     */
    onHomeRoute() {
        this.activateRoute('/home')
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
