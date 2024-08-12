import Base         from '../component/Base.mjs';
import NeoArray     from "../util/Array.mjs";
import ToastManager from '../manager/Toast.mjs';

/**
 * @class Neo.component.Toast
 * @extends Neo.component.Base
 *
 * @example
        Neo.toast({
            // mandatory
            appName         : this.component.appName,
            msg             : 'Alarm was set to 11:30 for journey into Neo development',
            // optional                        defaults
            closable        : true,         // false
            iconCls         : 'fa fa-bell', // null
            maxWidth        : 300,          // 250
            position        : 'br',         // 'tr'
            slideDirection  : 'right',      // 'right'
            title           : 'Alarm Clock' // null
        })
 */
class Toast extends Base {
    /**
     * Valid values for positions
     * @member {String[]} positions = ['tl','tc','tr','bl','bc','br']
     * @protected
     * @static
     */
    static positions = ['tl', 'tc', 'tr', 'bl', 'bc', 'br']
    /**
     * True automatically applies the core/Observable.mjs mixin
     * @member {String[]} slideDirections = ['down','up','left','right']
     * @static
     */
    static slideDirections = ['down', 'up', 'left', 'right']

    static config = {
        /**
         * @member {String} className='Neo.component.Toast'
         * @protected
         */
        className: 'Neo.component.Toast',
        /**
         * @member {String} ntype='toast'
         * @protected
         */
        ntype: 'toast',
        /**
         * @member {String[]} baseCls=['neo-toast']
         * @protected
         */
        baseCls: ['neo-toast'],
        /**
         * If true makes the toast sticky and show a close icon
         * @member {Boolean} closable=false
         */
        closable_: false,
        /**
         * @member {Boolean} floating=true
         */
        floating: true,
        /**
         * If set, it shows this icon in front of the text
         * e.g. 'fa fa-cog'
         * @member {String|null} iconCls=null
         */
        iconCls_: null,
        /**
         * Limits the width of the Toast
         * @member {Number} maxWidth=250
         */
        maxWidth: 250,
        /**
         * Sets the minimum height of the Toast
         * @member {Number} minHeight=50
         */
        minHeight: 50,
        /**
         * Your message. You can also pass in an iconCls
         * @member {String|null} msg_=null
         */
        msg_: null,
        /**
         * Describes the position of the toast, e.g. bl=bottom-left
         * This creates a cls `noe-toast-position`
         * @member {'tl'|'tc'|'tr'|'bl'|'bc'|'br'} position='tr'
         */
        position_: 'tr',
        /**
         * Describes which direction from which side the toasts slides-in
         * This creates a cls `neo-toast-slide-${direction}-in`
         * @member {'down'|'up'|'left'|'right'} slideDirection_='right'
         */
        slideDirection_: 'right',
        /**
         * Adds a title to the toast
         * @member {Number} title_=null
         */
        title_: null,
        /**
         * @member {String|null} title=null
         */
        vdom:
        {cn: [{
            cls: 'neo-toast-inner', cn: [
                {cls: ['neo-toast-icon'], removeDom: true},
                {cls: 'neo-toast-text', cn: [
                    {cls: ['neo-toast-title'], removeDom: true},
                    {cls: 'neo-toast-msg'}
                ]},
                {cls: ['neo-toast-close', 'fa', 'fa-close'], removeDom: true}
            ]
        }]}
    }

    /**
     * Timeout in ms after which the toast is removed
     * @member {Number} removeDelay=3000
     */
    removeDelay = 3000
    /**
     * Used by the ToastManager
     * @member {Boolean} running=false
     * @private
     */
    running = false

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        // click listener for close
        me.addDomListeners([
            {click: {fn: me.destroy, delegate: '.neo-toast-close', scope: me}}
        ]);

        ToastManager.register(me)
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetClosable(value, oldValue) {
        let vdom = this.getVdomInner().cn[2];

        vdom.removeDom = !value
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetIconCls(value, oldValue) {
        let vdom  = this.getVdomInner().cn[0],
            {cls} = vdom;

        vdom.removeDom = Neo.isEmpty(value);
        NeoArray[value ? 'add' : 'remove'](cls, value)
    }

    /**
     * Using the afterSetMsg to trigger the setup of the dom
     * A new container is added as an item.
     * We cannot use the vdom here.
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetMsg(value, oldValue) {
        let vdom = this.getTextRootVdom().cn[1];

        vdom.innerHTML = value
    }

    /**
     * Apply a cls, based on the position
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetPosition(value, oldValue) {
        value && this.addCls(`neo-toast-${value}`)
    }

    /**
     * Apply a cls, based on the slideDirection
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetSlideDirection(value, oldValue) {
        value && this.addCls(`neo-toast-slide-${value}-in`)
    }

    /**
     * Close the toast after the mounted if not closable
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me = this;

        if (!me.closable && value) {
            me.timeout(me.removeDelay).then(() => {
                me.destroy(true)
            })
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetTitle(value, oldValue) {
        let vdom = this.getTextRootVdom().cn[0];

        vdom.removeDom = Neo.isEmpty(value);
        vdom.innerHTML = value;
        NeoArray[value ? 'add' : 'remove'](vdom.cls, 'neo-toast-has-title')
    }

    /**
     * Triggered before the position config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'position')
    }

    /**
     * Triggered before the slideDirection config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetSlideDirection(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'slideDirection')
    }

    /**
     *
     */
    async destroy(...args) {
        let me = this;
        const superDestroy = super.destroy.bind(me);

        me.addDomListeners({
            animationend: function () {
                ToastManager.removeToast(me.id);
                ToastManager.unregister(me);
                superDestroy(...args);
            }
        });

        me.addCls('neo-toast-fade-out')
    }

    /**
     * This is a dialog, so we have to add an item to be able to
     * @returns {Object} vdom
     */
    getTextRootVdom() {
        return this.getVdomInner().cn[1]
    }

    /**
     * This is a dialog, so we have to add an item to be able to
     * @returns {Object} vdom
     */
    getVdomInner() {
        return this.vdom.cn[0]
    }
}

Neo.setupClass(Toast);

export default Toast;
