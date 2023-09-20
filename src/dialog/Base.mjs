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
        title_: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.createHeader();

        me.autoShow && me.show()
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
            resizable = me.getPlugin({flag: 'resizable'});

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
        let me           = this,
            domListeners = me.domListeners,
            cls;

        if (oldValue !== undefined && me.headerToolbar) {
            cls = me.headerToolbar.cls;
            NeoArray[value ? 'add' : 'remove'](cls, 'neo-draggable');
            me.headerToolbar.cls = cls
        }

        value && import('../draggable/DragZone.mjs').then(module => {
            DragZone = module.default;

            if (!me.dragListenersAdded) {
                domListeners.push(
                    {'drag:end'  : me.onDragEnd,   scope: me, delegate: '.neo-header-toolbar'},
                    {'drag:start': me.onDragStart, scope: me, delegate: '.neo-header-toolbar'}
                );

                if (me.dragZoneConfig?.alwaysFireDragMove) {
                    domListeners.push(
                        {'drag:move': me.onDragMove, scope: me, delegate: '.neo-header-toolbar'}
                    )
                }

                me.domListeners       = domListeners;
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
    afterSetMaximized(value, oldValue) {
        let me  = this,
            cls = me.vdom.cls; // todo: using wrapperCls

        NeoArray.toggle(cls, 'neo-maximized', value);
        me.update();
    }

    /**
     * Triggered after the modal config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetModal(value, oldValue) {
        const
            me      = this,
            { cls } = me.vdom;

        NeoArray.toggle(cls, 'neo-modal', value);
        me.update();

        if (me.rendered) {
            me.syncModalMask()
        }
    }

    /**
     * Triggered after the resizable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetResizable(value, oldValue) {
        value && import('../plugin/Resizable.mjs').then(module => {
            let me      = this,
                plugins = me.plugins || [];

            if (!me.getPlugin({flag: 'resizable'})) {
                plugins.push({
                    module       : module.default,
                    appName      : me.appName,
                    delegationCls: 'neo-dialog',
                    flag         : 'resizable',
                    ...me.resizablePluginConfig
                });

                me.plugins = plugins
            }
        })
    }

    /**
     * Triggered after the title config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        if (this.headerToolbar) {
            this.headerToolbar.title = value
        }
    }

    /**
     *
     */
    async animateHide() {
        let me      = this,
            appName = me.appName,
            { id }  = me,
            rects   = await me.getDomRect([id, me.animateTargetId]);

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

        await Neo.applyDeltas(appName, [
            {id, cls: {remove: ['animated-hiding-showing']}},
            {id, action: 'removeNode'}
        ])
    }

    /**
     *
     */
    async animateShow() {
        let me            = this,
            appName       = me.appName,
            { id, style } = me,
            rect          = await me.getDomRect(me.animateTargetId);

        await me.render(true);

        // Move to cover the animation target
        await Neo.applyDeltas(appName, {
            id,
            style : {
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
                height   : style?.height    || '',
                left     : style?.left      || '50%',
                top      : style?.top       || '50%',
                transform: style?.transform || 'translate(-50%, -50%)',
                width    : style?.width     || '50%'
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
        const
            me     = this,
            { id } = me;

        me[me.closeAction](animate);
        await me.timeout(30);
        me.syncModalMask(id)
    }

    /**
     *
     */
    createHeader() {
        let me      = this,
            cls     = ['neo-header-toolbar', 'neo-toolbar'],
            headers = me.headers || [];

        me.draggable && cls.push('neo-draggable');

        me.headerToolbar = Neo.create({
            module   : Toolbar,
            appName  : me.appName,
            cls,
            dock     : 'top',
            flex     : 'none',
            id       : me.getHeaderToolbarId(),
            listeners: {headerAction: me.executeHeaderAction, scope: me},
            title    : me.title,
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
            close   : me.closeOrHide,
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

                    setTimeout(() => {
                        style = me.style;

                        style.transitionProperty = initialTransitionProperty;

                        me.style = style
                    }, 50)
                }

                me.style = style;

                me.dragZone.dragEnd(data);

                // we need a reset, otherwise we do not get a change event for the next onDragStart() call
                me.dragZone.boundaryContainerId = null;
                me.isDragging                   = false
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
        let me    = this,
            style = me.style || {};

        if (!me.maximized) {
            me.isDragging = true;

            me.getPlugin({flag: 'resizable'})?.removeAllNodes();

            if (!me.dragZone) {
                me.dragZone = Neo.create({
                    module             : DragZone,
                    appName            : me.appName,
                    bodyCursorStyle    : 'move !important',
                    boundaryContainerId: me.boundaryContainerId,
                    dragElement        : me.vdom,
                    dragProxyConfig    : {vdom: me.getProxyVdom()},
                    owner              : me,
                    useProxyWrapper    : false,
                    ...me.dragZoneConfig
                });

                me.fire('dragZoneCreated', {
                    dragZone: me.dragZone,
                    id      : me.id
                })
            } else {
                me.dragZone.boundaryContainerId = me.boundaryContainerId
            }

            me.dragZone.dragStart(data);

            style.opacity = 0.7;

            me.style = style
        }
    }

    /**
     * @param {Boolean} animate=!!this.animateTargetId
     */
    show(animate=!!this.animateTargetId) {
        let me = this;

        if (animate) {
            me.animateShow();
        } else {
            if (!me.rendered) {
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
        // This should sync the visibility and position of the modal mask element.
        Neo.main.DomAccess.syncModalMask({ id, modal : this.modal });
    }
}

Neo.applyClassConfig(Base);

export default Base;
