import Base         from './Base.mjs';
import ToastManager from '../manager/Toast.mjs';

/**
 * @class Neo.dialog.Toast
 * @extends Neo.dialog.Base
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
            slideDirection  : 'right',      // 'down'
            title           : 'Alarm Clock' // null
        })
 */
class Toast extends Base {
    /**
     * If true makes the toast sticky and show a close icon
     * @member {Boolean} closable=false
     */
    closable = false
    /**
     * Change to use your own fade out animation
     * @member {String} fadeOutCls='neo-toast-fade-out'
     */
    fadeOutCls = 'neo-toast-fade-out'
    /**
     * If set, it shows this icon in front of the text
     * e.g. 'fa fa-cog'
     * @member {String|null} iconCls=null
     */
    iconCls = null
    /**
     * Used by the ToastManager
     * @member {Boolean} running=false
     * @private
     */
    running = false
    /**
     * Change the complete styling with custom cls
     * @member {String} toastCls='neo-toast-'
     */
    toastCls = 'neo-toast-'
    /**
     * Used by the ToastManager
     * @member {String|null} toastManagerId=null
     * @private
     */
    toastManagerId = null

    static getConfig() {return {
        /**
         * @member {String} className='Neo.dialog.Toast'
         * @protected
         */
        className: 'Neo.dialog.Toast',
        /**
         * @member {String} ntype='toast'
         * @protected
         */
        ntype: 'toast',
        /**
         * The Toast should not be moved
         * @member {Boolean} draggable=false
         */
        draggable: false,
        /**
         * Header is not meant to be shown.
         * @member {Object} headerConfig={hidden:true}
         */
        headerConfig: {
            hidden: true
        },
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
         * This creates a cls `toastCls + position`
         * @member {'tl'|'tc'|'tr'|'bl'|'bc'|'br'} position='tr'
         */
        position_: 'tr',
        /**
         * @member {Boolean} resizable=false
         */
        resizable: false,
        /**
         * Describes which direction from which side the toasts slides-in
         * This creates a cls `toastCls + slide- + direction + in`
         * @member {'down'|'up'|'left'|'right'} slideDirection_=null
         */
        slideDirection_: 'down',
        /**
         * Timeout in ms after which the toast is removed
         * @member {Number} timeout_=3000
         */
        timeout_: 3000,
        /**
         * @member {String|null} title=null
         */
        title: null,
        /**
         * @member {Function} itemTpl
         */
        itemTpl: data => {
            let cls = data.cls;

            return [
                {cls: [`${cls}icon`, data.iconCls], removeDom: !data.iconCls},
                {cls: `${cls}text`, cn: [
                    {cls: `${cls}title`, innerHTML: `${data.title}`, removeDom: !data.title},
                    {cls: `${cls}msg`,   innerHTML: `${data.msg}`}
                ]},
                {cls: `${cls}close fa fa-close`, removeDom: !data.closable}
        ]}
    }}

    /**
     * Using the afterSetMsg to trigger the setup of the dom
     * A new container is added as an item.
     * We cannot use the vdom here.
     *
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetMsg(value, oldValue) {
        let me       = this,
            toastCls = me.toastCls,
            data     = {closable: me.closable, cls: toastCls, iconCls: me.iconCls, msg: me.msg, title: me.title},
            titleCls = (me.title && me.iconCls) ? `${toastCls}has-title` : '',
            vdom     = {cn: me.itemTpl(data)};

        me.add({
            cls: [`${toastCls}inner`, titleCls],
            vdom
        });

        // if closable add a listener to the close-element
        me.closable && me.addDomListeners([
            {click: {fn: me.unregister, delegate: `.${me.toastCls}close`, scope: me}}
        ])
    }

    /**
     * Apply a cls, based on the position
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetPosition(value, oldValue) {
        value && this.addCls(`${this.toastCls}${value}`)
    }

    /**
     * Apply a cls, based on the slideDirection
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetSlideDirection(value, oldValue) {
        value && this.addCls(`${this.toastCls}slide-${value}-in`)
    }

    /**
     * Close the toast after the timeout if not closable
     * @param {Number} value
     * @param {Number} oldValue
     */
    async afterSetTimeout(value, oldValue) {
        if (!this.closable && value) {
            await Neo.timeout(value);
            this.unregister();
        }
    }

    /**
     * After the close-click or timeout, we unregister the toast
     * from the ToastManager
     */
    unregister() {
        let me = this;

        me.addDomListeners({
            animationend: function () {
                ToastManager.removeToast(me.toastManagerId);
                me.destroy(true);
            }
        })

        me.addCls(me.fadeOutCls);
    }
}

Neo.applyClassConfig(Toast);

export default Toast;
