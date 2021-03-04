import Component           from '../../../src/component/Base.mjs';
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
         * @member {String} dockedWindowAppName='SharedDialog2'
         */
        dockedWindowAppName: 'SharedDialog2',
        /**
         * @member {Neo.component.Base|null} dockedWindowProxy=null
         */
        dockedWindowProxy: null,
        /**
         * Valid values: bottom, left, right, top
         * @member {String} dockedWindowSide_='right'
         */
        dockedWindowSide_: 'right',
        /**
         * @member {Number} dockedWindowSize=500
         */
        dockedWindowSize: 500,
        /**
         * @member {Object} dialogRect=null
         */
        dialogRect: null,
        /**
         * @member {Object} mainWindowRect=null
         */
        mainWindowRect: null,
        /**
         * @member {Number|null} targetWindowSize=0
         */
        targetWindowSize: 0
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
     * Triggered after the dockedWindowSide config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDockedWindowSide(value, oldValue) {
        if (this.hasDockedWindow()) {
            Neo.main.addon.WindowPosition.setDock({
                name: this.dockedWindowAppName,
                dock: value
            });
        }
    }

    /**
     *
     * @param {Object} data
     * @param {String} appName
     */
    createDialog(data, appName) {
        let me = this;

        data.component.disabled = true;

        me.dialog = Neo.create(DemoDialog, {
            animateTargetId    : data.component.id,
            appName            : appName,
            boundaryContainerId: null,
            cls                : [me.currentTheme, 'neo-dialog', 'neo-panel', 'neo-container'],
            listeners          : {close: me.onWindowClose, scope: me},

            domListeners: [{
                'drag:end'  : me.onDragEnd,
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
     * @param {String}side
     * @return {String}
     */
    getOppositeSide(side) {
        return {
            bottom: 'top',
            left  : 'right',
            right : 'left',
            top   : 'bottom'
        }[side];
    }

    /**
     *
     * @param {Object} proxyRect
     * @param {String} side
     * @return {{left: String, top: String}}
     */
    getProxyPosition(proxyRect, side) {
        let me             = this,
            mainWindowRect = me.mainWindowRect,
            left, top;

        switch(side) {
            case 'bottom':
                left = `${proxyRect.left}px`;
                top  = `${proxyRect.top - mainWindowRect.height}px`;
                break;
            case 'left':
                left = `${me.targetWindowSize + proxyRect.left}px`;
                top  = `${proxyRect.top}px`;
                break;
            case 'right':
                left = `${proxyRect.left - mainWindowRect.width}px`;
                top  = `${proxyRect.top}px`;
                break;
            case 'top':
                left = `${proxyRect.left}px`;
                top  = `${me.targetWindowSize + proxyRect.top}px`;
                break;
        }

        return {
            left: left,
            top : top
        };
    }

    /**
     *
     * @return {Neo.button.Base}
     */
    getSecondWindowButton() {
        return this.view.down({iconCls: 'far fa-window-restore'});
    }

    /**
     *
     * @return {Boolean}
     */
    hasDockedWindow() {
        return this.connectedApps.includes(this.dockedWindowAppName);
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

        if (name === me.dockedWindowAppName) {
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

        if (name === me.dockedWindowAppName) {
            me.getSecondWindowButton().disabled = false;
        }
    }

    /**
     *
     * @param {Object} data
     */
    onCreateDialogButtonClick(data) {
        this.createDialog(data, this.view.appName);
    }

    /**
     *
     * @param {Object} data
     */
    onDockedPositionChange(data) {
        if (data.value === true) {
            this.dockedWindowSide = data.component.value;
        }
    }

    /**
     *
     * @param {Object} data
     */
    onDragEnd(data) {
        if (this.hasDockedWindow()) {
            let me                  = this,
                appName             = me.view.appName,
                dialog              = me.dialog,
                dockedWindowAppName = me.dockedWindowAppName,
                mainWindowRect      = me.mainWindowRect,
                proxyRect           = Rectangle.moveTo(me.dialogRect, data.clientX - data.offsetX, data.clientY - data.offsetY),
                side                = me.dockedWindowSide,
                proxyPosition, wrapperStyle;

            if (me.dialog.appName === dockedWindowAppName) {
                dockedWindowAppName = me.view.appName;
                side                = me.getOppositeSide(me.dockedWindowSide);
            }

            if (Rectangle.leavesSide(mainWindowRect, proxyRect, side)) {
                proxyPosition  = me.getProxyPosition(proxyRect, side);

                if (Rectangle.excludes(mainWindowRect, proxyRect)) {
                    dialog.unmount();

                    // we need a delay to ensure dialog.Base: onDragEnd() is done.
                    // we could use the dragEnd event of the dragZone instead.
                    setTimeout(() => {
                        dialog.appName = dialog.appName === dockedWindowAppName ? appName : dockedWindowAppName;

                        wrapperStyle = dialog.wrapperStyle;

                        wrapperStyle.left = proxyPosition.left;
                        wrapperStyle.top  = proxyPosition.top;

                        dialog.wrapperStyle = wrapperStyle;

                        if (me.dockedWindowProxy) {
                            me.dockedWindowProxy.destroy(true);
                            me.dockedWindowProxy = null;
                        }

                        dialog.render(true);
                    }, 70);
                } else {
                    // todo: dialog dropped between windows
                    console.log('dialog dropped between windows');
                }
            }
        }
    }

    /**
     *
     * @param {Object} data
     */
    onDragMove(data) {
        if (this.hasDockedWindow()) {
            let me                  = this,
                dialogRect          = me.dialogRect,
                dockedWindowAppName = me.dockedWindowAppName,
                mainWindowRect      = me.mainWindowRect,
                proxyRect           = Rectangle.moveTo(dialogRect, data.clientX - data.offsetX, data.clientY - data.offsetY),
                side                = me.dockedWindowSide,
                proxyPosition, vdom;

            if (me.dialog.appName === dockedWindowAppName) {
                dockedWindowAppName = me.view.appName;
                side                = me.getOppositeSide(me.dockedWindowSide);
            }

            if (Rectangle.leavesSide(mainWindowRect, proxyRect, side)) {
                proxyPosition = me.getProxyPosition(proxyRect, side);

                if (!me.dockedWindowProxy) {
                    vdom = Neo.clone(me.dialog.dragZone.dragProxy.vdom, true);

                    delete vdom.id;

                    Object.assign(vdom.style, {
                        ...proxyPosition,
                        transform         : 'none',
                        transitionProperty: 'none'
                    });

                    me.dockedWindowProxy = Neo.create({
                        module    : Component,
                        appName   : dockedWindowAppName,
                        autoMount : true,
                        autoRender: true,
                        cls       : ['neo-dialog-wrapper'],
                        renderTo  : 'document.body',
                        vdom      : vdom
                    });
                } else {
                    me.dockedWindowProxy.style = Object.assign(me.dockedWindowProxy.style || {}, proxyPosition);
                }
            }
        }
    }

    /**
     *
     * @param {Object} data
     */
    onDragStart(data) {
        let me               = this,
            appName          = me.view.appName,
            dockedHorizontal = me.dockedWindowSide === 'left' || me.dockedWindowSide === 'right';

        for (let item of data.path) {
            if (item.cls.includes('neo-dialog')) {
                me.dialogRect = item.rect;
            } else if (item.tagName === 'body') {
                me.mainWindowRect = item.rect;
                break;
            }
        }

        if (me.hasDockedWindow()) {
            Neo.Main.getWindowData({
                appName: me.dialog.appName === appName ? me.dockedWindowAppName : appName
            }).then(data => {
                me.targetWindowSize = dockedHorizontal ? data.innerWidth : data.innerHeight;
            });
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
     * @param {Object} handlerData
     */
    openDockedWindow(handlerData) {
        Neo.Main.getWindowData().then(data => {
            let me     = this,
                dock   = me.dockedWindowSide,
                size   = me.dockedWindowSize,
                height, left, top, width;

            switch (dock) {
                case 'bottom':
                    height = size;
                    left   = data.screenLeft;
                    top    = data.outerHeight + data.screenTop - 52;
                    width  = data.outerWidth;
                    break;
                case 'left':
                    height = data.outerHeight - 78;
                    left   = data.screenLeft  - size;
                    top    = data.screenTop   + 28;
                    width  = size;
                    break;
                case 'right':
                    height = data.outerHeight - 78;
                    left   = data.outerWidth  + data.screenLeft;
                    top    = data.screenTop   + 28;
                    width  = size;
                    break;
                case 'top':
                    height = size;
                    left   = data.screenLeft;
                    top    = data.screenTop - size + 28;
                    width  = data.outerWidth;
                    break;
            }

            Neo.Main.windowOpen({
                url           : '../shareddialog2/index.html',
                windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
                windowName    : me.dockedWindowAppName
            });

            Neo.main.addon.WindowPosition.registerWindow({
                dock: dock,
                name: me.dockedWindowAppName,
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