import Button from './Base.mjs';

/**
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
         * @member {String} _vdom
         */
        _vdom: {
            cn: [{
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
}

Neo.applyClassConfig(Split);

export {Split as default};