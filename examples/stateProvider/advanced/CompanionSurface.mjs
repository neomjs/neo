import Button                          from '../../../src/button/Base.mjs';
import ThemeSwitcher                   from '../../../src/button/ThemeSwitcher.mjs';
import Container                       from '../../../src/container/Base.mjs';
import ProfileFields                   from './ProfileFields.mjs';
import {initialsOf, resetMemberRecord} from './memberDefaults.mjs';

/**
 * @summary Companion surface mounted inside the second browser window, bound to the primary window's StateProvider.
 * @class Neo.examples.stateProvider.advanced.CompanionSurface
 * @extends Neo.container.Base
 */
class CompanionSurface extends Container {
    /**
     * @summary Fallback state displayed if the companion window is opened directly or after its primary window closes.
     * @member {Object} disconnectedState
     * @static
     */
    static disconnectedState = {
        connected: false,
        density  : 'Comfortable',
        member   : {
            id        : 'disconnected',
            location  : 'No active primary window',
            name      : 'Primary window closed',
            role      : 'Open this window from the main profile view',
            statusNote: 'Launch from an active session to share its live record.'
        }
    }

    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.advanced.CompanionSurface'
         * @protected
         */
        className: 'Neo.examples.stateProvider.advanced.CompanionSurface',
        /**
         * @member {String[]} additionalThemeFiles=['Neo.examples.stateProvider.advanced.MainContainer']
         */
        additionalThemeFiles: ['Neo.examples.stateProvider.advanced.MainContainer'],
        /**
         * @member {String[]} cls=['sp-companion-surface']
         */
        cls: ['sp-companion-surface'],
        /**
         * @member {String} layout='base'
         */
        layout: 'base',
        /**
         * Window id of the primary desk whose StateProvider backs this companion window.
         * @member {String|null} ownerWindowId=null
         */
        ownerWindowId: null,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['sp-companion-head-bar'],
            layout: 'base',
            items : [{
                cls : ['sp-companion-head'],
                vdom: {cn: [
                    {tag: 'span', cls: ['sp-eyebrow'], text: 'Second window · SharedWorker StateProvider'},
                    {tag: 'h1',   cls: ['sp-companion-title'], text: 'Companion editor'}
                ]}
            }, {
                module  : ThemeSwitcher,
                showText: false
            }]
        }, {
            tag : 'p',
            cls : ['sp-companion-copy'],
            text: 'Edits here write to the same record in the App Worker and update the main window and open dialog immediately.'
        }, {
            module: Container,
            cls   : ['sp-live-banner'],
            layout: 'base',
            items : [{
                cls : ['sp-avatar', 'sp-avatar-lg'],
                bind: {text: data => initialsOf(data['member.name'])}
            }, {
                module: Container,
                cls   : ['sp-banner-meta'],
                layout: 'base',
                items : [
                    {tag: 'strong', cls: ['sp-companion-member-name'],   bind: {text: data => data['member.name'] || ''}},
                    {tag: 'span',   cls: ['sp-companion-member-sub'],    bind: {text: data => `${data['member.role'] || ''} · ${data['member.location'] || ''}`}},
                    {tag: 'span',   cls: ['sp-companion-member-status'], bind: {text: data => data['member.statusNote'] || ''}}
                ]
            }]
        }, {
            module       : ProfileFields,
            reference    : 'companion-fields',
            surfacePrefix: 'window'
        }, {
            module: Container,
            cls   : ['sp-companion-actions'],
            layout: 'base',
            items : [{
                module   : Button,
                cls      : ['sp-btn-secondary'],
                bind     : {disabled: data => data.connected === false},
                handler  : 'up.onResetMemberClick',
                reference: 'companion-reset-button',
                text     : 'Reset member'
            }]
        }]
    }

    /**
     * @summary Builds the deterministic popup handle name owned by one primary window.
     * @param {String} ownerWindowId
     * @returns {String}
     */
    static windowNameFor(ownerWindowId) {
        return `neo-state-provider-companion-${ownerWindowId}`
    }

    /**
     * @summary Checks on the opener's main thread whether its named companion `WindowProxy` is still open.
     * @param {String} ownerWindowId
     * @returns {Promise<Boolean>}
     */
    static async isWindowOpen(ownerWindowId) {
        if (!Neo.currentWorker?.isSharedWorker || !ownerWindowId || typeof Neo.Main?.getByPath !== 'function') {
            return false
        }

        const closed = await Neo.Main.getByPath({
            path    : ['Neo', 'Main', 'openWindows', CompanionSurface.windowNameFor(ownerWindowId), 'win', 'closed'],
            windowId: ownerWindowId
        }).catch(() => undefined);

        return closed === false
    }

    /**
     * @summary Focuses an already-open companion window via `Neo.Main.windowFocus` without replacing its document.
     * @param {Neo.examples.stateProvider.advanced.MainContainer} ownerView
     * @returns {Promise<Boolean>}
     */
    static async focusWindow(ownerView) {
        const {windowId} = ownerView;
        if (!Neo.currentWorker?.isSharedWorker || !windowId || typeof Neo.Main?.windowFocus !== 'function') {
            return false
        }

        try {
            return Boolean(await Neo.Main.windowFocus({
                windowId,
                windowName: CompanionSurface.windowNameFor(windowId)
            }))
        } catch {
            return false
        }
    }

    /**
     * @summary Opens a companion popup window linked to `ownerView` when SharedWorker mode is active.
     * @param {Neo.examples.stateProvider.advanced.MainContainer} ownerView
     * @returns {Promise<Boolean>}
     */
    static async openWindow(ownerView) {
        const {windowId} = ownerView;
        if (!Neo.currentWorker.isSharedWorker) return false;

        const winData = await Neo.Main.getWindowData({windowId}).catch(() => null),
              url     = new URL(Neo.windowConfigs[windowId].url.href),
              width   = 500,
              height  = 640,
              left    = (winData?.screenLeft ?? 40) + Math.max(80, (winData?.outerWidth ?? 960) - width - 32),
              top     = (winData?.screenTop  ?? 40) + 56;

        url.searchParams.set('companion', '1');
        url.searchParams.set('theme', ownerView.getTheme());

        try {
            const opened = await Neo.Main.windowOpen({
                url           : url.href,
                windowFeatures: `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
                windowId,
                windowName    : CompanionSurface.windowNameFor(windowId)
            });

            return Boolean(opened)
        } catch {
            return false
        }
    }

    /**
     * @summary Subscribes to worker disconnect events so closing the primary window detaches cleanly.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        if (this.ownerWindowId) {
            Neo.currentWorker.on({disconnect: this.onOwnerDisconnect, scope: this})
        }
    }

    /**
     * @summary Unsubscribes worker disconnect listener on teardown.
     * @param {...*} args
     */
    destroy(...args) {
        if (this.ownerWindowId) {
            Neo.currentWorker.un({disconnect: this.onOwnerDisconnect, scope: this})
        }

        super.destroy(...args)
    }

    /**
     * @summary Detaches from the primary provider before it tears down when the primary window closes.
     * @param {Object} data
     */
    onOwnerDisconnect({windowId}) {
        if (windowId !== this.ownerWindowId) return;

        this.ownerWindowId = null;
        this.stateProvider.setDataAtSameLevel(CompanionSurface.disconnectedState);
        this.stateProvider.parent = null;

        const resetBtn = this.getReference('companion-reset-button');
        if (resetBtn) resetBtn.disabled = true
    }

    /**
     * @summary Restores the active member record's seed fields from the companion window.
     */
    onResetMemberClick() {
        resetMemberRecord(this.getStateProvider()?.getData('member'))
    }
}

export default Neo.setupClass(CompanionSurface);
