import AccordionItem   from './AccordionItem.mjs';
import AccordionModel  from '../selection/AccordionModel.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import NeoArray        from '../util/Array.mjs';
import Panel           from './Panel.mjs';

/**
 * @summary Accordion container supporting collapsible AccordionItems, selection, and keyboard navigation.
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
         * @member {Boolean} disableSelection_=false
         * @reactive
         */
        disableSelection_: false,
        /**
         * Keep track of currently open items
         * @member {String[]} expandedItems=[]
         * @private
         */
        expandedItems_: [],
        /**
         * Add zero based numbers, which accordion items you want initially expanded
         * @member {Number[]} initialOpen=[]
         */
        initialOpen_: [],
        /**
         * @member {Object} itemDefaults={ntype:'accordionitem'}
         * @reactive
         */
        itemDefaults: {ntype: 'accordionitem'},
        /**
         * @member {Object[]} items=[]
         * @reactive
         */
        items: [],
        /**
         * Additional used keys for the selection model
         * @member {Object} keys={}
         */
        keys: {},
        /**
         * Max number of accordion items, which can be expanded at the same time
         * @member {Number} maxExpandedItems=1
         */
        maxExpandedItems: 1,
        /**
         * Either pass a selection.Model module, an instance or a config object
         * @member {Object|Neo.selection.Model|null} selectionModel_=null
         * @reactive
         */
        selectionModel_: null,
        /**
         * Creates a top header
         * @member {String|null} title=null
         */
        title_: null
    }

    /**
     * @summary Clears the active selection when `disableSelection` is set to `true` and syncs header roving tabIndex.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDisableSelection(value, oldValue) {
        if (this.isConstructed && this.selectionModel) {
            value && this.selectionModel.deselectAll();
            this.selectionModel.syncTabIndices?.(!this.vnodeInitialized)
        }
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
            item = items[itemNo];

            if (item) {
                id            = item.id || Neo.getId(me.itemDefaults?.ntype || 'accordionitem');
                item.expanded = true;
                item.id       = id;
                NeoArray.add(expandedItems, id)
            }
        });

        me.expandedItems = expandedItems
    }

    /**
     * @summary Registers a newly assigned selectionModel once the Accordion is constructed.
     * @param {Neo.selection.Model|null} value
     * @param {Neo.selection.Model|null} oldValue
     * @protected
     */
    afterSetSelectionModel(value, oldValue) {
        this.isConstructed && value?.register(this)
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
     * @summary Resolves `selectionModel` configs into a `Neo.selection.AccordionModel` instance.
     * @param {Neo.selection.Model|Object|null} value
     * @param {Neo.selection.Model|null} oldValue
     * @returns {Neo.selection.Model|null}
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        oldValue?.destroy();

        if (!value && oldValue !== undefined) {
            return null
        }

        return ClassSystemUtil.beforeSetInstance(value, AccordionModel)
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
            && !expandedItems.includes(targetId)
            && maxExpandedItems !== 0
            && curNoOpenItems === maxExpandedItems
        ) {
            let openItem = Neo.get(expandedItems[0]);

            if (openItem) {
                openItem.expanded = false
            }

            NeoArray.remove(expandedItems, expandedItems[0])
        }

        target.expanded = expanded;
        NeoArray[expanded ? 'add' : 'remove'](expandedItems, targetId);

        me.expandedItems = expandedItems
    }

    /**
     * @summary Destroys the owned selectionModel before tearing down the Accordion.
     * @param {...*} args
     */
    destroy(...args) {
        this.selectionModel?.destroy();

        super.destroy(...args)
    }

    /**
     * @summary Returns the AccordionItem child components whether direct or inside Panel's bodyContainer.
     * @returns {Neo.container.AccordionItem[]}
     */
    getAccordionItems() {
        let container = this.getReference('bodyContainer') || this;

        return (container.items || []).filter(item => item?.ntype === 'accordionitem')
    }

    /**
     * @summary Registers the configured selectionModel after construction.
     */
    onConstructed() {
        super.onConstructed();

        this.selectionModel?.register(this)
    }
}

export default Neo.setupClass(Accordion);
