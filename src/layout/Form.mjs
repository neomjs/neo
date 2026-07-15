import Base from './Base.mjs';

const wrapperClsOwner = Symbol('layout.Form.wrapperCls');

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
         * @reactive
         */
        containerCls: 'neo-layout-form',
        /**
         * flex css allows gap. This adds it to the component style
         * @member {String} gap_=null
         * @reactive
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
        let wrapperCls = [];

        if (!item.ignoreLayout) {
            if (item.ntype === 'fieldset') {
                wrapperCls.push('neo-layout-form-subfieldset')
            } else if (item.ntype === 'legend') {
                wrapperCls.push('neo-layout-form-legend')
            } else {
                wrapperCls.push('neo-layout-form-item')
            }
        }

        this.setItemWrapperClsContribution(item, wrapperClsOwner, wrapperCls)
    }

    /**
     * Removes all CSS rules from an container item this layout is bound to.
     * Gets called when switching to a different layout.
     * @param {Neo.component.Base} item
     * @param {Number} index
     * @protected
     */
    removeChildAttributes(item, index) {
        let style = item.wrapperStyle || {};

        this.setItemWrapperClsContribution(item, wrapperClsOwner, []);

        style.flex = item.flex || null;
        item.wrapperStyle = style
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
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
