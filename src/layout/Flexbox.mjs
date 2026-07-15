import Base     from './Base.mjs';
import NeoArray from '../util/Array.mjs';

const wrapperClsOwner = Symbol('layout.Flexbox.wrapperCls');

/**
 * @class Neo.layout.Flexbox
 * @extends Neo.layout.Base
 */
class Flexbox extends Base {
    /**
     * Valid values for align
     * @member {String[]} alignValues=['center','end','start','stretch',null]
     * @protected
     * @static
     */
    static alignValues = ['center', 'end', 'start', 'stretch', null]
    /**
     * Valid values for direction
     * @member {String[]} directionValues=['column','column-reverse','row','row-reverse',null]
     * @protected
     * @static
     */
    static directionValues = ['column', 'column-reverse', 'row', 'row-reverse', null]
    /**
     * Valid values for pack
     * @member {String[]} packValues=['center','end','start',null]
     * @protected
     * @static
     */
    static packValues = ['center', 'end', 'start', null]
    /**
     * Valid values for wrap
     * @member {String[]} wrapValues=['nowrap','wrap','wrap-reverse']
     * @protected
     * @static
     */
    static wrapValues = ['nowrap', 'wrap', 'wrap-reverse']

    static config = {
        /**
         * @member {String} className='Neo.layout.Flexbox'
         * @protected
         */
        className: 'Neo.layout.Flexbox',
        /**
         * @member {String} ntype='layout-flexbox'
         * @protected
         */
        ntype: 'layout-flexbox',
        /**
         * Valid values: 'center', 'end', 'start', 'stretch', null
         * @member {String|null} align_=null
         * @reactive
         */
        align_: null,
        /**
         * Valid values: 'column', 'column-reverse', 'row', 'row-reverse', null
         * @member {String|null} direction_=null
         * @reactive
         */
        direction_: null,
        /**
         * flex css allows gap. This adds it to the component style
         * @member {String} gap_=null
         * @reactive
         */
        gap_: null,
        /**
         * Valid values: 'center', 'end', 'start', null
         * @member {String|null} pack_=null
         * @reactive
         */
        pack_: null,
        /**
         * CSS className prefix
         * @member {String} prefix='neo-flex-'
         */
        prefix: 'neo-flex-',
        /**
         * Valid values: nowrap, wrap, wrapreverse
         * @member {String} wrap_='nowrap'
         * @reactive
         */
        wrap_: 'nowrap'
    }

    /**
     * Updates the Container CSS cls after "align" gets changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAlign(value, oldValue) {
        oldValue && this.updateInputValue(value, oldValue, 'align')
    }

    /**
     * Updates the Container CSS cls after "direction" gets changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetDirection(value, oldValue) {
        oldValue && this.updateInputValue(value, oldValue, 'direction')
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
     * Updates the Container CSS cls after "pack" gets changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetPack(value, oldValue) {
        oldValue && this.updateInputValue(value, oldValue, 'pack')
    }

    /**
     * Updates the Container CSS cls after "wrap" gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetWrap(value, oldValue) {
        oldValue && this.updateInputValue(value, oldValue, 'wrap')
    }

    /**
     * Applies the flex value to an item of the container this layout is bound to
     * @param {Neo.component.Base} item
     * @param {Number} index
     */
    applyChildAttributes(item, index) {
        if (!item.wrapperStyle) return;

        let style = item.wrapperStyle,
            flex  = style.flex || item.flex || (this.align === 'stretch' ? 1 : '0 1 auto');

        if (Neo.isNumber(flex)) {
            flex = `${flex} 1 0%`
        }

        style.flex = flex;
        item.wrapperStyle = style
    }

    /**
     * Applies CSS classes to the container this layout is bound to
     */
    applyRenderAttributes(silent=false) {
        let me          = this,
            {container} = me;

        if (!container) {
            Neo.logError('layout.Flexbox: applyRenderAttributes -> container not yet created', me.containerId)
        }

        me.setItemWrapperClsContribution(container, wrapperClsOwner, me.getContainerWrapperCls(), silent)
    }

    /**
     * Checks if the new value for "align" is valid
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     * @returns {String|null} value
     */
    beforeSetAlign(value, oldValue) {
        return this.testInputValue(value, oldValue, 'alignValues', 'align')
    }

    /**
     * Checks if the new value for "direction" is valid
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     * @returns {String|null} value
     */
    beforeSetDirection(value, oldValue) {
        return this.testInputValue(value, oldValue, 'directionValues', 'direction')
    }

    /**
     * Checks if the new value for "pack" is valid
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     * @returns {String|null} value
     */
    beforeSetPack(value, oldValue) {
        return this.testInputValue(value, oldValue, 'packValues', 'pack')
    }

    /**
     * Checks if the new value for "wrap" is valid
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String} value
     */
    beforeSetWrap(value, oldValue) {
        return this.testInputValue(value, oldValue, 'wrapValues', 'wrap')
    }

    /**
     * Returns the complete class contribution owned by this flexbox layout.
     * @summary Keeps flexbox replacement atomic instead of diffing the flattened wrapper classes.
     * @returns {String[]}
     * @protected
     */
    getContainerWrapperCls() {
        let me       = this,
            {prefix} = me;

        return [
            prefix + 'container',
            me.align     && prefix + 'align-'     + me.align,
            me.direction && prefix + 'direction-' + me.direction,
            me.pack      && prefix + 'pack-'      + me.pack,
            me.wrap      && prefix + 'wrap-'      + me.wrap
        ].filter(Boolean)
    }

    /**
     * Removes all CSS rules from a container item this layout is bound to.
     * Gets called when switching to a different layout.
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
     * Removes all CSS rules from the container this layout is bound to.
     * Gets called when switching to a different layout.
     * @protected
     */
    removeRenderAttributes() {
        let me          = this,
            {container} = me;

        if (!container) {
            Neo.logError('layout.Flexbox: removeRenderAttributes -> container not yet created', me.containerId)
        }

        me.setItemWrapperClsContribution(container, wrapperClsOwner, [])
    }

    /**
     * Checks if the new value for propertyName is valid
     * @param {String|null} value
     * @param {String|null} oldValue
     * @param {String} validValuesName
     * @param {String} propertyName
     * @protected
     * @returns {String|null} value
     */
    testInputValue(value, oldValue, validValuesName, propertyName) {
        let validValues = this.getStaticConfig(validValuesName);

        if (!NeoArray.hasItem(validValues, value)) {
            Neo.logError(this.containerId, '-> layout: supported values for "' + propertyName + '" are' , validValues);
            return oldValue
        }

        return value;
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            align    : me.align,
            direction: me.direction,
            gap      : me.gap,
            pack     : me.pack,
            prefix   : me.prefix,
            wrap     : me.wrap
        }
    }

    /**
     * Updates the Container CSS wrapperCls
     * @param {String|null} value
     * @param {String|null} oldValue
     * @param {String} propertyName
     * @protected
     */
    updateInputValue(value, oldValue, propertyName) {
        let me          = this,
            {container} = me;

        if (container?.vnodeInitialized) {
            me.setItemWrapperClsContribution(container, wrapperClsOwner, me.getContainerWrapperCls())
        }
    }
}

export default Neo.setupClass(Flexbox);
