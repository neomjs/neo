import {default as Component} from './Base.mjs';
import NeoArray               from '../util/Array.mjs';

/**
 * @class Neo.component.Chip
 * @extends Neo.component.Base
 */
class Chip extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.Chip'
         * @private
         */
        className: 'Neo.component.Chip',
        /**
         * @member {String} ntype='chip'
         * @private
         */
        ntype: 'chip',
        /**
         * True shows a close button on the right side
         * @member {Boolean} closable_=true
         */
        closable_: true,
        /**
         * @member {String[]} cls=['neo-chip']
         */
        cls: ['neo-chip'],
        /**
         * Convenience shortcut for style.display
         * @member {String} display_='inline-flex'
         */
        display_: 'inline-flex',
        /**
         * The CSS class to use for an icon, e.g. 'fa fa-home'
         * @member {String|null} [iconCls_=null]
         */
        iconCls_: null,
        /**
         * The text displayed on the button [optional]
         * @member {String|null} text_=null
         */
        text_: null,
        /**
         * Set this one to false when used in lists
         * @member {Boolean} useDomListeners=true
         */
        useDomListeners: true,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            tabIndex: -1,
            cn: [{
                tag: 'span',
                cls: ['neo-chip-glyph']
            }, {
                tag: 'span',
                cls: ['neo-chip-text']
            }, {
                tag: 'span',
                cls: ['neo-chip-close-button', 'far fa-times-circle']
            }]
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this,
            domListeners;

        if (me.useDomListeners) {
            domListeners = me.domListeners;

            domListeners.push({
                click   : me.onCloseButtonClick,
                delegate: 'neo-chip-close-button',
                scope   : me
            });

            me.domListeners = domListeners;
        }
    }

    /**
     * Triggered after the closable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetClosable(value, oldValue) {
        let me   = this,
            vdom = me.vdom;

        vdom.cn[2].removeDom = !value;
        me.vdom = vdom;
    }

    /**
     * Triggered after the display config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetDisplay(value, oldValue) {
        let style = this.style;
        style.display = value;
        this.style = style;
    }

    /**
     * Triggered after the iconCls config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetIconCls(value, oldValue) {
        let me       = this,
            vdom     = me.vdom,
            iconNode = vdom.cn[0];

        NeoArray.remove(iconNode.cls, oldValue);

        if (!value || value === '') {
            iconNode.removeDom = true;
        } else {
            iconNode.removeDom = false;
            NeoArray.add(iconNode.cls, value);
        }

        me.vdom = vdom;
    }

    /**
     * Triggered after the text config got changed
     * @param {String} value
     * @param {String} oldValue
     * @private
     */
    afterSetText(value, oldValue) {
        let me       = this,
            vdom     = me.vdom,
            textNode = vdom.cn[1];

        if (!value || value === '') {
            textNode.removeDom = true;
        } else {
            textNode.removeDom = false;
            textNode.innerHTML = value;
        }

        me.vdom = vdom;
    }

    /**
     *
     * @param {Object} data
     */
    onCloseButtonClick(data) {
        console.log('onCloseButtonClick', data);
    }
}

Neo.applyClassConfig(Chip);

export {Chip as default};