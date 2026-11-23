import Controller          from '../../../src/controller/Component.mjs';
import CompanionSurface    from './CompanionSurface.mjs';
import ProfileDialog       from './ProfileDialog.mjs';
import {resetMemberRecord} from './memberDefaults.mjs';

const POPUP_MIN_WIDTH = 640;

/**
 * @summary Coordinates the shared member record, nested StateProvider override, inspector dialog, and companion window.
 * @class Neo.examples.stateProvider.advanced.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    /**
     * @member {Neo.examples.stateProvider.advanced.ProfileDialog|null} dialog=null
     */
    dialog = null

    /**
     * Prevents concurrent companion focus or launch operations across async main-thread probes.
     * @member {Boolean} #openingCompanion=false
     * @private
     */
    #openingCompanion = false

    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.advanced.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.stateProvider.advanced.MainContainerController'
    }

    /**
     * @summary Tears down any open dialog and detaches worker listeners when the main view is destroyed.
     * @param {...*} args
     */
    destroy(...args) {
        this.dialog?.destroy(true);
        this.dialog = null;

        if (Neo.currentWorker?.isSharedWorker) {
            Neo.currentWorker.un({
                connect   : this.onWorkerWindowChange,
                disconnect: this.onWorkerWindowChange,
                scope     : this
            })
        }

        super.destroy(...args)
    }

    /**
     * @summary Seeds the initial `member` record from `stores.members` and measures popup availability.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        const me            = this,
              stateProvider = me.getStateProvider(),
              store         = stateProvider.getStore('members'),
              firstMember   = store.getAt(0);

        if (firstMember) {
            stateProvider.setData('member', firstMember)
        }

        me.component.addDomListeners([
            {resize: me.onViewportResize, scope: me}
        ]);

        if (Neo.currentWorker?.isSharedWorker) {
            Neo.currentWorker.on({
                connect   : me.onWorkerWindowChange,
                disconnect: me.onWorkerWindowChange,
                scope     : me
            })
        }

        me.syncPopupAvailability()
    }

    /**
     * @summary Clears the dialog reference when the floating dialog closes.
     */
    onDialogClose() {
        this.dialog = null;
        this.getStateProvider()?.setData('dialogOpen', false)
    }

    /**
     * @summary Toggles the local `density` override on the nested preview panel's StateProvider only.
     */
    onFlipNestedDensityClick() {
        const nestedPanel   = this.getReference('nested-preview-panel'),
              nestedCurrent = nestedPanel.getStateProvider().getData('density'),
              next          = nestedCurrent === 'Compact' ? 'Comfortable' : 'Compact';

        nestedPanel.setState('density', next);
        this.getStateProvider().setData('surfaceNotice', `Nested preview override set to ${next} (workspace stays ${this.getStateProvider().getData('density')}).`)
    }

    /**
     * @summary Switches the shared `member` record when a visitor clicks a row in the team list.
     * @param {Object} data
     * @param {Neo.data.Record} data.record
     */
    onMemberItemClick({record}) {
        if (record?.isRecord) {
            this.getStateProvider().setData({
                member       : record,
                surfaceNotice: `Selected ${record.name} across every open surface.`
            })
        }
    }

    /**
     * @summary Switches the shared `member` record on keyboard selection changes in the team list.
     * @param {Object} data
     * @param {Neo.data.Record[]} [data.records]
     */
    onMemberSelect({records}) {
        const record = records?.[0];

        if (record?.isRecord && this.getStateProvider().getData('member') !== record) {
            this.getStateProvider().setData('member', record)
        }
    }

    /**
     * @summary Opens or closes the shared-state ProfileDialog.
     * @param {Object} data
     */
    onOpenDialogClick(data) {
        const me = this;

        if (me.dialog && !me.dialog.isDestroyed) {
            me.dialog.close();
            return
        }

        me.dialog = Neo.create(ProfileDialog, {
            appName                : me.component.appName,
            listeners              : {close: me.onDialogClose, scope: me},
            optionalAnimateTargetId: data.component?.id,
            stateProvider          : {parent: me.getStateProvider()},
            theme                  : me.component.getTheme(),
            windowId               : me.component.windowId
        });

        me.getStateProvider().setData({
            dialogOpen   : true,
            surfaceNotice: 'Dialog opened — type in the form or in the dialog to see both follow.'
        })
    }

    /**
     * @summary Checks whether an active companion app in the SharedWorker is currently bound to this primary window.
     * @returns {Boolean}
     */
    hasLiveCompanion() {
        const ownerId = this.component?.windowId;
        if (!ownerId || !Neo.currentWorker?.isSharedWorker) return false;

        return Object.values(Neo.apps || {}).some(app =>
            app?.name === 'Neo.examples.stateProvider.advanced.companion' &&
            !Neo.currentWorker.isWindowDeparted?.(app.windowId) &&
            app.mainView?.items?.[0]?.ownerWindowId === ownerId
        )
    }

    /**
     * @summary Focuses an existing companion window in place via `Neo.Main.windowFocus`, or opens a new one bound to this view's StateProvider.
     * @returns {Promise<void>}
     */
    async onOpenSecondWindowClick() {
        const me = this;
        if (me.isDestroyed || me.#openingCompanion) return;

        me.#openingCompanion = true;

        try {
            const {windowId} = me.component;

            if (me.hasLiveCompanion() || await CompanionSurface.isWindowOpen(windowId)) {
                const focused = await CompanionSurface.focusWindow(me.component);
                if (me.isDestroyed) return;

                me.getStateProvider().setData({
                    companionOpen: true,
                    surfaceNotice: focused
                        ? 'Focused the connected second window.'
                        : 'Second window is already open — bring it forward if the browser declined focus.'
                });
                return
            }

            const opened = await CompanionSurface.openWindow(me.component);
            if (me.isDestroyed) return;

            if (!opened) {
                me.getStateProvider().setData({
                    canOpenPopup : false,
                    companionOpen: false,
                    surfaceNotice: 'Second window unavailable here — popups are blocked or unsupported in this viewport.'
                });
                return
            }

            me.getStateProvider().setData({
                companionOpen: true,
                surfaceNotice: 'Second window connected to the same StateProvider.'
            })
        } finally {
            me.#openingCompanion = false
        }
    }

    /**
     * @summary Restores the currently selected member record to its seed values across all surfaces.
     */
    onResetMemberClick() {
        const stateProvider = this.getStateProvider(),
              member        = stateProvider.getData('member');

        if (resetMemberRecord(member)) {
            stateProvider.setData('surfaceNotice', `Restored ${member.name}'s profile defaults.`)
        }
    }

    /**
     * @summary Toggles the root workspace `density` without altering the nested preview panel's local override.
     */
    onToggleRootDensityClick() {
        const stateProvider = this.getStateProvider(),
              current       = stateProvider.getData('density'),
              next          = current === 'Comfortable' ? 'Compact' : 'Comfortable';

        stateProvider.setData({
            density      : next,
            surfaceNotice: `Root workspace density set to ${next}.`
        })
    }

    /**
     * @summary Re-evaluates popup eligibility whenever the browser viewport resizes.
     * @param {Object} data
     */
    onViewportResize(data) {
        const width = data?.rect?.width ?? data?.width;

        if (Number.isFinite(width)) {
            this.updatePopupCapability(width)
        } else {
            this.syncPopupAvailability()
        }
    }

    /**
     * @summary Updates `companionOpen` state when companion windows connect or disconnect in the SharedWorker.
     */
    onWorkerWindowChange() {
        if (this.isDestroyed) return;
        this.getStateProvider()?.setData('companionOpen', this.hasLiveCompanion())
    }

    /**
     * @summary Queries main-thread window dimensions to offer the second window only when a desktop popup can open.
     * @returns {Promise<void>}
     */
    async syncPopupAvailability() {
        const {windowId} = this.component;
        if (!windowId) return;

        const winData = await Neo.Main.getWindowData({windowId}).catch(() => null);
        if (!this.isDestroyed && winData) {
            this.updatePopupCapability(winData.innerWidth)
        }
    }

    /**
     * @summary Updates `canOpenPopup` based on SharedWorker support and viewport width (`>= 640px`).
     * @param {Number} innerWidth
     */
    updatePopupCapability(innerWidth) {
        const canOpenPopup = Boolean(Neo.currentWorker?.isSharedWorker) && innerWidth >= POPUP_MIN_WIDTH;
        this.getStateProvider()?.setData('canOpenPopup', canOpenPopup)
    }
}

export default Neo.setupClass(MainContainerController);
