import ComponentManager from '../manager/Component.mjs';
import NeoArray         from '../util/Array.mjs';
import Panel            from '../container/Panel.mjs';
import Toolbar          from './header/Toolbar.mjs';
import VDomUtil         from '../util/VDom.mjs';

let DragZone;

/**
 * @class Neo.dialog.Base
 * @extends Neo.container.Panel
 */
class Dialog extends Panel {
    /**
     * Valid values for closeAction
     * @member {String[]} closeActions=['close','hide']
     * @protected
     * @static
     */
    static closeActions = ['close', 'hide']

    static config = {
        /**
         * @member {String} className='Neo.dialog.Base'
         * @protected
         */
        className: 'Neo.dialog.Base',
        /**
         * @member {String} ntype='dialog'
         * @protected
         */
        ntype: 'dialog',
        /**
         * @member {Boolean} animateOnDragEnd=false
         */
        animateOnDragEnd: false,
        /**
         * @member {String|null} animateTargetId_=null
         * @reactive
         */
        animateTargetId_: null,
        /**
         * @member {Boolean} autoInitVnode=true
         */
        autoInitVnode: true,
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Boolean} autoShow=true
         */
        autoShow: true,
        /**
         * @member {String[]} baseCls=['neo-dialog','neo-panel','neo-container']
         * @protected
         */
        baseCls: ['neo-dialog', 'neo-panel', 'neo-container'],
        /**
         * Either a dom node id, 'document.body' or null
         * @member {String|null} boundaryContainerId='document.body'
         */
        boundaryContainerId: 'document.body',
        /**
         * Define what happens in case you click on the close button
         * close will destroy the instance, hide will keep it for later re-use.
         * Valid values: close, hide
         * @member {String} closeAction='close'
         */
        closeAction: 'close',
        /**
         * @member {Boolean} draggable_=true
         * @reactive
         */
        draggable_: true,
        /**
         * @member {Boolean} dragListenersAdded=false
         * @protected
         */
        dragListenersAdded: false,
        /**
         * @member {Neo.draggable.DragZone|null} dragZone=null
         */
        dragZone: null,
        /**
         * @member {Object} dragZoneConfig=null
         */
        dragZoneConfig: null,
        /**
         * @member {Boolean} floating=true
         */
        floating: true,
        /**
         * @member {Object} headerConfig=null
         */
        headerConfig: null,
        /**
         * @member {Neo.toolbar.Base|null} headerToolbar=null
         */
        headerToolbar: null,
        /**
         * @member {Boolean} isDragging=false
         * @protected
         */
        isDragging: false,
        /**
         * @member {Object} keys={Escape:'onKeyDownEscape'}
         * @reactive
         */
        keys: {
            Escape: 'onKeyDownEscape'
        },
        /**
         * The maximize action's glyph while the dialog is not maximized. The window glyphs are one set: a line, a
         * square, two offset squares and a cross.
         * @member {String} maximizeCls='far fa-square'
         */
        maximizeCls: 'far fa-square',
        /**
         * @member {Boolean} maximized_=false
         * @reactive
         */
        maximized_: false,
        /**
         * The minimize action's glyph. The dialog has no minimize of its own: the action fires `headerAction`, and
         * a window manager that can restore the dialog handles it (`Neo.desktop.WindowManager`).
         * @member {String} minimizeCls='fas fa-minus'
         */
        minimizeCls: 'fas fa-minus',
        /**
         * @member {Boolean} modal_=false
         * @reactive
         */
        modal_: false,
        /**
         * @member {Boolean} resizable_=true
         * @reactive
         */
        resizable_: true,
        /**
         * @member {Object} resizablePluginConfig=null
         */
        resizablePluginConfig: null,
        /**
         * The maximize action's glyph while the dialog is maximized: a click restores it
         * @member {String} restoreCls='far fa-clone'
         */
        restoreCls: 'far fa-clone',
        /**
         * @member {String|null} title_=null
         * @reactive
         */
        title_: null,
        /**
         * Set to `true` to have tabbing wrap within this Dialog.
         * Should be used with `modal`.
         * @member {Boolean} trapFocus_=false
         * @reactive
         */
        trapFocus_: false
    }

    /**
     * The component the animation starts from. Null when `animateTargetId` names a node without a component, such as
     * a list item: the animation still runs, and the dialog keeps its own `windowId` and `appName`.
     * @member {Neo.component.Base|null} animateTarget=null
     */
    get animateTarget() {
        return Neo.getComponent(this.animateTargetId)
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.createHeader()
    }

    /**
     * Triggered after the animateTargetId config got changed.
     * A dialog with an animation target mounts through animateShow(), so it is created unmounted.
     * Without one, autoInitVnode and autoMount keep their own value.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAnimateTargetId(value, oldValue) {
        if (value) {
            this.autoMount     = false;
            this.autoInitVnode = false
        }
    }

    /**
     * Triggered after the appName config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        let me        = this,
            resizable = me.getPlugin('resizable');

        if (me.dragZone) {
            me.dragZone.appName = value
        }

        if (resizable) {
            resizable.appName = value
        }

        super.afterSetAppName(value, oldValue)
    }

    /**
     * Triggered after the draggable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDraggable(value, oldValue) {
        let me = this,
            cls;

        if (oldValue !== undefined && me.headerToolbar) {
            cls = me.headerToolbar.cls;
            NeoArray[value ? 'add' : 'remove'](cls, 'neo-draggable');
            me.headerToolbar.cls = cls
        }

        value && import('../draggable/DragZone.mjs').then(module => {
            DragZone = module.default;

            if (!me.dragListenersAdded) {
                const dragListeners = [
                    {'drag:end'  : me.onDragEnd,   scope: me, delegate: '.neo-header-toolbar'},
                    {'drag:start': me.onDragStart, scope: me, delegate: '.neo-header-toolbar'}
                ];

                if (me.dragZoneConfig?.alwaysFireDragMove) {
                    dragListeners.push(
                        {'drag:move': me.onDragMove, scope: me, delegate: '.neo-header-toolbar'}
                    )
                }

                me.domListeners       = [...me.domListeners, ...dragListeners];
                me.dragListenersAdded = true
            }
        })
    }

    /**
     * Triggered after the maximized config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    async afterSetMaximized(value, oldValue) {
        let me        = this,
            firstCall = oldValue === undefined,
            {cls}     = me.vdom;

        !firstCall && NeoArray.add(cls, 'animated-hiding-showing');
        NeoArray.toggle(cls, 'neo-maximized', value);
        me.update();

        me.syncMaximizeAction();

        if (!firstCall) {
            await(me.timeout(250));

            NeoArray.remove(cls, 'animated-hiding-showing');
            me.update()
        }
    }

    /**
     * Triggered after the modal config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetModal(value, oldValue) {
        let me = this;

        NeoArray.toggle(me.vdom.cls, 'neo-modal', value);
        me.update();

        me.vnodeInitialized && me.syncModalMask()
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        // Ensure focus trapping is up-to-date, enabled or disabled.
        oldValue !== undefined && this.syncTrapFocus();

        // A mounted modal dialog is on the page now: the mask goes below it
        value && this.syncModalMask()
    }

    /**
     * Triggered after the resizable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetResizable(value, oldValue) {
        if (value && !this.getPlugin('resizable')) {
            import('../plugin/Resizable.mjs').then(module => {
                let me        = this,
                    {appName} = me,
                    plugins   = me.plugins || [];

                plugins.push({
                    module       : module.default,
                    appName,
                    delegationCls: 'neo-dialog',
                    // A move writes the dialog's geometry into `style` (onDragEnd), which would mask a resize in
                    // `wrapperStyle`
                    styleConfig  : 'style',
                    ...me.resizablePluginConfig
                });

                me.plugins = plugins
            })
        }
    }

    /**
     * Triggered after the title config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        let {headerToolbar} = this;

        if (headerToolbar) {
            headerToolbar.title = value
        }
    }

    /**
     * Triggered after the trapFocus config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetTrapFocus(value, oldValue) {
        this.syncTrapFocus()
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        let me        = this,
            resizable = me.getPlugin('resizable');

        if (me.dragZone) {
            me.dragZone.windowId = value
        }

        if (resizable) {
            resizable.windowId = value
        }

        super.afterSetWindowId(value, oldValue)
    }

    /**
     *
     */
    async animateHide() {
        let me                  = this,
            {animateTarget, id} = me,
            rects, windowId;

        // Assuming that we want to show the dialog inside the same browser window as the animation target
        if (animateTarget) {
            me.windowId = animateTarget.windowId;
            me.appName  = animateTarget.appName
        }

        windowId = me.windowId;

        rects = await me.getDomRect([id, me.animateTargetId])

        await Neo.applyDeltas(windowId, {
            id,
            style: {
                height   : `${rects[0].height}px`,
                left     : `${rects[0].left  }px`,
                top      : `${rects[0].top   }px`,
                transform: 'none',
                width    : `${rects[0].width }px`
            }
        });

        await me.timeout(30);

        await Neo.applyDeltas(windowId, {
            id,
            cls: {
                add: ['animated-hiding-showing']
            },
            style: {
                height: `${rects[1].height}px`,
                left  : `${rects[1].left  }px`,
                top   : `${rects[1].top   }px`,
                width : `${rects[1].width }px`
            }
        });

        await me.timeout(250);

        me.closeOrHide(false);

        if (me.closeAction === 'hide') {
            await Neo.applyDeltas(windowId, {id, action: 'removeNode'})
        }
    }

    /**
     *
     */
    async animateShow() {
        let me                         = this,
            {animateTarget, id, style} = me,
            rect;

        // Assuming that we want to show the dialog inside the same browser window as the animation target
        if (animateTarget) {
            me.windowId = animateTarget.windowId;
            me.appName  = animateTarget.appName
        }

        rect = await me.getDomRect(me.animateTargetId);

        if (style.left || style.top) {
            let tempStyle = {...style};

            // Ensure that the initial mounting happens outside the visible area
            delete style.left;
            delete style.top;

            me.style = style;

            // Silent update & ensure that a given starting position won't get lost
            me._style = style = tempStyle
        }

        // rendered outside the visible area
        await me.initVnode(true);

        let [dialogRect, bodyRect] = await me.waitForDomRect({id: [me.id, 'document.body']});

        // Move to cover the animation target
        await Neo.applyDeltas(me.windowId, {
            id,
            style: {
                height: `${rect.height}px`,
                left  : `${rect.left  }px`,
                top   : `${rect.top   }px`,
                width : `${rect.width }px`
            }
        });

        // Wait for the element to achieve its initial rectangle
        await me.timeout(50);

        // Expand to final state
        await Neo.applyDeltas(me.windowId, {
            id,
            cls: {
                add: ['animated-hiding-showing']
            },
            style: {
                height: style?.height || `${dialogRect.height}px`,
                left  : style?.left   || `${Math.round(bodyRect.width  / 2 - dialogRect.width  / 2)}px`,
                top   : style?.top    || `${Math.round(bodyRect.height / 2 - dialogRect.height / 2)}px`,
                width : style?.width  || `${dialogRect.width}px`
            }
        });

        await me.timeout(200);

        // Remove the animation class. The measured height was only its end point: a dialog whose height nothing
        // declares follows its content again, so a message its form shows below a field has room.
        await Neo.applyDeltas(me.windowId, {
            id,
            cls: {remove: ['animated-hiding-showing']},
            ...!(me.height || style?.height || me.wrapperStyle?.height) && {style: {height: null}}
        });

        // show() holds this as a mount flight, which lands on the latest hidden: a hide() during the animation wins
        if (!me._hidden) {
            me.fire('show');
            me.syncModalMask()
        }
    }

    /**
     * Triggered before the closeAction config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetCloseAction(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'closeAction')
    }

    /**
     * @param {Boolean} animate=!!this.animateTargetId
     */
    close(animate=!!this.animateTargetId) {
        let me = this;

        me.revertFocus();

        if (animate) {
            me.animateHide()
        } else {
            // destroy() takes the mask along and retires the instance and its timers
            me.fire('close');
            me.destroy(true)
        }
    }

    /**
     * Runs the {@link #closeAction}: what the close button and Escape do
     * @param {Boolean} animate=!!this.animateTargetId
     */
    closeOrHide(animate=!!this.animateTargetId) {
        this[this.closeAction](animate)
    }

    /**
     * Action when clicking the X button inside the header toolbar.
     * @param {Object} data
     * @protected
     */
    closeOrHideAction(data) {
        this.closeOrHide()
    }

    /**
     * Creates the header toolbar. Its vocabulary gets the window controls the dialog dresses from its own configs
     * ({@link #getWindowActionMap}); an entry of `headerConfig.actionMap` with the same name replaces one.
     */
    createHeader() {
        let me                  = this,
            {appName, windowId} = me,
            headerConfig        = me.headerConfig || {},
            cls                 = ['neo-header-toolbar', 'neo-toolbar'],
            headers             = me.headers || [];

        me.draggable && cls.push('neo-draggable');

        me.headerToolbar = Neo.create({
            module   : Toolbar,
            appName,
            cls,
            dock     : 'top',
            flex     : 'none',
            id       : me.getHeaderToolbarId(),
            // A rebuilt action list builds maximize unpressed: the sync states it again
            listeners: {actionsChange: me.syncMaximizeAction, headerAction: me.executeHeaderAction, scope: me},
            title    : me.title,
            windowId,
            ...headerConfig,
            actionMap: {...me.getWindowActionMap(), ...headerConfig.actionMap}
        });

        // A dialog created maximized offers the restore at once
        me.maximized && me.syncMaximizeAction();

        headers.unshift(me.headerToolbar);

        me.headers = headers
    }

    /**
     * A modal dialog on the page releases its mask however it leaves: through close(), or destroyed by its owner.
     * @param {...*} args Arguments to pass to the superclass destroy method.
     */
    destroy(...args) {
        let me = this;

        me.mounted && me.modal && me.syncModalMask(me.id, false);

        super.destroy(...args)
    }

    /**
     * {Object} data
     */
    executeHeaderAction(data) {
        let me = this,

        map = {
            close   : me.closeOrHideAction,
            maximize: me.maximize
        };

        map[data.action]?.call(me, data);

        me.fire('headerAction', {
            dialog: me,
            ...data
        })
    }

    /**
     * @summary A dialog opens on its first field, so a form takes input at once: the window controls of its header
     * come first in the DOM. Without a field, it takes focus as every floating component does.
     * @protected
     */
    focusOnArrival() {
        const field = this.getFirstField();

        field ? field.focus(field.id, true) : super.focusOnArrival()
    }

    /**
     * Returns the id of the animation node
     * @returns {String}
     */
    getAnimateTargetId() {
        return this.id + '-animate'
    }

    /**
     * @summary The first enabled, visible field in item order, which is the order on the page. `down()` walks the
     * order components registered in, so a form that rebuilt its fields would answer with a later one.
     * @param {Neo.component.Base} [component=this]
     * @returns {Neo.form.field.Base|null}
     * @protected
     */
    getFirstField(component=this) {
        for (const item of component.items || []) {
            if (!item.hidden && !item.disabled) {
                const field = ComponentManager.hasPrototypePropertyValue(item, 'ntype', 'basefield') ?
                    item : this.getFirstField(item);

                if (field) {
                    return field
                }
            }
        }

        return null
    }

    /**
     * A dialog hands focus back to the component focus came from, else to its opener, the {@link #animateTarget} it
     * grows out of: focus enters from the body when the opener disables itself, or when a browser does not focus a
     * clicked button.
     * @returns {Neo.component.Base|null}
     */
    getFocusReturnTarget() {
        return super.getFocusReturnTarget() || this.animateTarget
    }

    /**
     * Returns the id of the header toolbar
     * @returns {String}
     */
    getHeaderToolbarId() {
        return this.id + '-header-toolbar'
    }

    /**
     * @returns {Object} vdom
     */
    getProxyVdom() {
        return VDomUtil.clone(this.vdom)
    }

    /**
     * The window controls the dialog dresses from its own configs. Maximize is a `Neo.toolbar.ActionButton`
     * toggle: `maximized` presses it ({@link #syncMaximizeAction}), also when the header builds it anew, and its glyph
     * and accessible name then say what a click does next. Minimize is listed in no default `actions`: it belongs on a
     * dialog a window manager can restore.
     * @returns {Object} Action name → config factory
     * @protected
     */
    getWindowActionMap() {
        let me = this;

        return {
            maximize: () => ({
                action            : 'maximize',
                actionLabel       : 'maximize',
                iconCls           : me.maximizeCls,
                ntype             : 'toolbar-action-button',
                pressedActionLabel: 'restore',
                pressedIconCls    : me.restoreCls
            }),
            minimize: () => ({action: 'minimize', iconCls: me.minimizeCls})
        }
    }

    /**
     * Hides the dialog and writes `hidden`. A landed dialog can animate out. Otherwise component.Base#hide
     * removes it, and leaves a dialog still in its mount flight to the flight.
     * @param {Boolean} animate=!!this.animateTargetId
     */
    async hide(animate=!!this.animateTargetId) {
        let me = this;

        if (animate && me.mounted && !me.mountFlight) {
            me.animateHide()
        } else {
            super.hide();
            me.fire('hide')
        }

        await me.timeout(30);

        me.syncModalMask()
    }

    /**
     * A dialog with an animation target is created unmounted ({@link #afterSetAnimateTargetId}): `autoShow` shows it
     */
    init() {
        super.init();

        let me = this;

        me.animateTargetId && me.autoShow && me.show()
    }

    /**
     * The maximize action's handler: maximizes the dialog, or restores a maximized one
     * @param {Object} [data]
     */
    maximize(data) {
        this.maximized = !this.maximized
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.headerToolbar = me.down({
            id: me.getHeaderToolbarId()
        })
    }

    /**
     * @param data
     */
    onDragEnd(data) {
        let me = this,
            initialTransitionProperty, style;

        if (!me.maximized) {
            me.getDomRect(me.dragZone.dragProxy.id).then(rect => {
                style = me.style;

                Object.assign(style, {
                    height   : `${rect.height}px`,
                    left     : `${rect.left}px`,
                    opacity  : 1,
                    top      : `${rect.top}px`,
                    transform: 'none',
                    width    : `${rect.width}px`
                });

                if (!me.animateOnDragEnd) {
                    initialTransitionProperty = style.transitionProperty || null;

                    style.transitionProperty = 'none';

                    me.timeout(50).then(() => {
                        style = me.style;

                        style.transitionProperty = initialTransitionProperty;

                        me.style = style
                    })
                }

                me.style = style;

                me.dragZone.dragEnd(data);

                // we need a reset, otherwise we do not get a change event for the next onDragStart() call
                me.dragZone.boundaryContainerId = null;
                me.isDragging                   = false;

                me.focus(me.id, true)
            })
        }
    }

    /**
     * This method will only get triggered in case alwaysFireDragMove is included inside the dragZoneConfig
     * @param data
     */
    onDragMove(data) {
        this.dragZone.dragMove(data)
    }

    /**
     * @param data
     */
    onDragStart(data) {
        let me                      = this,
            {appName, id, windowId} = me,
            style                   = me.style || {};

        if (!me.maximized) {
            me.isDragging = true;

            me.getPlugin('resizable')?.removeAllNodes();

            if (!me.dragZone) {
                me.dragZone = Neo.create({
                    module             : DragZone,
                    appName,
                    bodyCursorStyle    : 'move !important',
                    boundaryContainerId: me.boundaryContainerId,
                    dragElement        : me.vdom,
                    dragProxyConfig    : {vdom: me.getProxyVdom()},
                    owner              : me,
                    useProxyWrapper    : false,
                    windowId,
                    ...me.dragZoneConfig
                });

                me.fire('dragZoneCreated', {dragZone: me.dragZone, id})
            } else {
                me.dragZone.boundaryContainerId = me.boundaryContainerId
            }

            me.dragZone.dragStart(data);

            style.opacity = 0.7;

            me.style = style
        }
    }

    /**
     * Escape does what the close button does, with or without the animation
     */
    onKeyDownEscape() {
        this.closeOrHide()
    }

    /**
     * @param {Boolean} [mount] Mount the DOM after the vnode got created
     */
    async render(mount) {
        let me             = this,
            {wrapperStyle} = me;

        // If there is no animation target, we need to ensure that the initial offscreen positioning
        // from .neo-floating gets reverted
        if (!me.animateTargetId) {
            if (!wrapperStyle.left) {
                wrapperStyle.left = 'initial'
            }

            if (!wrapperStyle.top) {
                wrapperStyle.top = 'initial'
            }

            me.wrapperStyle = wrapperStyle
        }

        await super.render(mount)
    }

    /**
     * Shows the dialog and writes `hidden`. An animated show is a mount flight of its own, one at a time.
     * A dialog that is mounted or in flight goes through component.Base#show, which does not mount it again.
     * @param {Boolean} animate=!!this.animateTargetId
     */
    show(animate=!!this.animateTargetId) {
        let me = this;

        if (animate && !me.mounted && !me.mountFlight) {
            me._hidden = false;
            me.startMountFlight(me.animateShow())
        } else {
            super.show();
            me.fire('show')
        }

        me.syncModalMask()
    }

    /**
     * States `maximized` as the maximize action's `pressed`, for a click and a programmatic change alike. A header
     * without that action has nothing to sync.
     * @protected
     */
    syncMaximizeAction() {
        this.headerToolbar?.getAction?.('maximize')?.set({pressed: this.maximized})
    }

    /**
     * Syncs the visibility and position of the modal mask element
     * @param {String}  id=this.id
     * @param {Boolean} modal=this.modal `false` releases the mask while the dialog is still on the page
     */
    syncModalMask(id=this.id, modal=this.modal) {
        Neo.main.DomAccess.syncModalMask({id, modal, windowId: this.windowId})
    }

    /**
     *
     */
    syncTrapFocus() {
        let me             = this,
            {id, windowId} = me;

        if (me.mounted) {
            Neo.main.DomAccess.trapFocus({id, trap: me.trapFocus, windowId})
        }
    }

    /**
     * @summary Syncs the modal mask once the node has left the DOM, since `Neo.main.DomAccess#syncModalMask`
     * keys the mask to the dialogs present there. Covers a hide() that lands with an animated show's mount flight,
     * whose own sync ran while the node was still in the DOM.
     * @returns {Promise<void>}
     */
    async unmount() {
        await super.unmount();

        !this.isDestroyed && this.syncModalMask()
    }
}

export default Neo.setupClass(Dialog);
