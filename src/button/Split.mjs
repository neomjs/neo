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
         * @member {String[]} cls=['neo-split-button','neo-button']
         */
        cls: ['neo-split-button', 'neo-button'],
        /**
         * Read only, it will get created inside the ctor.
         * Use splitButtonConfig to pass initial config for it.
         * @member {Neo.button.Base|null} splitButton=null
         * @protected
         */
        splitButton: null,
        /**
         * Configs to apply to the split button instance
         * @member {Object|null} splitButton=null
         * @protected
         */
        splitButtonConfig: null,
        /**
         * @member {String} _vdom
         */
        _vdom: {
            cls: ['neo-split-button-wrapper'],
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

        me.splitButton = Neo.create({
            module: Button,
            ...me.splitButtonConfig || {}
        });

        vdom.cn.push(me.splitButton.vdom);
        me.vdom = vdom;
    }
}

Neo.applyClassConfig(Split);

export {Split as default};