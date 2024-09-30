import NeoArray from '../util/Array.mjs';
import Panel    from '../container/Panel.mjs';
import Toolbar  from './header/Toolbar.mjs';
import VDomUtil from '../util/VDom.mjs';

let DragZone;

/**
 * @class Neo.dialog.Base
 * @extends Neo.container.Panel
 */
class Base extends Panel {
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
         */
        animateTargetId_: null,
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Boolean} autoRender=true
         */
        autoRender: true,
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
         */
        keys: {
            Escape: 'onKeyDownEscape'
        },
        /**
         * @member {String} maximizeCls='far fa-window-maximize'
         */
        maximizeCls: 'far fa-window-maximize',
        /**
         * @member {Boolean} maximized_=false
         */
        maximized_: false,
        /**
         * @member {String} minimizeCls='far fa-window-minimize'
         */
        minimizeCls: 'far fa-window-minimize',
        /**
         * @member {Boolean} modal_=false
         */
        modal_: false,
        /**
         * @member {Boolean} resizable_=true
         */
        resizable_: true,
        /**
         * @member {Object} resizablePluginConfig=null
         */
        resizablePluginConfig: null,
        /**
         * @member {String|null} title_=null
         */
        title_: null,
        /**
         * Set to `true` to have tabbing wrap within this Dialog.
         * Should be used with `modal`.
         * @member {Boolean} trapFocus_=false
         */
        trapFocus_: false
    }

    /**
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
     * Triggered after the animateTargetId config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAnimateTargetId(value, oldValue) {
        this.autoMount  = !value;
        this.autoRender = !value
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

        me.rendered && me.syncModalMask()
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
        oldValue !== undefined && this.syncTrapFocus()
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
                let me                  = this,
                    {appName, windowId} = me,
                    plugins             = me.plugins || [];

                plugins.push({
                    module       : module.default,
                    appName,
                    delegationCls: 'neo-dialog',
                    windowId,
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
            appName, rects;

        // Assuming that we want to show the dialog inside the same browser window as the animation target
        me.windowId = animateTarget.windowId;
        me.appName  = appName = animateTarget.appName;

        rects = await me.getDomRect([id, me.animateTargetId])

        await Neo.applyDeltas(appName, {
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

        await Neo.applyDeltas(appName, {
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
            await Neo.applyDeltas(appName, {id, action: 'removeNode'})
        }
    }

    /**
     *
     */
    async animateShow() {
        let me                         = this,
            {animateTarget, id, style} = me,
            appName, rect;

        // Assuming that we want to show the dialog inside the same browser window as the animation target
        me.windowId = animateTarget.windowId;
        me.appName  = appName = animateTarget.appName;

        rect = await me.getDomRect(me.animateTargetId);

        // rendered outside the visible area
        await me.render(true);

        let [dialogRect, bodyRect] = await me.getDomRect([me.id, 'document.body']);

        // Move to cover the animation target
        await Neo.applyDeltas(appName, {
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
        await Neo.applyDeltas(appName, {
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

        // Remove the animation class
        await Neo.applyDeltas(appName, {id, cls: {remove: ['animated-hiding-showing']}});

        me.show(false)
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
            me.fire('close');
            me.destroy(true)
        }
    }

    /**
     * @param {Boolean} animate=!!this.animateTargetId
     */
    async closeOrHide(animate=!!this.animateTargetId) {
        let me = this;

        me[me.closeAction](animate);
        await me.timeout(30);
        me.syncModalMask(me.id)
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
     *
     */
    createHeader() {
        let me                  = this,
            {appName, windowId} = me,
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
            listeners: {headerAction: me.executeHeaderAction, scope: me},
            title    : me.title,
            windowId,
            ...me.headerConfig
        });

        headers.unshift(me.headerToolbar);

        me.headers = headers
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
     * Returns the id of the animation node
     * @returns {String}
     */
    getAnimateTargetId() {
        return this.id + '-animate'
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
     * @param {Boolean} animate=!!this.animateTargetId
     */
    async hide(animate=!!this.animateTargetId) {
        let me = this;

        if (animate) {
            me.animateHide()
        } else {
            me.unmount();
            me.fire('hide')
        }

        await me.timeout(30);

        me.syncModalMask()
    }

    /**
     *
     */
    init() {
        super.init();

        let me = this;

        if (me.animateTargetId) {
            me.autoShow && me.show()
        } else {
            me.timeout(100).then(() => {
                me.syncModalMask()
            })
        }
    }

    /**
     * @param {Object} [data]
     */
    maximize(data) {
        let me = this;

        data.component.iconCls = me.maximized ? me.maximizeCls : me.minimizeCls;

        me.maximized = !me.maximized
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
     *
     */
    onKeyDownEscape() {
        this.hidden = true
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
     * @param {Boolean} animate=!!this.animateTargetId
     */
    show(animate=!!this.animateTargetId) {
        let me = this;

        if (animate) {
            me.animateShow()
        } else {
            if (!me.mounted) {
                me.render(true)
            }

            me.fire('show')
        }

        me.syncModalMask()
    }

    /**
     * @param {String} id=this.id
     */
    syncModalMask(id=this.id) {
        let {modal, windowId} = this;

        // This should sync the visibility and position of the modal mask element.
        Neo.main.DomAccess.syncModalMask({id, modal, windowId})
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
}

export default Neo.setupClass(Base);
