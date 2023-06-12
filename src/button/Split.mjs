import Button from './Base.mjs';

/**
 * A wrapper div containing 2 Buttons.
 * We are extending button.Base and are using getVdomRoot() to map the main Button into the first vdom child.
 * @class Neo.button.Split
 * @extends Neo.button.Base
 */
class Split extends Button {
    static config = {
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
         * @member {Boolean} hideTriggerButton_=false
         */
        hideTriggerButton_: false,
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
        _vdom:
        {cls: ['neo-split-button'], cn: [
            {tag: 'button', cn: [
                {tag: 'span', cls: ['neo-button-glyph']},
                {tag: 'span', cls: ['neo-button-text']},
                {cls: ['neo-button-badge']},
                {cls: ['neo-button-ripple-wrapper'], cn: [
                    {cls: ['neo-button-ripple']}
                ]}
            ]}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.triggerButton = Neo.create({
            module  : Button,
            appName : me.appName,
            cls     : ['neo-trigger-button'],
            disabled: me.disabled,
            handler : me.splitButtonHandler,
            hidden  : me.hideTriggerButton,
            iconCls : me.triggerButtonIconCls,
            parentId: me.vdom.id, // wrapper id
            pressed : me.pressed,
            ui      : me.ui,
            ...me.triggerButtonConfig
        });

        me.vdom.cn.push(me.triggerButton.vdom);
        me.update();
    }

    /**
     * Triggered after the appName config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        if (this.triggerButton) {
            this.triggerButton.appName = value;
        }

        super.afterSetAppName(value, oldValue);
    }

    /**
     * Triggered after the disabled config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDisabled(value, oldValue) {
        let triggerButton = this.triggerButton;

        if (triggerButton) {
            triggerButton.disabled = value;
        }

        super.afterSetDisabled(value, oldValue);
    }

    /**
     * Triggered after the id config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetId(value, oldValue) {
        this.vdom.id = value + '__wrapper';

        // silent vdom update, the super call will trigger the engine
        super.afterSetId(value, oldValue);
    }

    /**
     * Triggered after the hideTriggerButton config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetHideTriggerButton(value, oldValue) {
        let triggerButton = this.triggerButton;

        if (triggerButton) {
            triggerButton.hidden = value;
        }
    }

    /**
     * Triggered after the pressed config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetPressed(value, oldValue) {
        let triggerButton = this.triggerButton;

        if (triggerButton) {
            triggerButton.pressed = value;
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
        let triggerButton = this.triggerButton;

        if (triggerButton) {
            triggerButton.iconCls = value;
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetUi(value, oldValue) {
        let me            = this,
            ntype         = me.ntype,
            triggerButton = me.triggerButton;

        if (triggerButton) {
            triggerButton.ui = value;
        }

        // we do want to assign a button based ui to the vdomRoot
        me.ntype = 'button';
        super.afterSetUi(value, oldValue);
        me.ntype = ntype;
    }

    /**
     * @param {Boolean} [updateParentVdom=false]
     * @param {Boolean} [silent=false]
     */
    destroy(updateParentVdom=false, silent=false) {
        this.triggerButton.destroy(); // default opts => no parent update
        super.destroy(updateParentVdom, silent);
    }

    /**
     * @returns {Object} The new vdom root
     */
    getVdomRoot() {
        return this.vdom.cn[0];
    }

    /**
     * @returns {Object} The new vnode root
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0];
    }

    /**
     * Override as needed or pass a controller based handler into triggerButtonConfig
     * @param {Object} data
     */
    splitButtonHandler(data) {

    }
}

Neo.applyClassConfig(Split);

export default Split;
