import Panel    from '../container/Panel.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @class Neo.dialog.Base
 * @extends Neo.container.Panel
 */
class Base extends Panel {
    static getConfig() {return {
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
         * @member {String|null} animateTargetId=null
         */
        animateTargetId: null,
        /**
         * @member {Boolean} autoMount=true
         * @protected
         */
        autoMount: true,
        /**
         * @member {Boolean} autoRender=true
         * @protected
         */
        autoRender: true,
        /**
         * @member {String[]} cls=['neo-dialog','neo-panel','neo-container']
         * @protected
         */
        cls: ['neo-dialog', 'neo-panel', 'neo-container'],
        /**
         * @member {Boolean} draggable_=true
         */
        draggable_: true,
        /**
         * @member {String} maximizeCls='far fa-window-maximize'
         */
        maximizeCls: 'far fa-window-maximize',
        /**
         * @member {Boolean} draggable_=false
         */
        maximized_: false,
        /**
         * @member {String} minimizeCls='far fa-window-minimize'
         */
        minimizeCls: 'far fa-window-minimize'
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.createHeader();

        if (me.animateTargetId) {
            me.animateShow();
        }
    }

    /**
     * Triggered after the draggable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDraggable(value, oldValue) {
        let me       = this,
            vdom     = me.vdom,
            vdomRoot = me.getVdomRoot();

        if (value === true) {
            vdomRoot.draggable = true;
        } else {
            delete vdomRoot.draggable;
        }

        me.vdom = vdom;
    }

    /**
     * Triggered after the maximized config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMaximized(value, oldValue) {
        let me  = this,
            cls = me.cls;

        NeoArray[value ? 'add' : 'remove'](cls, 'neo-maximized');
        me.cls = cls;
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        if (value) {
            let me = this;

            if (me.animateTargetId) {
                Neo.currentWorker.promiseMessage('main', {
                    action : 'updateDom',
                    appName: me.appName,
                    deltas : [{
                        action: 'removeNode',
                        id    : me.getAnimateTargetId()
                    }]
                });
            }
        }
    }

    /**
     *
     */
    animateShow() {
        let me        = this,
            autoMount = me.autoMount,
            id        = me.getAnimateTargetId();

        me.autoMount  = false;
        me.autoRender = false;

        Neo.main.DomAccess.getBoundingClientRect({
            id: me.animateTargetId
        }).then(rect => {
            console.log(rect);
            console.log(autoMount);

            Neo.currentWorker.promiseMessage('main', {
                action  : 'mountDom',
                appName : me.appName,
                html    : `<div id="${id}" class="neo-animate-dialog" style="height:${rect.height}px;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;"></div>`,
                parentId: 'document.body'
            }).then(() => {
                setTimeout(() => {
                    Neo.currentWorker.promiseMessage('main', {
                        action  : 'updateDom',
                        appName : me.appName,

                        deltas: [{
                            id   : id,
                            style: {
                                height   : me.height || '50%',
                                left     : '50%',
                                top      : '50%',
                                transform: 'translate(-50%, -50%)',
                                width    : me.width || '50%'
                            }
                        }]
                    }).then(() => {
                        setTimeout(() => {
                            me.render(true);
                        }, 250)
                    });
                }, 30);
            });
        });
    }

    /**
     * todo: add an animation in case the dialog has an animation origin
     */
    close() {
        this.destroy(true);
    }

    /**
     *
     */
    createHeader() {
        let me      = this,
            headers = me.headers || [];

        headers.unshift({
            cls  : ['neo-header-toolbar', 'neo-toolbar'],
            dock : 'top',
            items: [{
                ntype: 'label',
                text : 'Dialog Title'
            }, '->', {
                iconCls: 'far fa-window-maximize',
                handler: me.maximize.bind(me)
            }, {
                iconCls: 'far fa-window-close',
                handler: me.close.bind(me)
            }]
        });

        me.headers = headers;
    }

    /**
     * Returns the id of the animation node
     * @returns {String}
     */
    getAnimateTargetId() {
        return this.id + '-animate';
    }

    /**
     * @param {Object} data
     */
    maximize(data) {
        let me = this;

        data.component.iconCls = me.maximized ? me.maximizeCls : me.minimizeCls;

        me.maximized = !me.maximized;
    }
}

Neo.applyClassConfig(Base);

export {Base as default};