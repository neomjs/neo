import List from '../../../../src/list/Base.mjs';

/**
 * @class Portal.view.learn.PageSectionsList
 * @extends Neo.list.Base
 */
class PageSectionsList extends List {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.PageSectionsList'
         * @protected
         */
        className: 'Portal.view.learn.PageSectionsList',
        /**
         * @member {Object} bind
         */
        bind: {
            store: 'stores.contentSections'
        },
        /**
         * @member {String[]} cls=['portal-page-sections-list','topics-tree']
         */
        cls: ['portal-page-sections-list', 'topics-tree']
    }

    /**
     * Internal flag to indicate that node.scrollIntoView() is running with an animation
     * @member {Boolean} isAnimating=false
     */
    isAnimating = false

    /**
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        return {
            cls : `neo-${record.tag}`,
            html: record[this.displayField]
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.on('itemClick', me.onSelectionChange, me)
    }

    /**
     * @param {Object} data
     */
    async onSelectionChange(data) {
        let me     = this,
            record = data.record;

        if (record) {
            me.isAnimating = true;

            me.fire('pageListSelect', {record});

            await Neo.main.DomAccess.scrollIntoView({
                querySelector: `[data-record-id='${record.id}']`,
                windowId     : me.windowId
            });

            // better safe than sorry
            await me.timeout(200);

            me.isAnimating = false
        }
    }
}

Neo.setupClass(PageSectionsList);

export default PageSectionsList;
