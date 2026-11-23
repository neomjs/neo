import Button from './Base.mjs';

/**
 * A wrapper div containing 2 Buttons.
 * We are extending button.Base and are using getVdomRoot() to map the main Button into the first vdom child.
 * A click on the main button runs its handler. The trigger button opens the menu, if one is configured,
 * and runs splitButtonHandler.
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
         * @reactive
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
         * @reactive
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
     * Creates the trigger button as a child this split button references in its vdom, so it renders once
     * and updates in place. A click on it runs this split button's own splitButtonHandler, never a controller
     * method of that name; a handler name in triggerButtonConfig resolves from this split button's controllers.
     * It owns the menu, in this split button's theme: the menu aligns to it, a click on it toggles the menu, and
     * a press anywhere else closes it.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.triggerButton = Neo.create({
            module      : Button,
            appName     : me.appName,
            cls         : ['neo-trigger-button'],
            disabled    : me.disabled,
            handler     : data => me.splitButtonHandler(data),
            handlerScope: me,
            hidden      : me.hideTriggerButton,
            iconCls     : me.triggerButtonIconCls,
            menu        : me.menu,
            parentId    : me.id,
            pressed     : me.pressed,
            theme       : me.theme,
            ui          : me.ui,
            windowId    : me.windowId,
            ...me.triggerButtonConfig
        });

        me.vdom.cn.push(me.triggerButton.createVdomReference());
        me.update()
    }

    /**
     * Triggered after the appName config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        let {triggerButton} = this;

        if (triggerButton) {
            triggerButton.appName = value;
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
        let {triggerButton} = this;

        if (triggerButton) {
            triggerButton.disabled = value;
        }

        super.afterSetDisabled(value, oldValue);
    }



    /**
     * Triggered after the hideTriggerButton config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetHideTriggerButton(value, oldValue) {
        let {triggerButton} = this;

        if (triggerButton) {
            triggerButton.hidden = value;
        }
    }

    /**
     * Triggered after the menu config got changed. The trigger button owns the menu, so this split button
     * builds no list of its own, and a click on the main button leaves the menu alone.
     * @param {Object|Object[]|null} value
     * @param {Object|Object[]|null} oldValue
     * @protected
     */
    afterSetMenu(value, oldValue) {
        let {triggerButton} = this;

        if (triggerButton) {
            triggerButton.menu = value
        }
    }

    /**
     * Triggered after the pressed config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetPressed(value, oldValue) {
        let {triggerButton} = this;

        if (triggerButton) {
            triggerButton.pressed = value;
        }

        super.afterSetPressed(value, oldValue);
    }

    /**
     * Triggered after the theme config got changed. The trigger button follows, and with it the floating menu it
     * owns, which inherits no theme from the page where it floats.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        let {triggerButton} = this;

        if (triggerButton) {
            triggerButton.theme = value
        }

        super.afterSetTheme(value, oldValue)
    }

    /**
     * Triggered after the triggerButtonIconCls config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTriggerButtonIconCls(value, oldValue) {
        let {triggerButton} = this;

        if (triggerButton) {
            triggerButton.iconCls = value;
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetUi(value, oldValue) {
        let me                     = this,
            {ntype, triggerButton} = me;

        if (triggerButton) {
            triggerButton.ui = value;
        }

        // we do want to assign a button based ui to the vdomRoot
        me.ntype = 'button';
        super.afterSetUi(value, oldValue);
        me.ntype = ntype;
    }

    /**
     * Triggered after the windowId config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        let {triggerButton} = this;

        if (triggerButton) {
            triggerButton.windowId = value
        }

        super.afterSetWindowId(value, oldValue)
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
     * A click on the trigger button reaches this split button as well: the trigger is its child, and a DOM event
     * bubbles through a component's logical parents. That click belongs to the trigger, which opens the menu and
     * runs splitButtonHandler, so this split button runs its own handler only for a click on the main button.
     * @param {Object} data The click event data object.
     */
    onClick(data) {
        let {triggerButton} = this;

        if (!triggerButton || !data.path?.some(node => node.id === triggerButton.id)) {
            super.onClick(data)
        }
    }

    /**
     * Runs on a click on the trigger button, in the scope of this split button. Override as needed or pass a
     * controller based handler into triggerButtonConfig.
     * @param {Object} data The click event data object.
     */
    splitButtonHandler(data) {

    }

    /**
     * Toggles the menu, which the trigger button owns.
     */
    async toggleMenu() {
        await this.triggerButton.toggleMenu()
    }
}

export default Neo.setupClass(Split);
