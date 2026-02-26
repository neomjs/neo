import Component from './Base.mjs';
import NeoArray  from '../util/Array.mjs';

/**
 * @class Neo.component.IconLink
 * @extends Neo.component.Base
 */
class IconLink extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.IconLink'
         * @protected
         */
        className: 'Neo.component.IconLink',
        /**
         * @member {String} ntype='icon-link'
         * @protected
         */
        ntype: 'icon-link',
        /**
         * @member {String[]} baseCls=['neo-icon-link']
         */
        baseCls: ['neo-icon-link'],
        /**
         * @member {String|null} cellIconCls_=null
         * @reactive
         */
        cellIconCls_: null,
        /**
         * @member {String|null} label_=null
         * @reactive
         */
        label_: null,
        /**
         * @member {String} tag='a'
         */
        tag: 'a',
        /**
         * @member {String} target_='_blank'
         * @reactive
         */
        target_: '_blank',
        /**
         * @member {String|null} url_=null
         * @reactive
         */
        url_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'i', cls: []},
            {tag: 'span', cls: ['neo-link-label'], style: {visibility: 'hidden'}}
        ]}
    }

    /**
     * Triggered after the cellIconCls config got changed
     * @param {String|String[]|null} value
     * @param {String|String[]|null} oldValue
     */
    afterSetCellIconCls(value, oldValue) {
        let me   = this,
            node = me.vdom.cn[0],
            cls  = node.cls || [];

        NeoArray.removeAdd(cls, oldValue, value);

        node.cls = cls;
        me.update()
    }

    /**
     * Triggered after the label config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetLabel(value, oldValue) {
        let me   = this,
            node = me.vdom.cn[1];

        if (value) {
            node.html = value;
            delete node.style
        } else {
            node.style = {visibility: 'hidden'}
        }

        me.update()
    }

    /**
     * Triggered after the target config got changed
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetTarget(value, oldValue) {
        this.changeVdomRootKey('target', value)
    }

    /**
     * Triggered after the url config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetUrl(value, oldValue) {
        let me = this;

        if (value) {
            me.vdom.href = value;
            me.hidden    = false
        } else {
            delete me.vdom.href;
            me.hidden = true
        }

        me.update()
    }

    /**
     * Triggered before the cellIconCls config gets changed. Converts the string into an array if needed.
     * @param {Array|String|null} value    The new value of the cellIconCls config.
     * @param {Array|String|null} oldValue The old value of the cellIconCls config.
     * @returns {Array}
     * @protected
     */
    beforeSetCellIconCls(value, oldValue) {
        if (value && !Array.isArray(value)) {
            value = value.split(' ').filter(Boolean)
        }

        return value
    }
}

export default Neo.setupClass(IconLink);
