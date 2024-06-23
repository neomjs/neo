import Component from './Base.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @class Neo.component.Chip
 * @extends Neo.component.Base
 */
class Chip extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.Chip'
         * @protected
         */
        className: 'Neo.component.Chip',
        /**
         * @member {String} ntype='chip'
         * @protected
         */
        ntype: 'chip',
        /**
         * @member {String[]} baseCls=['neo-chip']
         */
        baseCls: ['neo-chip'],
        /**
         * True shows a close button on the right side
         * @member {Boolean} closable_=true
         */
        closable_: true,
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
        _vdom:
        {tabIndex: -1, cn: [
            {tag: 'span', cls: ['neo-chip-glyph']},
            {tag: 'span', cls: ['neo-chip-text']},
            {tag: 'span', cls: ['neo-chip-close-button', 'far fa-times-circle']}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        if (me.useDomListeners) {
            me.addDomListeners({
                click   : me.onCloseButtonClick,
                delegate: 'neo-chip-close-button',
                scope   : me
            })
        }
    }

    /**
     * Triggered after the closable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetClosable(value, oldValue) {
        this.vdom.cn[2].removeDom = !value;
        this.update()
    }

    /**
     * Triggered after the display config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetDisplay(value, oldValue) {
        let style = this.style;
        style.display = value;
        this.style = style
    }

    /**
     * Triggered after the iconCls config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetIconCls(value, oldValue) {
        let me       = this,
            iconNode = me.vdom.cn[0];

        NeoArray.remove(iconNode.cls, oldValue);

        if (!value || value === '') {
            iconNode.removeDom = true
        } else {
            iconNode.removeDom = false;
            NeoArray.add(iconNode.cls, value)
        }

        me.update()
    }

    /**
     * Triggered after the text config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetText(value, oldValue) {
        let textNode = this.vdom.cn[1];

        if (!value || value === '') {
            textNode.removeDom = true
        } else {
            textNode.removeDom = false;
            textNode.innerHTML = value
        }

        this.update()
    }

    /**
     * @param {Object} data
     */
    onCloseButtonClick(data) {

    }
}

Neo.setupClass(Chip);

export default Chip;
