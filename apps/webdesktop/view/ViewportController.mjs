import CommandPalette from '../../../examples/workbench/CommandPalette.mjs';
import Controller     from '../../../src/controller/Component.mjs';
import {catalog}      from '../store/Apps.mjs';

/**
 * @summary Signs accounts in and out, grants and revokes permissions, and switches the theme. The engine's desktop
 * (`Neo.desktop.Container`) opens the apps in windows and keeps them in step with the apps store.
 *
 * Signing in copies the account's permission keys into the root state provider; everything the account sees follows
 * from that one write. A window outlives no permission: when the apps store's filter drops an app, the desktop's window
 * manager closes its window.
 * @class WebDesktop.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.ViewportController'
         * @protected
         */
        className: 'WebDesktop.view.ViewportController'
    }

    /**
     * @param {WebDesktop.model.Account} account
     * @returns {String} The localStorage key of an account's icon arrangement
     */
    getArrangementKey(account) {
        return `neo-webdesktop-arrangement-${account.id}`
    }

    /**
     * Signs an account in with its saved icon arrangement, or the catalog order if it has none. The launcher gets the
     * account's key before the grants: it holds its render until that arrangement is in place, so the grants never show
     * in another account's order. Of two quick clicks the later one wins.
     * @param {Object}                   data
     * @param {WebDesktop.model.Account} data.record
     */
    onAccountItemClick({record}) {
        let me = this;

        me.getReference('launcher').arrangementKey = me.getArrangementKey(record);

        me.setState({
            account    : record,
            permissions: [...record.permissions]
        })
    }

    /**
     * Grants or revokes one permission, as a backend would on a live session.
     * @param {Object}                      data
     * @param {WebDesktop.model.Permission} data.record
     */
    onPermissionItemClick({record}) {
        let permissions = this.getState('permissions'),
            key         = record.id;

        this.setState('permissions', permissions.includes(key) ? permissions.filter(item => item !== key) : [...permissions, key])
    }

    /**
     * @param {Object} data
     */
    onPermissionsButtonClick(data) {
        this.setState('permissionsPanel', !this.getState('permissionsPanel'))
    }

    /**
     * Signs out at once. The window manager's reset ends every window load and hides every window, and an arrangement
     * still being read does not outlive the sign-out: the launcher drops its key after the grants, so a held render
     * shows the empty desktop, never the leaving account's apps. The windows leave the DOM before the account changes:
     * a window still mounted would re-render its content for the empty account, and that update would land after the
     * window's removal.
     * @param {Object} data
     */
    onSignOutButtonClick(data) {
        let me = this;

        me.getReference('desktop').windowManager.reset();

        me.setState({
            account         : null,
            permissions     : [],
            permissionsPanel: false
        });

        me.getReference('launcher').arrangementKey = null
    }

    /**
     * Cached `document.body` `keydown` listener descriptor bound to this controller while the viewport is mounted.
     * @member {Object|null} bodyKeyListener=null
     * @protected
     */
    bodyKeyListener = null
    /**
     * Window id on whose `Neo.main.DomEvents` `'F1'` `preventDefault` is currently registered.
     * @member {Number|String|null} registeredKeyWindowId=null
     * @protected
     */
    registeredKeyWindowId = null

    /**
     * Records the viewport's starting theme as state, which the taskbar's theme button and the Settings app read,
     * and wires document-level command-palette shortcuts (`Ctrl+K`, `Meta+K`, `F1`) once mounted.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        const me       = this,
              viewport = me.component;

        me.setState('theme', viewport.getTheme());

        if (viewport?.mounted) {
            me.syncBodyKeyCapture(true)
        }
    }

    /**
     * @summary Attaches or detaches the `document.body` `keydown` listener and `'F1'` `preventDefault` registration
     * in lockstep with the viewport's mount state.
     * @param {Boolean} mounted
     */
    syncBodyKeyCapture(mounted) {
        const me       = this,
              viewport = me.component;

        if (!viewport || viewport.isDestroyed) {
            return
        }

        if (mounted) {
            if (!me.bodyKeyListener) {
                me.bodyKeyListener = {
                    keydown: me.onViewportKeyDown,
                    scope  : me,
                    vnodeId: 'document.body'
                };
                viewport.addDomListeners?.(me.bodyKeyListener)
            }

            if (!Neo.config.unitTestMode && viewport.windowId && me.registeredKeyWindowId !== viewport.windowId) {
                if (me.registeredKeyWindowId) {
                    Neo.main?.DomEvents?.unregisterPreventDefaultKeys?.({
                        id      : 'document.body',
                        keys    : ['F1'],
                        windowId: me.registeredKeyWindowId
                    })
                }

                Neo.main?.DomEvents?.registerPreventDefaultKeys?.({
                    id      : 'document.body',
                    keys    : ['F1'],
                    windowId: viewport.windowId
                });
                me.registeredKeyWindowId = viewport.windowId
            }
        } else {
            if (me.bodyKeyListener) {
                viewport.removeDomListeners?.(me.bodyKeyListener);
                me.bodyKeyListener = null
            }

            if (me.registeredKeyWindowId) {
                if (!Neo.config.unitTestMode) {
                    Neo.main?.DomEvents?.unregisterPreventDefaultKeys?.({
                        id      : 'document.body',
                        keys    : ['F1'],
                        windowId: me.registeredKeyWindowId
                    })
                }
                me.registeredKeyWindowId = null
            }
        }
    }

    /**
     * @summary Lazily creates the Web Desktop's shared {@link Neo.examples.workbench.CommandPalette} instance.
     * @returns {Neo.examples.workbench.CommandPalette}
     */
    ensureCommandPalette() {
        const me       = this,
              viewport = me.component;

        if (!viewport.commandPalette || viewport.commandPalette.isDestroyed) {
            viewport.commandPalette = {
                actionProvider : () => me.buildCommandPaletteActions(),
                appName        : viewport.appName,
                parentComponent: viewport,
                placeholder    : 'Search accounts, apps, or theme...',
                theme          : me.getState('theme') || viewport.getTheme(),
                title          : 'Web Desktop Commands',
                windowId       : viewport.windowId
            }
        }

        return viewport.commandPalette
    }

    /**
     * @summary Opens or toggles the command palette from the Taskbar `Commands` button.
     * @param {Object} [data]
     * @returns {Promise<Neo.examples.workbench.CommandPalette|Boolean>}
     */
    onOpenCommandPalette(data) {
        const me        = this,
              viewport  = me.component,
              triggerId = me.getReference('commands')?.id ?? data?.component?.id ?? null;

        return me.ensureCommandPalette().toggle({
            fallbackFocusId: () => me.resolveFallbackFocusId(),
            returnFocusId  : triggerId,
            theme          : me.getState('theme') || viewport.getTheme(),
            windowId       : viewport.windowId
        })
    }

    /**
     * @summary Opens or toggles the command palette on `Ctrl+K`, `Meta+K`, or `F1` across both Sign-In and Desktop views.
     * @param {Object} data
     */
    onViewportKeyDown(data) {
        if (!CommandPalette.isOpenShortcut(data)) {
            return
        }

        const me       = this,
              viewport = me.component;

        if (!viewport || viewport.isDestroyed) {
            return
        }

        data.cancelBubble = true;

        const originId = data.target?.id && data.target.id !== 'document.body' ? data.target.id : null;

        me.ensureCommandPalette().toggle({
            fallbackFocusId: () => me.resolveFallbackFocusId(),
            returnFocusId  : originId,
            theme          : me.getState('theme') || viewport.getTheme(),
            windowId       : viewport.windowId
        })
    }

    /**
     * @summary Resolves a live focus fallback across Sign-In <-> Desktop transitions when the origin control unmounts.
     * @returns {String|null}
     * @protected
     */
    resolveFallbackFocusId() {
        const me = this;

        if (me.getState('account')) {
            return me.getReference('commands')?.id ?? me.getReference('start-button')?.id ?? null
        }

        return me.component?.down({ntype: 'list'})?.id ?? null
    }

    /**
     * @summary Builds contextual Web Desktop commands from the live account session, RBAC permission grants,
     * desktop app catalog, permission simulation panel, and theme state.
     * @returns {Object[]}
     */
    buildCommandPaletteActions() {
        const me               = this,
              provider         = me.getStateProvider(),
              account          = me.getState('account'),
              permissions      = me.getState('permissions') || [],
              permissionsPanel = Boolean(me.getState('permissionsPanel')),
              isLight          = me.getState('theme') === 'neo-theme-neo-light',
              accountsStore    = provider?.getStore('accounts'),
              desktop          = me.getReference('desktop'),
              actions          = [];

        if (accountsStore) {
            for (let i = 0, count = accountsStore.getCount(); i < count; i++) {
                const record = accountsStore.getAt(i);

                if (!record) {
                    continue
                }

                const isCurrent = account?.id === record.id;

                actions.push({
                    id         : `account:signin:${record.id}`,
                    available  : !isCurrent,
                    description: record.role ? `${record.role} (${record.permissions?.length ?? 0} permissions)` : 'Sign in with this demo account.',
                    group      : 'Accounts',
                    handler    : async () => {
                        me.onAccountItemClick({record});
                        await Promise.all([
                            me.component?.promiseUpdate?.(),
                            desktop?.promiseUpdate?.()
                        ].map(promise => Promise.resolve(promise).catch(() => {})))
                    },
                    iconCls          : 'fas fa-user',
                    keywords         : ['account', 'login', 'sign in', 'switch user', record.name, record.role],
                    label            : `Sign in as ${record.name}`,
                    unavailableReason: 'Already signed in'
                })
            }
        }

        for (const entry of catalog) {
            if (entry.isLeaf === false) {
                continue
            }

            const granted = Boolean(account) && permissions.includes(entry.permission),
                  reason  = !account
                      ? 'Sign in to an account first'
                      : `Requires ${entry.permission} permission`;

            actions.push({
                id         : `app:open:${entry.id}`,
                available  : granted,
                description: entry.description || `Open ${entry.text} in a desktop window.`,
                group      : 'Desktop Apps',
                handler    : async () => {
                    const win = await desktop?.openApp(entry);

                    if (win && !win.isDestroyed) {
                        win.focus?.(win.id, true)
                    }

                    return win
                },
                iconCls          : entry.iconCls || 'fas fa-window-maximize',
                keywords         : ['app', 'open', 'launch', 'window', entry.id, entry.text, entry.permission],
                label            : `Open ${entry.text}`,
                managesFocus     : true,
                unavailableReason: reason
            })
        }

        actions.push({
            id               : 'desktop:permissions-panel',
            available        : Boolean(account),
            description      : 'Toggle the live RBAC permission simulation panel beside the launcher.',
            group            : 'Session & Desktop',
            handler          : () => me.onPermissionsButtonClick({}),
            iconCls          : 'fas fa-user-shield',
            keywords         : ['permissions', 'rbac', 'grants', 'panel', 'security'],
            label            : permissionsPanel ? 'Hide Permissions panel' : 'Show Permissions panel',
            unavailableReason: 'Sign in to an account first'
        }, {
            id         : 'desktop:theme-toggle',
            available  : true,
            description: `Switch the Web Desktop to the ${isLight ? 'dark' : 'light'} Neo theme.`,
            group      : 'Appearance',
            handler    : () => me.onThemeButtonClick({}),
            iconCls    : isLight ? 'fas fa-moon' : 'fas fa-sun',
            keywords   : ['theme', 'dark', 'light', 'mode', 'appearance'],
            label      : isLight ? 'Switch to Dark theme' : 'Switch to Light theme'
        }, {
            id         : 'account:signout',
            available  : Boolean(account),
            description: 'Close open desktop windows and return to the account lock screen.',
            group      : 'Session & Desktop',
            handler    : async () => {
                me.onSignOutButtonClick({});
                await Promise.resolve(me.component?.promiseUpdate?.()).catch(() => {})
            },
            iconCls          : 'fas fa-right-from-bracket',
            keywords         : ['sign out', 'logout', 'lock', 'session'],
            label            : 'Sign out',
            unavailableReason: 'No account is signed in'
        });

        return actions
    }

    /**
     * Switches between the dark and the light neo theme.
     * @param {Object} data
     */
    onThemeButtonClick(data) {
        this.setTheme(this.getState('theme') === 'neo-theme-neo-light' ? 'neo-theme-neo-dark' : 'neo-theme-neo-light')
    }

    /**
     * Applies the theme a Settings theme button names (`themeName`).
     * @param {Object}          data
     * @param {Neo.button.Base} data.component
     */
    onThemeSettingClick({component}) {
        this.setTheme(component.themeName)
    }

    /**
     * The one writer of the theme: the viewport takes it, then the state. A floating menu keeps the theme it was
     * created with, so the start menu follows explicitly.
     * @param {String} theme
     */
    setTheme(theme) {
        let me         = this,
            {menuList} = me.getReference('start-button');

        me.component.theme = theme;

        if (menuList) {
            menuList.theme = theme
        }

        if (me.component.commandPalette && !me.component.commandPalette.isDestroyed) {
            me.component.commandPalette.theme = theme
        }

        me.setState('theme', theme)
    }
}

export default Neo.setupClass(ViewportController);
