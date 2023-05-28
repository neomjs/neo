import Base     from './Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @class Neo.component.Process
 * @extends Neo.component.Base
 *
 * @example
 *     {
 *         module: Process,
 *         arrowColor: 'darkred',
 *         items: [{
 *             iconCls: 'fa fa-car',
 *             header: '1. Wunschkennzeichen',
 *             text: 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit...'
 *         }, {
 *             iconCls: 'fa fa-house',
 *             header: '2. Termine',
 *             text: 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit...'
 *         }]
 *     }
 */
class Process extends Base {
    /**
     * Each item gets an arrow and the content, which gets filled with an item.
     * The slit allows to fade out the sidebar.
     *
     * @member {Object} itemLayout={cls: 'process-step', cn: [{cls: ['arrow', 'white']},{cls: ['slit']},{cls: ['arrow', 'yellow']},{cls: 'process-content', cn: [{cls: ['process-step-icon']},{tag: 'h2', cls: ['process-step-header']},{cls: ['process-step-text']}]}]}
     */
    itemLayout = {
        cls: 'process-step', cn: [
            {cls: ['arrow', 'white']},
            {cls: ['slit']},
            {cls: ['arrow', 'yellow']},
            {
                cls: 'process-content', cn: [
                    {cls: ['process-step-icon']},
                    {tag: 'h2', cls: ['process-step-header']},
                    {cls: ['process-step-text']}
                ]
            }
        ]
    }

    static config = {
        /**
         * @member {String} className='Neo.component.Process'
         * @protected
         */
        className: 'Neo.component.Process',
        /**
         * @member {String} ntype='process'
         * @protected
         */
        ntype: 'process',
        /**
         * @member {String[]} baseCls=['neo-process']
         */
        baseCls: ['neo-process'],

        /**
         * Set the color of the process arrow.
         * Out of the box this is #ffdb4a
         *
         * @member {String|null} arrowColor=null
         */
        arrowColor_: null,
        /**
         * 'true' shows the items from left to right
         * 'false' shows the items from top to bottom
         * There is a minimum width of 700px to show items 'true'
         *
         * @member {Boolean} horizontal=true
         */
        horizontal_: true,
        /**
         * Set the color of the icons.
         * Out of the box this is #ffdb4a
         *
         * @member {String|null} iconColor=null
         */
        iconColor_: null,

        /**
         * Each item will be transferred into the itemLayout
         *
         * @member {Object[]|Object} items=null
         *
         * @example
         *     items: [{
         *         iconCls: 'fa fa-car',
         *         header: '1. First Step',
         *         text: 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa. Fusce posuere, magna sed pulvinar ultricies, purus lectus malesuada libero, sit amet commodo magna eros quis urna.'
         *     }, {
         *         iconCls: 'fa fa-house',
         *         header: '2. Second Step',
         *         text: 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. Maecenas porttitor congue massa. Fusce posuere, magna sed pulvinar ultricies, purus lectus malesuada libero, sit amet commodo magna eros quis urna.'
         *     }]
         */
        items_: null,

        /**
         * vdom definition is used during item creation
         * Do not remove
         *
         * @member {Object} vdom={cn:[]}
         */
        vdom: {cn: []}
    }

    /**
     * Triggered after arrowColor config got changed
     * @param {String} newValue
     * @protected
     */
    afterSetArrowColor(newValue) {
        if (newValue === null) return;

        let style = this.style;

        style['--process-arrow-color'] = newValue + '!important';
        this.style = style;
    }

    /**
     * Triggered after horizontal config got changed
     * @param {Boolean} isHorizontal
     * @protected
     */
    afterSetHorizontal(isHorizontal) {
        let cls         = this.cls,
            positionCls = isHorizontal ? 'neo-process-horizontal' : 'neo-process-vertical',
            removeCls   = !isHorizontal ? 'neo-process-horizontal' : 'neo-process-vertical';

        NeoArray.add(cls, positionCls);
        NeoArray.remove(cls, removeCls);

        this.cls = cls;
    }

    /**
     * Triggered after iconColor config got changed
     * @param {String} newValue
     * @protected
     */
    afterSetIconColor(newValue) {
        if (newValue === null) return;
        let style = this.style;

        style['--process-icon-color'] = newValue + '!important';

        this.style = style;
    }

    /**
     * Triggered after items config got changed
     * @param {Object[]} items
     * @protected
     */
    afterSetItems(items) {
        if (!(Neo.isArray(items) || Neo.isObject(items))) return;
        if (!Neo.isArray(items)) {
            items = [items];
        }

        let vdomRoot   = this.vdom,
            itemLayout = this.itemLayout;

        items.forEach((newItem) => {
            let curItem = Neo.clone(itemLayout, true),
                content = curItem.cn[3];

            content.cn[0].cls.push(newItem.iconCls);
            content.cn[1].innerHTML = newItem.title;
            content.cn[2].innerHTML = newItem.text;

            NeoArray.add(vdomRoot.cn, curItem);
        });
    }
}

Neo.applyClassConfig(Process);

export default Process;