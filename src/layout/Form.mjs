import Base     from './Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @summary Two-track CSS Grid + subgrid form layout aligning field labels and inputs across items.
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
         * @member {String|null} containerCls='neo-layout-form'
         * @protected
         * @reactive
         */
        containerCls: 'neo-layout-form',
        /**
         * CSS Grid `gap` (`row-gap column-gap`) applied to the bound container's wrapper style.
         * @member {String|null} gap_=null
         * @reactive
         */
        gap_: null
    }

    /**
     * @summary Syncs the bound container's CSS Grid `gap` style when `gap` changes.
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
     * @summary Stamps form-layout wrapper classes (`subfieldset`, `legend`, or `item`) onto non-ignored children.
     * @param {Neo.component.Base} item
     * @param {Number} index
     */
    applyChildAttributes(item, index) {
        if (!item.ignoreLayout) {
            if (item.ntype === 'fieldset') {
                item.wrapperCls = NeoArray.union(item.wrapperCls, 'neo-layout-form-subfieldset')
            } else if (item.ntype === 'legend') {
                item.wrapperCls = NeoArray.union(item.wrapperCls, 'neo-layout-form-legend')
            } else {
                item.wrapperCls = NeoArray.union(item.wrapperCls, 'neo-layout-form-item')
            }
        }
    }

    /**
     * @summary Resets child wrapper flex styling when switching away from this layout.
     * @param {Neo.component.Base} item
     * @param {Number} index
     * @protected
     */
    removeChildAttributes(item, index) {
        let style = item.wrapperStyle || {};

        style.flex = item.flex || null;
        item.wrapperStyle = style
    }

    /**
     * @summary Serializes the layout instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            gap: this.gap
        }
    }
}

export default Neo.setupClass(Form);
