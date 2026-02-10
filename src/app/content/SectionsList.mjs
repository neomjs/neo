import List from '../../list/Base.mjs';

/**
 * @class Neo.app.content.SectionsList
 * @extends Neo.list.Base
 */
class SectionsList extends List {
    static config = {
        /**
         * @member {String} className='Neo.app.content.SectionsList'
         * @protected
         */
        className: 'Neo.app.content.SectionsList',
        /**
         * @member {Object} bind
         */
        bind: {
            store: 'stores.sections'
        },
        /**
         * @member {String[]} cls=['neo-app-content-sections-list','neo-app-content-tree-list']
         * @reactive
         */
        cls: ['neo-app-content-sections-list', 'neo-app-content-tree-list']
    }

    /**
     * Internal flag to indicate that node.scrollIntoView() is running with an animation
     * @member {Boolean} isAnimating=false
     */
    isAnimating = false

    /**
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a string.
     */
    createItemContent(record, index) {
        let content = [];

        if (record.image) {
            content.push({tag: 'img', src: record.image, cls: ['neo-list-icon', 'avatar']})
        } else if (record.icon) {
            content.push({tag: 'i', cls: ['neo-list-icon', 'fa-solid', record.icon]})
        }

        content.push({tag: 'span', text: record[this.displayField]});

        return {
            cls: `neo-${record.tag}`,
            cn : content
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

    /**
     *
     */
    onStoreLoad() {
        super.onStoreLoad();

        this.getStateProvider().data.countSections = this.store.getCount()
    }
}

export default Neo.setupClass(SectionsList);
