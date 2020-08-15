import Panel    from './Panel.mjs';
import Floating from '../util/Floating.mjs';

/**
 * @class Neo.container.Dialog
 * @extends Neo.container.Panel
 */
class Dialog extends Panel {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.container.Dialog'
         * @protected
         */
        className: 'Neo.container.Dialog',
        /**
         * @member {String} ntype='dialog'
         * @protected
         */
        ntype: 'dialog',
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
         * @member {Array} mixins
         * @protected
         */
        mixins: [Floating]
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
     *
     */
    maximize() {
        let me    = this,
            style = me.style || {};

        Object.assign(style, {
            height   : '98%',
            left     : '1%',
            top      : '1%',
            transform: 'none',
            width    : '98%'
        });

        me.style = style;
    }
}

Neo.applyClassConfig(Dialog);

export {Dialog as default};