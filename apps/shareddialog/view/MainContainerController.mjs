import ComponentController from '../../../src/controller/Component.mjs';
import DemoDialog          from './DemoDialog.mjs';
import NeoArray            from '../../../src/util/Array.mjs';
import Rectangle           from '../../../src/util/Rectangle.mjs';

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
        connectedApps: [],
        /**
         * @member {String} currentTheme='neo-theme-light'
         */
        currentTheme: 'neo-theme-light',
        /**
         * @member {String} defaultTheme='neo-theme-light'
         */
        defaultTheme: 'neo-theme-light',
        /**
         * @member {Number} dockedWindowSize=400
         */
        dockedWindowSize: 500,
        /**
         * @member {Object} mainWindowRect=null
         */
        mainWindowRect: null
    }}

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.view.on({
            connect        : me.onAppConnect,
            disconnect     : me.onAppDisconnect,
            dragZoneCreated: me.onDragZoneCreated,
            scope          : me
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
            // boundaryContainerId: view.boundaryContainerId,
            boundaryContainerId: null,
            cls                : [me.currentTheme, 'neo-dialog', 'neo-panel', 'neo-container'],
            listeners          : {close: me.onWindowClose, scope: me},

            domListeners: [{
                'drag:move' : me.onDragMove,
                'drag:start': me.onDragStart,
                scope       : me,
                delegate    : '.neo-header-toolbar'
            }],

            dragZoneConfig: {
                alwaysFireDragMove: true
            }
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
     * @param {Object} data
     * @param {String} data.appName
     */
    onAppConnect(data) {
        let me   = this,
            name = data.appName;

        NeoArray.add(me.connectedApps, name);

        if (name !== 'SharedDialog' && me.currentTheme !== 'neo-theme-light') {
            me.switchThemeForApp(name, me.currentTheme);
        }

        if (name === 'SharedDialog2') {
            me.getSecondWindowButton().disabled = true;
        }
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.appName
     */
    onAppDisconnect(data) {
        let me   = this,
            name = data.appName;

        if (name === 'SharedDialog') {
            // we want to close all popup windows, which equals to all connected apps minus the main app
            NeoArray.remove(me.connectedApps, 'SharedDialog');

            Neo.Main.windowClose({
                names: me.connectedApps,
            });
        } else {
            NeoArray.remove(me.connectedApps, name);

            Neo.main.addon.WindowPosition.unregisterWindow({
                name: name
            });
        }

        if (name === 'SharedDialog2') {
            me.getSecondWindowButton().disabled = false;
        }
    }

    /**
     *
     * @param {Object} data
     */
    onDragMove(data) {
        //console.log('onDragMove', data);

        let me       = this,
            dragZone = me.dialog.dragZone;

        console.log(me.mainWindowRect, dragZone.dragElementRect);

        if (Rectangle.contains(me.mainWindowRect, dragZone.dragElementRect)) {
            console.log('dialog contained inside main window')
            console.log(data.clientX - Math.round(data.offsetX));
        }
    }

    /**
     *
     * @param {Object} data
     */
    onDragStart(data) {
        for (const item of data.path) {
            if (item.tagName === 'body') {
                this.mainWindowRect = item.rect;
                break;
            }
        }
    }

    /**
     *
     * @param {Object} data
     */
    onDragZoneCreated(data) {
        console.log('onDragZoneCreated', data);
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
            let height = data.outerHeight - 78,
                left   = data.outerWidth  + data.screenLeft,
                size   = this.dockedWindowSize,
                top    = data.screenTop   + 28;

            Neo.Main.windowOpen({
                url           : '../shareddialog2/index.html',
                windowFeatures: `height=${height},left=${left},top=${top},width=${size}`,
                windowName    : 'SharedDialog2'
            });

            Neo.main.addon.WindowPosition.registerWindow({
                dock: 'right',
                name: 'SharedDialog2',
                size: size
            });
        });
    }

    /**
     * Switches the theme for all connected apps
     * @param {Object} data
     */
    switchTheme(data) {
        let me         = this,
            button     = data.component,
            buttonText = 'Theme Light',
            dialog     = me.dialog,
            iconCls    = 'fa fa-sun',
            theme      = 'neo-theme-dark',
            cls;

        if (button.text === 'Theme Light') {
            buttonText = 'Theme Dark';
            iconCls    = 'fa fa-moon';
            theme      = 'neo-theme-light';
        }

        me.connectedApps.forEach(appName => {
            me.switchThemeForApp(appName, theme);
        });

        button.set({
            iconCls: iconCls,
            text   : buttonText
        });

        if (dialog) {
            cls = dialog.cls;

            NeoArray.remove(cls, me.currentTheme);
            NeoArray.add(cls, theme);

            dialog.cls = cls;
        }

        me.currentTheme = theme;
    }

    /**
     *
     * @param {String} appName
     * @param {String} theme
     */
    switchThemeForApp(appName, theme) {
        let view = Neo.apps[appName].mainViewInstance,
            cls  = [...view.cls];

        view.cls.forEach(item => {
            if (item.includes('neo-theme')) {
                NeoArray.remove(cls, item);
            }
        });

        NeoArray.add(cls, theme);
        view.cls = cls;
    }
}

Neo.applyClassConfig(MainContainerController);

export {MainContainerController as default};