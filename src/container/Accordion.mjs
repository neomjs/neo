import Panel         from './Panel.mjs';
// used in code
import AccordionItem from './AccordionItem.mjs';
import NeoArray      from '../util/Array.mjs';

/**
 * @class Neo.container.Accordion
 * @extends Neo.container.Panel
 */
class AccordionContainer extends Panel {
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
         * Max number of accordion items, which can be expanded at the same time
         * @member {Number} maxExpandedItems=[]
         */
        maxExpandedItems: 1,
        /**
         * Keep track of currently open items
         * @member {String[]} openItems=[]
         * @private
         */
        openItems_: [],
        /**
         * Creates a top header
         * @memeber {String|null} title=null
         */
        title_: null,

        itemDefaults: {ntype: 'accordionitem'},
        items       : []
    }

    /**
     * After changing initalOpen
     *
     * @param {Number[]} openArray
     */
    afterSetInitialOpen(openArray) {
        const me        = this,
              items     = me.items,
              openItems = me.openItems;

        openArray.forEach((itemNo) => {
            const id   = Neo.getId(me.itemDefaults.ntype),
                  item = items[itemNo];

            item.expanded = true;
            item.id = id;
            NeoArray.add(openItems, id);
        });

        me.openItems = openItems;
    }

    /**
     * After changes to title config, we add a header
     * @param {String|null} newTitle
     */
    afterSetTitle(newTitle) {
        const me      = this,
              titleEl = me.down({flag: 'titleEl'});

        if (newTitle && !titleEl) {
            const titleCls = me.titleCls;

            me.headers = [{
                dock   : 'top',
                text   : newTitle,
                baseCls: 'neo-accordion-title',
                cls    : ['neo-accordion-title']
            }];
        }
    }

    /**
     * Called by accordion items.
     * Checks for maxExpandedItems
     *
     * @param {Object}                      data
     * @param {Boolean}                     data.expanded newState
     * @param {Neo.container.AccordionItem} data.target   accordion item
     *
     * @private
     */
    childExpandChange(data) {
        const me               = this,
              maxExpandedItems = me.maxExpandedItems,
              openItems        = me.openItems,
              curNoOpenItems   = openItems.length,
              target           = data.target,
              targetId         = target.id,
              expanded         = data.expanded;

        if (expanded
            && maxExpandedItems !== 0
            && curNoOpenItems === maxExpandedItems) {
            Neo.get(openItems[0]).expanded = false;
            NeoArray.remove(openItems, openItems[0]);
        }

        target.expanded = expanded;
        NeoArray.toggle(openItems, targetId);

        me.openItems = openItems;
    }
}

Neo.applyClassConfig(AccordionContainer);

export default AccordionContainer;
