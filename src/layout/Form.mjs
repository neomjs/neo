import Base     from './Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @class Neo.layout.Form
 * @extends Neo.layout.Base
 */
class Form extends Base {
    static config = {
        /**
         * @member {String} className='Neo.layout.Form'
         * @protected
         */
        className: 'Neo.layout.Form',
        /**
         * @member {String} ntype='layout-form'
         * @protected
         */
        ntype: 'layout-form',
        /**
         * @member {String|null} containerCls='neo-layout-fit'
         * @protected
         */
        containerCls: 'neo-layout-form',
        /**
         * flex css allows gap. This adds it to the component style
         * @member {String} gap_=null
         */
        gap_: null
    }

    /**
     * Updates the Container style to add a gap to display:flex
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetGap(value, oldValue) {
        if (!value && !oldValue) return;

        let {container}    = this,
            {wrapperStyle} = container;

        wrapperStyle.gap = value;

        container.wrapperStyle = wrapperStyle
    }

    /**
     * Applies the flex value to an item of the container this layout is bound to
     * @param {Neo.component.Base} item
     * @param {Number} index
     */
    applyChildAttributes(item, index) {
        if (!item.ignoreLayout) {
            if (item.ntype === 'fieldset') {
                item.wrapperCls = NeoArray.union(item.wrapperCls, 'neo-layout-form-subfieldset')
            } else if (child.ntype === 'legend') {
                item.wrapperCls = NeoArray.union(item.wrapperCls, 'neo-layout-form-legend')
            } else {
                item.wrapperCls = NeoArray.union(item.wrapperCls, 'neo-layout-form-item')
            }
        }
    }

    /**
     * Removes all CSS rules from an container item this layout is bound to.
     * Gets called when switching to a different layout.
     * @param {Neo.component.Base} item
     * @protected
     */
    removeChildAttributes(item) {
        let style = item.wrapperStyle || {};

        style.flex = item.flex || null;
        item.wrapperStyle = style
    }
}

Neo.setupClass(Form);

export default Form;
