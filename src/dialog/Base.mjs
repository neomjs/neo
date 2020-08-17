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
        this.createHeader();
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