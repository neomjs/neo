import Button from './Base.mjs';

/**
 * A wrapper div containing 2 Buttons.
 * We are extending button.Base and are using getVdomRoot() to map the main Button into the first vdom child.
 * @class Neo.button.Split
 * @extends Neo.button.Base
 */
class Split extends Button {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.button.Split'
         * @protected
         */
        className: 'Neo.button.Split',
        /**
         * @member {String} ntype='split-button'
         * @protected
         */
        ntype: 'split-button',
        /**
         * Read only, it will get created inside the ctor.
         * Use triggerButtonConfig to pass initial config for it.
         * @member {Neo.button.Base|null} triggerButton=null
         * @protected
         */
        triggerButton: null,
        /**
         * Configs to apply to the trigger button instance
         * @member {Object|null} triggerButtonConfig=null
         * @protected
         */
        triggerButtonConfig: null,
        /**
         * The CSS class to use for the SplitButton icon, e.g. 'fa fa-home'
         * @member {String} triggerButtonCls_='fa fa-caret-down'
         */
        triggerButtonIconCls_: 'fa fa-caret-down',
        /**
         * @member {String} _vdom
         */
        _vdom: {
            cls: ['neo-split-button'],
            cn : [{
                tag: 'button',
                cn : [{
                    tag: 'span',
                    cls: ['neo-button-glyph']
                },{
                    tag: 'span',
                    cls: ['neo-button-text']
                }]
            }]
        }
    }}

    /**
     *
     * @returns {Object} The new vdom root
     */
    getVdomRoot() {
        return this.vdom.cn[0];
    }

    /**
     *
     * @returns {Object} The new vnode root
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0];
    }

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me   = this,
            vdom = me.vdom;

        me.triggerButton = Neo.create({
            module  : Button,
            appName : me.appName,
            disabled: me.disabled,
            handler : me.splitButtonHandler,
            iconCls : me.triggerButtonIconCls,
            parentId: me.id,
            pressed : me.pressed,
            ...me.triggerButtonConfig || {}
        });

        vdom.cn.push(me.triggerButton.vdom);
        me.vdom = vdom;
    }

    /**
     * Triggered after the disabled config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDisabled(value, oldValue) {
        let me = this;

        if (me.triggerButton) {
            me.triggerButton.disabled = value;
        }

        super.afterSetDisabled(value, oldValue);
    }

    /**
     * Triggered after the pressed config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetPressed(value, oldValue) {
        let me = this;

        if (me.triggerButton) {
            me.triggerButton.pressed = value;
        }

        super.afterSetPressed(value, oldValue);
    }

    /**
     * Triggered after the triggerButtonIconCls config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTriggerButtonIconCls(value, oldValue) {
        let me = this;

        if (me.triggerButton) {
            me.triggerButton.iconCls = value;
        }
    }

    /**
     *
     * @param {Boolean} [updateParentVdom=false]
     * @param {Boolean} [silent=false]
     */
    destroy(updateParentVdom=false, silent=false) {
        this.triggerButton.destroy(); // default opts => no parent update
        super.destroy(updateParentVdom, silent);
    }

    /**
     * Override as needed or pass a controller based handler into triggerButtonConfig
     * @param {Object} data
     */
    splitButtonHandler(data) {

    }
}

Neo.applyClassConfig(Split);

export {Split as default};