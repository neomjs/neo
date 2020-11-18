import ComponentController from '../../../src/controller/Component.mjs';
import DemoDialog          from './DemoDialog.mjs';
import NeoArray            from '../../../src/util/Array.mjs';

/**
 * @class SharedDialog.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='SharedDialog.view.MainContainerController'
         * @protected
         */
        className: 'SharedDialog.view.MainContainerController',
        /**
         * @member {String} ntype='maincontainer-controller'
         * @protected
         */
        ntype: 'maincontainer-controller',
        /**
         * @member {String[]} connectedApps=[]
         */
        connectedApps: []
    }}

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        const me = this;

        me.view.on({
            connect   : me.onAppConnect,
            disconnect: me.onAppDisconnect,
            scope     : me
        });
    }

    /**
     *
     * @param {Object} data
     */
    createDialog(data) {
        let me   = this,
            view = me.view;

        data.component.disabled = true;

        me.dialog = Neo.create(DemoDialog, {
            animateTargetId    : data.component.id,
            appName            : view.appName,
            boundaryContainerId: view.boundaryContainerId,
            listeners          : {close: me.onWindowClose, scope: me}
        });
    }

    /**
     *
     * @returns {Neo.button.Base}
     */
    getSecondWindowButton() {
        return this.view.down({iconCls: 'fa fa-window-restore'});
    }

    /**
     *
     * @param {String} name
     */
    onAppConnect(name) {
        let me   = this,
            view = me.view;

        if (name !== 'SharedDialog') {
            NeoArray.add(me.connectedApps, name);
        }

        if (name === 'SharedDialog2') {
            me.getSecondWindowButton().disabled = true;
        }
    }

    /**
     *
     * @param {String} name
     */
    onAppDisconnect(name) {
        let me   = this,
            view = me.view;
console.log('onAppDisconnect', name);
        if (name === 'SharedDialog') {
            Neo.Main.windowClose({
                names: me.connectedApps,
            });
        } else {
            NeoArray.remove(me.connectedApps, name);
        }

        if (name === 'SharedDialog2') {
            me.getSecondWindowButton().disabled = false;
        }
    }

    /**
     *
     */
    onWindowClose() {
        let button = this.view.down({
            text: 'Create Dialog'
        });

        button.disabled = false;
    }

    /**
     * Creates a new popup window, which is initially docked to the right side of the main window
     * @param {Object} data
     */
    openDockedWindow(data) {
        Neo.Main.getWindowData().then(data => {
            let height = data.outerHeight - 50,
                left   = data.outerWidth  + data.screenLeft,
                top    = data.screenTop,
                width  = 400;

            Neo.Main.windowOpen({
                url           : '../shareddialog2/index.html',
                windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
                windowName    : 'SharedDialog2'
            });
        });
    }

    /**
     *
     * @param {Object} data
     */
    switchTheme(data) {
        let me         = this,
            button     = data.component,
            buttonText = 'Theme Light',
            iconCls    = 'fa fa-sun',
            theme      = 'neo-theme-dark',
            cls, view;

        if (button.text === 'Theme Light') {
            buttonText = 'Theme Dark';
            iconCls    = 'fa fa-moon';
            theme      = 'neo-theme-light';
        }

        me.connectedApps.forEach(appName => {
            view = Neo.apps[appName].mainViewInstance;

            cls = [...view.cls];

            view.cls.forEach(item => {
                if (item.includes('neo-theme')) {
                    NeoArray.remove(cls, item);
                }
            });

            NeoArray.add(cls, theme);
            view.cls = cls;
        });

        button.set({
            iconCls: iconCls,
            text   : buttonText
        });
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};