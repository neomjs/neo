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
         * flex css allows gap. This adds it to the component style
         * @member {String} gap_=null
         */
        gap_: null,
        /**
         * CSS className prefix
         * @member {String} prefix='neo-form-'
         */
        prefix: 'neo-layout-form-'
    }

    /**
     * Updates the Container style to add a gap to display:flex
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetGap(value, oldValue) {
        if (!value && !oldValue) return;

        let item  = Neo.getComponent(this.containerId),
            style = item.wrapperStyle;

        style.gap = value;
        item.wrapperStyle = style;
    }

    /**
     * Applies the flex value to an item of the container this layout is bound to
     * @param {Neo.component.Base} item
     * @param {Number} index
     */
    applyChildAttributes(child, index) {
        if (!child.ignoreLayout) {
            if (child.ntype === 'fieldset') {
                child.wrapperCls = NeoArray.union(child.wrapperCls, 'neo-layout-form-subfieldset');
            } else if (child.ntype === 'legend') {
                child.wrapperCls = NeoArray.union(child.wrapperCls, 'neo-layout-form-legend');
            } else {
                child.wrapperCls = NeoArray.union(child.wrapperCls, 'neo-layout-form-item');
            }
        }
    }

    /**
     * Applies CSS classes to the container this layout is bound to
     */
    applyRenderAttributes() {
        let me         = this,
            container  = Neo.getComponent(me.containerId),
            wrapperCls = container?.wrapperCls || [];

        if (!container) {
            Neo.logError('layout.Form: applyRenderAttributes -> container not yet created', me.containerId);
        }

        NeoArray.add(wrapperCls, 'neo-layout-form');

        container.wrapperCls = wrapperCls;
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
        item.wrapperStyle = style;
    }

    /**
     * Removes all CSS rules from the container this layout is bound to.
     * Gets called when switching to a different layout.
     */
    removeRenderAttributes() {
        let me         = this,
            container  = Neo.getComponent(me.containerId),
            wrapperCls = container?.wrapperCls || [];

        if (!container) {
            Neo.logError('layout.Form: removeRenderAttributes -> container not yet created', me.containerId);
        }

        NeoArray.remove(wrapperCls, 'neo-layout-form');

        container.wrapperCls = wrapperCls;
    }

    /**
     * Updates the Container CSS wrapperCls
     * @param {String|null} value
     * @param {String|null} oldValue
     * @param {String} propertyName
     * @protected
     */
    updateInputValue(value, oldValue, propertyName) {
        let me         = this,
            container  = Neo.getComponent(me.containerId),
            prefix     = me.prefix,
            wrapperCls = container?.wrapperCls;

        if (container?.rendered) {
            NeoArray.remove(wrapperCls, prefix + propertyName + '-' + oldValue);

            if (value !== null) {
                NeoArray.add(wrapperCls, prefix + propertyName + '-' + value);
            }

            container.wrapperCls = wrapperCls;
        }
    }
}

Neo.setupClass(Form);

export default Form;
