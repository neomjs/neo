import AccordionItem from './AccordionItem.mjs';
import NeoArray      from '../util/Array.mjs';
import Panel         from './Panel.mjs';

/**
 * @class Neo.container.Accordion
 * @extends Neo.container.Panel
 */
class Accordion extends Panel {
    static config = {
        /**
         * @member {String} className='Neo.container.Accordion'
         * @protected
         */
        className: 'Neo.container.Accordion',
        /**
         * @member {String} ntype='accordion'
         * @protected
         */
        ntype: 'accordion',
        /**
         * @member {String[]} baseCls=['neo-accordion']
         */
        baseCls: ['neo-accordion'],
        /**
         * Add zero based numbers, which accordion items you want initially expanded
         * @member {Number[]} initialOpen=[]
         */
        initialOpen_: [],
        /**
         * @member {Object} itemDefaults={ntype:'accordionitem'}
         */
        itemDefaults: {ntype: 'accordionitem'},
        /**
         * @member {Object[]} items=[]
         */
        items: [],
        /**
         * Max number of accordion items, which can be expanded at the same time
         * @member {Number} maxExpandedItems=1
         */
        maxExpandedItems: 1,
        /**
         * Keep track of currently open items
         * @member {String[]} expandedItems=[]
         * @private
         */
        expandedItems_: [],
        /**
         * Creates a top header
         * @memeber {String|null} title=null
         */
        title_: null
    }

    /**
     * @param {Number[]} value
     * @param {Number[]} oldValue
     */
    afterSetInitialOpen(value, oldValue) {
        let me                     = this,
            {expandedItems, items} = me,
            id, item;

        value.forEach((itemNo) => {
            id   = Neo.getId(me.itemDefaults.ntype),
            item = items[itemNo];

            item.expanded = true;
            item.id       = id;
            NeoArray.add(expandedItems, id)
        });

        me.expandedItems = expandedItems
    }

    /**
     * After changes to title config, we add a header
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetTitle(value, oldValue) {
        let me      = this,
            titleEl = me.down({flag: 'titleEl'});

        if (value && !titleEl) {
            me.headers = [{
                baseCls: 'neo-accordion-title',
                cls    : ['neo-accordion-title'],
                dock   : 'top',
                text   : value
            }]
        }
    }

    /**
     * Called by accordion items.
     * Checks for maxExpandedItems
     * @param {Object}                      data
     * @param {Boolean}                     data.expanded newState
     * @param {Neo.container.AccordionItem} data.target   accordion item
     * @protected
     */
    childExpandChange(data) {
        let me                                = this,
            {expandedItems, maxExpandedItems} = me,
            {expanded, target}                = data,
            curNoOpenItems                    = expandedItems.length,
            targetId                          = target.id;

        if (expanded
            && maxExpandedItems !== 0
            && curNoOpenItems === maxExpandedItems
        ) {
            Neo.get(expandedItems[0]).expanded = false;
            NeoArray.remove(expandedItems, expandedItems[0])
        }

        target.expanded = expanded;
        NeoArray.toggle(expandedItems, targetId);

        me.expandedItems = expandedItems
    }
}

export default Neo.setupClass(Accordion);
