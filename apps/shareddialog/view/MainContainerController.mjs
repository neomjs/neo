import Component           from '../../../src/component/Base.mjs';
import ComponentController from '../../../src/controller/Component.mjs';
import ComponentManager    from '../../../src/manager/Component.mjs';
import DemoDialog          from './DemoDialog.mjs';
import DragProxyComponent  from '../../../src/draggable/DragProxyComponent.mjs';
import NeoArray            from '../../../src/util/Array.mjs';
import Rectangle           from '../../../src/util/Rectangle.mjs';

/**
 * @class SharedDialog.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='SharedDialog.view.MainContainerController'
         * @protected
         */
        className: 'SharedDialog.view.MainContainerController',
        /**
         * Valid values: bottom, left, right, top
         * @member {String} dockedWindowSide_='right'
         */
        dockedWindowSide_: 'right',
    }

    /**
     * @member {String[]} connectedApps=[]
     */
    connectedApps = []
    /**
     * @member {String} currentTheme='neo-theme-light'
     */
    currentTheme = 'neo-theme-light'
    /**
     * @member {String} dockedWindowAppName='SharedDialog2'
     */
    dockedWindowAppName = 'SharedDialog2'
    /**
     * @member {Number|null} dockedWindowId=null
     */
    dockedWindowId = null
    /**
     * @member {Neo.component.Base|null} dockedWindowProxy=null
     */
    dockedWindowProxy = null
    /**
     * @member {Number} dockedWindowSize=500
     */
    dockedWindowSize = 620
    /**
     * @member {Object} dialogRect=null
     */
    dialogRect = null
    /**
     * @member {Object} dragStartWindowRect=null
     */
    dragStartWindowRect = null
    /**
     * @member {String|null} previousTheme=null
     */
    previousTheme = null
    /**
     * @member {Number|null} targetWindowSize=0
     */
    targetWindowSize = 0

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
            })
        }
    }

    /**
     * @param {Object} data
     * @param {String} appName
     */
    createDialog(data, appName) {
        let me         = this,
            {windowId} = me;

        me.enableOpenDialogButtons(false);

        me.dialog = Neo.create(DemoDialog, {
            animateTargetId    : data.component.id,
            appName,
            boundaryContainerId: null,
            cls                : [me.currentTheme],
            height             : 200,
            width              : 300,
            windowId,

            dragZoneConfig: {
                alwaysFireDragMove: true
            },

            listeners: {
                close          : me.onDialogClose,
                dragZoneCreated: me.onDragZoneCreated,
                scope          : me
            }
        })
    }

    /**
     *
     */
    destroyDockedWindowProxy() {
        let me = this;

        if (me.dockedWindowProxy) {
            me.dockedWindowProxy.destroy(true);
            me.dockedWindowProxy = null
        }
    }

    /**
     * @param {Object} proxyRect
     */
    dropDialogBetweenWindows(proxyRect) {
        let me           = this,
            dialog       = me.dialog,
            intersection = Rectangle.getIntersectionDetails(me.dragStartWindowRect, proxyRect),
            side         = me.dockedWindowSide,
            size         = proxyRect.height * proxyRect.width,
            wrapperStyle;

        if (intersection.area > size / 2) { // drop the dialog fully into the dragStart window
            me.destroyDockedWindowProxy();

            wrapperStyle = dialog.wrapperStyle;

            if (dialog.appName === me.dockedWindowAppName) {
                side = me.getOppositeSide(side);
            }

            switch (side) {
                case 'bottom':
                    wrapperStyle.top = `${me.dragStartWindowRect.height - proxyRect.height}px`;
                    break;
                case 'left':
                    wrapperStyle.left = '0px';
                    break;
                case 'right':
                    wrapperStyle.left = `${me.dragStartWindowRect.width - proxyRect.width}px`;
                    break;
                case 'top':
                    wrapperStyle.top = '0px';
                    break;
            }

            dialog.wrapperStyle = wrapperStyle;
        } else { // drop the dialog fully into the dragEnd window
            me.mountDialogInOtherWindow({
                fullyIncludeIntoWindow: true,
                proxyRect
            })
        }
    }

    /**
     * @param {Boolean} enable=true
     */
    enableOpenDialogButtons(enable=true) {
        this.getOpenDialogButtons().forEach(button => {
            button.disabled = !enable
        })
    }

    /**
     * @return {Neo.button.Base}
     */
    getOpenDockedWindowButton() {
        return this.component.down({iconCls: 'far fa-window-restore'})
    }

    /**
     *
     */
    getOpenDialogButtons() {
        return ComponentManager.find({flag: 'open-dialog-button'})
    }

    /**
     * @param {String} side
     * @return {String}
     */
    getOppositeSide(side) {
        return {
            bottom: 'top',
            left  : 'right',
            right : 'left',
            top   : 'bottom'
        }[side]
    }

    /**
     * @param {Object} proxyRect
     * @param {String} side
     * @param {Boolean} [fullyIncludeIntoWindow=false]
     * @return {{left: String, top: String}}
     */
    getProxyPosition(proxyRect, side, fullyIncludeIntoWindow=false) {
        let me                                      = this,
            {dragStartWindowRect, targetWindowSize} = me,
            left, top;

        switch(side) {
            case 'bottom':
                left = `${proxyRect.left}px`;
                top  = `${fullyIncludeIntoWindow ? 0 : proxyRect.top - dragStartWindowRect.height}px`;
                break;
            case 'left':
                left = `${fullyIncludeIntoWindow ? targetWindowSize - proxyRect.width : targetWindowSize + proxyRect.left}px`;
                top  = `${proxyRect.top}px`;
                break;
            case 'right':
                left = `${fullyIncludeIntoWindow ? 0 : proxyRect.left - dragStartWindowRect.width}px`;
                top  = `${proxyRect.top}px`;
                break;
            case 'top':
                left = `${proxyRect.left}px`;
                top  = `${fullyIncludeIntoWindow ? targetWindowSize - proxyRect.height : targetWindowSize + proxyRect.top}px`;
                break;
        }

        return {left, top}
    }

    /**
     * @return {Boolean}
     */
    hasDockedWindow() {
        return this.connectedApps.includes(this.dockedWindowAppName)
    }

    /**
     * @param {Object} data
     * @param {Object} data.proxyRect
     * @param {Boolean} [data.fullyIncludeIntoWindow]
     */
    mountDialogInOtherWindow(data) {
        let me                   = this,
            {appName, windowId}  = me.component,
            dialog               = me.dialog,
            dragEndWindowAppName = me.dockedWindowAppName,
            dragEndWindowId      = me.dockedWindowId,
            side                 = me.dockedWindowSide,
            needsSwitch, proxyPosition, wrapperStyle;

        if (dialog.appName === dragEndWindowAppName) {
            dragEndWindowAppName = appName;
            dragEndWindowId      = windowId;
            side                 = me.getOppositeSide(me.dockedWindowSide)
        }

        proxyPosition = me.getProxyPosition(data.proxyRect, side, data.fullyIncludeIntoWindow);

        dialog.unmount();

        // we need a delay to ensure dialog.Base: onDragEnd() is done.
        // we could use the dragEnd event of the dragZone instead.
        me.timeout(70).then(() => {
            needsSwitch = dialog.appName === dragEndWindowAppName;

            dialog.appName  = needsSwitch ? appName  : dragEndWindowAppName;
            dialog.windowId = needsSwitch ? windowId : dragEndWindowId;

            me.getOpenDialogButtons().forEach(button => {
                if (button.appName === dialog.appName) {
                    dialog.animateTargetId = button.id
                }
            });

            wrapperStyle = dialog.wrapperStyle;

            wrapperStyle.left = proxyPosition.left;
            wrapperStyle.top  = proxyPosition.top;

            dialog.wrapperStyle = wrapperStyle;

            me.destroyDockedWindowProxy();

            dialog.mount()
        })
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     * @param {Number} data.windowId
     */
    onAppConnect(data) {
        let me                  = this,
            {appName, windowId} = data;

        NeoArray.add(me.connectedApps, appName);

        if (appName !== 'SharedDialog' && me.currentTheme !== 'neo-theme-light') {
            me.switchThemeForApp(windowId)
        }

        if (appName === me.dockedWindowAppName) {
            me.dockedWindowId = data.windowId;
            me.getOpenDockedWindowButton().disabled = true
        }

        me.enableOpenDialogButtons(!me.dialog)
    }

    /**
     * @param {Object} data
     * @param {String} data.appName
     */
    onAppDisconnect(data) {
        let me                                = this,
            {connectedApps, dialog, windowId} = me,
            name                              = data.appName;

        if (name === 'SharedDialog') {
            // we want to close all popup windows, which equals to all connected apps minus the main app
            NeoArray.remove(connectedApps, 'SharedDialog');

            Neo.Main.windowClose({
                names: connectedApps,
                windowId
            })
        } if (name === me.dockedWindowAppName) {
            NeoArray.remove(connectedApps, name);

            Neo.main.addon.WindowPosition.unregisterWindow({name, windowId});

            if (dialog && dialog.windowId !== windowId) {
                me.enableOpenDialogButtons()
            }

            me.getOpenDockedWindowButton().disabled = false
        }
    }

    /**
     * The App worker will receive connect & disconnect events inside the SharedWorkers context
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        Neo.currentWorker.on({
            connect   : me.onAppConnect,
            disconnect: me.onAppDisconnect,
            scope     : me
        })
    }

    /**
     * @param {Object} data
     */
    onCreateDialogButtonClick(data) {
        this.createDialog(data, this.component.appName)
    }

    /**
     *
     */
    onDialogClose() {
        this.enableOpenDialogButtons(true);
        this.dialog = null
    }

    /**
     * @param {Object} data
     */
    onDockedPositionChange(data) {
        this.dockedWindowSide = data.value
    }

    /**
     * @param {Object} data
     */
    onDragEnd(data) {
        if (this.hasDockedWindow()) {
            let me        = this,
                {dialog, dragStartWindowRect} = me,
                proxyRect = Rectangle.moveTo(me.dialogRect, data.clientX - data.offsetX, data.clientY - data.offsetY),
                side      = me.dockedWindowSide;

            if (dialog.appName === me.dockedWindowAppName) {
                side = me.getOppositeSide(me.dockedWindowSide)
            }

            if (Rectangle.leavesSide(dragStartWindowRect, proxyRect, side)) {
                if (Rectangle.excludes(dragStartWindowRect, proxyRect)) {
                    me.mountDialogInOtherWindow({proxyRect})
                } else {
                    me.dropDialogBetweenWindows(proxyRect)
                }
            }
        }
    }

    /**
     * @param {Object} data
     */
    onDragMove(data) {
        if (this.hasDockedWindow()) {
            let me        = this,
                {dialogRect, dragStartWindowRect, dockedWindowAppName, dockedWindowId} = me,
                proxyRect = Rectangle.moveTo(dialogRect, data.clientX - data.offsetX, data.clientY - data.offsetY),
                side      = me.dockedWindowSide,
                proxyPosition, vdom;

            // in case we trigger the drag:start inside the docked window,
            // we can keep the same logic with just flipping the side.
            if (me.dialog.appName === dockedWindowAppName) {
                dockedWindowAppName = me.component.appName;
                dockedWindowId      = me.component.windowId;
                side                = me.getOppositeSide(me.dockedWindowSide);
            }

            if (Rectangle.leavesSide(dragStartWindowRect, proxyRect, side)) {
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
                        module          : DragProxyComponent,
                        appName         : dockedWindowAppName,
                        cls             : ['neo-dialog', 'neo-panel', 'neo-container'],
                        moveInMainThread: false,
                        vdom            : vdom,
                        windowId        : dockedWindowId
                    });

                    // The other window has most likely not loaded The dialog JS module yet,
                    // but the drag proxy is using some CSS rules of it.
                    // todo: a new helper method to parse an existing instance based on its cmp tree for theme files
                    Neo.currentWorker.insertThemeFiles(dockedWindowId, Neo.dialog.Base.prototype);
                    Neo.currentWorker.insertThemeFiles(dockedWindowId, Neo.form.field.Text.prototype);
                    Neo.currentWorker.insertThemeFiles(dockedWindowId, Neo.form.field.trigger.Clear.prototype);
                    Neo.currentWorker.insertThemeFiles(dockedWindowId, Neo.draggable.DragProxyComponent.prototype)
                } else {
                    me.updateDockedWindowProxyStyle({
                        ...proxyPosition,
                        visibility: null
                    })
                }
            } else {
                me.updateDockedWindowProxyStyle({visibility: 'hidden'})
            }
        }
    }

    /**
     * @param {Object} data
     */
    onDragStart(data) {
        if (this.hasDockedWindow()) {
            let me               = this,
                {appName}        = me.component,
                dockedHorizontal = me.dockedWindowSide === 'left' || me.dockedWindowSide === 'right';

            me.dialogRect = data.dragElementRect;

            for (let item of data.eventData.path) {
                if (item.tagName === 'body') {
                    me.dragStartWindowRect = item.rect;
                    break
                }
            }

            if (me.hasDockedWindow()) {
                Neo.Main.getWindowData({
                    appName: me.dialog.appName === appName ? me.dockedWindowAppName : appName
                }).then(data => {
                    me.targetWindowSize = dockedHorizontal ? data.innerWidth : data.innerHeight
                })
            }
        }
    }

    /**
     * @param {Object} data
     */
    onDragZoneCreated(data) {
        let me = this;

        data.dragZone.on({
            dragEnd  : me.onDragEnd,
            dragMove : me.onDragMove,
            dragStart: me.onDragStart,
            scope    : me
        })
    }

    /**
     * Creates a new popup window, which is initially docked to this.dockedWindowSide of the main window
     * @param {Object} handlerData
     */
    openDockedWindow(handlerData) {
        let {windowId} = this;

        Neo.Main.getWindowData({windowId}).then(data => {
            let me     = this,
                dock   = me.dockedWindowSide,
                size   = me.dockedWindowSize,
                height, left, top, width;

            switch(dock) {
                case 'bottom':
                    height = size;
                    left   = data.screenLeft;
                    top    = data.outerHeight + data.screenTop - 62;
                    width  = data.outerWidth;
                    break
                case 'left':
                    height = data.outerHeight - 86;
                    left   = data.screenLeft  - size;
                    top    = data.screenTop   + 24;
                    width  = size;
                    break
                case 'right':
                    height = data.outerHeight - 86;
                    left   = data.outerWidth  + data.screenLeft;
                    top    = data.screenTop   + 24;
                    width  = size;
                    break
                case 'top':
                    height = size;
                    left   = data.screenLeft;
                    top    = data.screenTop - size + 24;
                    width  = data.outerWidth;
                    break
            }

            Neo.Main.windowOpen({
                url           : 'childapps/shareddialog2/index.html',
                windowFeatures: `height=${height},left=${left},top=${top},width=${width}`,
                windowId,
                windowName    : me.dockedWindowAppName
            });

            Neo.main.addon.WindowPosition.registerWindow({
                dock,
                name: me.dockedWindowAppName,
                size,
                windowId
            })
        })
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

        me.previousTheme = me.currentTheme;
        me.currentTheme  = theme;

        me.connectedApps.forEach(appName => {
            me.switchThemeForApp(Neo.apps[appName].windowId)
        });

        button.set({iconCls, text: buttonText});

        if (dialog) {
            cls = dialog.cls;

            NeoArray.removeAdd(cls, me.previousTheme, me.currentTheme);

            dialog.cls = cls
        }
    }

    /**
     * @param {Number} windowId
     */
    switchThemeForApp(windowId) {
        let {currentTheme, previousTheme} = this;

        Neo.main.DomAccess.setBodyCls({
            add    : [currentTheme],
            remove : previousTheme ? [previousTheme]: [],
            windowId
        })
    }

    /**
     * @param {Object} style
     */
    updateDockedWindowProxyStyle(style) {
        let dockedWindowProxy = this.dockedWindowProxy;

        if (dockedWindowProxy) {
            dockedWindowProxy.style = Object.assign(dockedWindowProxy.style || {}, style)
        }
    }
}

export default Neo.setupClass(MainContainerController);
