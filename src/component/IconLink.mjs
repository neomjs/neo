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
         * @member {String|null} iconCls_=null
         * @reactive
         */
        iconCls_: null,
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
            {tag: 'i', cls: []}
        ]}
    }

    /**
     * Triggered after the iconCls config got changed
     * @param {String|String[]|null} value
     * @param {String|String[]|null} oldValue
     */
    afterSetIconCls(value, oldValue) {
        let me   = this,
            node = me.vdom.cn[0],
            cls  = node.cls || [];

        NeoArray.removeAdd(cls, oldValue, value);

        node.cls = cls;
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
     * Triggered before the iconCls config gets changed. Converts the string into an array if needed.
     * @param {Array|String|null} value    The new value of the iconCls config.
     * @param {Array|String|null} oldValue The old value of the iconCls config.
     * @returns {Array}
     * @protected
     */
    beforeSetIconCls(value, oldValue) {
        if (value && !Array.isArray(value)) {
            value = value.split(' ').filter(Boolean)
        }

        return value
    }
}

export default Neo.setupClass(IconLink);
