import Controller from '../../../src/controller/Component.mjs';

/**
 * @summary Controller for the shared-state MainContainer, managing the user editor dialog and companion window opener.
 * @class Neo.examples.stateProvider.multiWindow.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    /**
     * @member {Neo.examples.stateProvider.multiWindow.dialog.EditUserDialog|null} dialog=null
     */
    dialog = null

    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.multiWindow.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.stateProvider.multiWindow.MainContainerController'
    }

    /**
     * @summary Enables or disables the Edit user header button while the dialog is hidden or open.
     * @param {Boolean} enable
     */
    enableEditUserButton(enable) {
        this.getReference('edit-user-button').disabled = !enable
    }

    /**
     * @summary Opens the shared EditUserDialog bound to this container's state provider.
     * @param {Object} data
     */
    onEditUserButtonClick(data) {
        let me = this;

        me.enableEditUserButton(false);

        if (!me.dialog) {
            import('./EditUserDialog.mjs').then(module => {
                me.dialog = Neo.create({
                    module         : module.default,
                    animateTargetId: me.getReference('edit-user-button').id,
                    appName        : me.component.appName,
                    closeAction    : 'hide',

                    listeners: {
                        hide: me.enableEditUserButton.bind(me, true)
                    },

                    stateProvider: {
                        parent: me.getStateProvider()
                    }
                })
            })
        } else {
            me.dialog.show()
        }
    }

    /**
     * @summary Opens the companion window beside the primary window via a relative URL valid across builds.
     * @returns {Promise<void>}
     */
    async onOpenSecondWindowButtonClick() {
        let {windowId} = this.component,
            winData    = await Neo.Main.getWindowData({windowId}),
            height     = 400,
            width      = 520,
            left       = (winData?.screenLeft ?? 0) + (winData?.outerWidth ?? 520) + 20,
            top        = winData?.screenTop ?? 0;

        await Neo.Main.windowOpen({
            url           : '../multiWindow2/index.html',
            windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
            windowId,
            windowName    : 'NeoStateProviderMultiWindow2'
        })
    }
}

export default Neo.setupClass(MainContainerController);
