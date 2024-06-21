import Base      from './Base.mjs';
import Container from '../container/Base.mjs'
import NeoArray  from "../util/Array.mjs";

/**
 * Popover usable as tooltip
 * @class Neo.plugin.Popover
 * @extends Neo.plugin.Base
 *
 * @example
 *     module : Button,
 *     width  : 200,
 *     text   : 'Click Me',
 *     plugins: [{
 *         module: PopoverPlugin,
 *         align : 'bc-tc',
 *         items : [{
 *             ntype  : 'panel',
 *             headers: [{
 *                 dock: 'top',
 *                 html: 'HEADER'
 *             }],
 *             items  : [{
 *                 html: 'This is a comment about the button'
 *             }]
 *         }]
 *     }]
 */
class Popover extends Base {
    /**
     * Valid values for align
     * @member {String[]} alignValues=['bc-tc','tc-bc','tl-tr','tr-tl','cl-cr','cr-cl',null]
     * @protected
     * @static
     *
     * todo: add more
     */
    static alignValues = ['bc-tc', 'tc-bc', 'tl-tr', 'tr-tl', 'cl-cr', 'cr-cl', null]

    static config = {
        /**
         * @member {String} className='Neo.plugin.Popover'
         * @protected
         */
        className: 'Neo.plugin.Popover',
        /**
         * @member {String} ntype='plugin-popover'
         * @protected
         */
        ntype: 'plugin-popover',
        /**
         * Define popover to popover target alignment
         * Defaults to bottom center of popover is aligned to top center of owner
         * @member {String} align='bc-tc'
         */
        align_: 'bc-tc',
        /**
         * Custom cls to add to the owner component
         * @member {String} popoverBaseCls='neo-popover'
         */
        popoverBaseCls: 'neo-popover',
        /**
         * Custom cls to add to the owner component
         * @member {String} popovertargetCls='neo-popover-target'
         */
        popovertargetCls: 'neo-popover-target'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        let me = this;

        super.construct(config);

        me.popoverId = Neo.getId('popover');

        // prepare owner
        me.preparePopoverTarget();
        me.addPopover();

        me.addListeners()
    }

    /**
     * @protected
     */
    addListeners() {
        const me = this;

        me.owner.addDomListeners([
            {mouseover: me.onTargetMouseOver, scope: me},
            {mouseout : me.onTargetMouseOut,  scope: me}
        ])
    }

    /**
     * Create the popover and add it to the parent component of the owner
     * @protected
     */
    addPopover() {
        const me      = this,
              {owner} = me,
              parent  = Neo.get(me.owner.parentId),
              popover = {
                  module: Container,
                  id    : me.popoverId,

                  baseCls: [me.popoverBaseCls],
                  cls    : [me.align],

                  layout: 'base',
                  items : me.items || [],

                  vdom: {
                      // Possible Values are auto, manual.
                      popover: 'auto',
                      anchor : owner.id
                  }
              };

        parent.add(popover)
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
     * @event mouseout
     * @param {Object} data
     * @protected
     */
    onTargetMouseOut(data) {
        Neo.main.addon.Popover.hide({id: data.component.id})
    }

    /**
     * @event mouseover
     * @param {Object} data
     * @protected
     */
    onTargetMouseOver(data) {
        Neo.main.addon.Popover.show({id: data.component.id})
    }

    /**
     * @protected
     */
    preparePopoverTarget() {
        const me         = this,
              target     = me.owner,
              targetVdom = target.vdom;

        target.addCls(me.popovertargetCls);
        targetVdom.popovertarget = me.popoverId
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
        const validValues = this.getStaticConfig(validValuesName);

        if (!NeoArray.hasItem(validValues, value)) {
            Neo.logError(this.id + ' -> layout: supported values for "' + propertyName + '" are', validValues);
            return oldValue
        }

        return value
    }
}

Neo.setupClass(Popover);

export default Popover;
