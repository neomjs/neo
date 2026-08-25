import Component from './Base.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @summary A compact value/status component with an optional, accessible removal action.
 *
 * The close affordance is a native button. Pointer clicks and keyboard activation therefore share
 * one browser-owned interaction path, and consumers listen to the semantic `remove` event instead
 * of re-implementing key handling around the chip.
 *
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
         * @reactive
         */
        closable_: true,
        /**
         * Convenience shortcut for style.display
         * @member {String} display_='inline-flex'
         * @reactive
         */
        display_: 'inline-flex',
        /**
         * The CSS class to use for an icon, e.g. 'fa fa-home'
         * @member {String|null} [iconCls_=null]
         * @reactive
         */
        iconCls_: null,
        /**
         * Accessible name for the close button.
         * @member {String|null} removeLabel_='Remove'
         * @reactive
         */
        removeLabel_: 'Remove',
        /**
         * The text displayed on the button [optional]
         * @member {String|null} text=null
         * @reactive
         */
        text: null,
        /**
         * Set this one to false when used in lists
         * @member {Boolean} useDomListeners=true
         */
        useDomListeners: true,
        /**
         * Consumer-owned identity emitted with the `remove` event.
         * @member {*} value=null
         */
        value: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tabIndex: -1, cn: [
            {tag: 'span', cls: ['neo-chip-glyph']},
            {tag: 'span', cls: ['neo-chip-text']},
            {tag: 'button', type: 'button', 'aria-label': 'Remove', cls: ['neo-chip-close-button', 'far fa-times-circle']}
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
     * @summary Keeps the native close button unavailable whenever the chip itself is disabled.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDisabled(value, oldValue) {
        super.afterSetDisabled(value, oldValue);

        const closeButton = this.vdom.cn[2];

        if (value) {
            closeButton.disabled = true
        } else {
            delete closeButton.disabled
        }

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
     * @summary Updates the close button's action-specific accessible name.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetRemoveLabel(value, oldValue) {
        const closeButton = this.vdom.cn[2];

        if (value) {
            closeButton['aria-label'] = value
        } else {
            delete closeButton['aria-label']
        }

        this.update()
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
            textNode.text      = value
        }

        this.update()
    }

    /**
     * @summary Emits one semantic removal intent for pointer and keyboard activation alike.
     * @param {Object} data
     * @protected
     */
    onCloseButtonClick(data) {
        let me = this;

        if (!me.disabled && me.closable) {
            data.cancelBubble = true;

            me.fire('remove', {
                component: me,
                value    : me.value
            })
        }
    }
}

/**
 * The remove event fires when the native close button gets activated.
 * @event remove
 * @param {Neo.component.Chip} component
 * @param {*} value
 */

export default Neo.setupClass(Chip);
