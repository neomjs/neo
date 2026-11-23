import ComponentController from '../../src/controller/Component.mjs';
import FileModel           from './FileModel.mjs';

/**
 * @summary Wires the explorer: the filter field filters the tree, and the detail pane shows the entry last opened
 * or selected, following it through a rename or a move.
 * @class Neo.examples.fileExplorer.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.fileExplorer.ViewportController'
         * @protected
         */
        className: 'Neo.examples.fileExplorer.ViewportController'
    }

    /**
     * The id of the entry the detail pane shows
     * @member {String|null} shownId=null
     * @protected
     */
    shownId = null

    /**
     * @summary Builds what the detail pane shows for one entry.
     * @param {Neo.data.Model} record
     * @returns {Object}
     */
    getDetails(record) {
        let {store} = this.getReference('tree'),
            names   = [],
            node    = record,
            children, kind;

        while (node) {
            names.unshift(node.name);
            node = node.parentId ? store.get(node.parentId) : null
        }

        if (record.isLeaf) {
            kind = FileModel.kindOf(record.name);

            return {
                icon: ['fe-icon', kind.icon],
                name: record.name,
                path: '/' + names.join('/'),
                rows: [
                    ['Kind',     kind.label],
                    ['Size',     this.formatSize(record.size)],
                    ['Modified', record.modified]
                ]
            }
        }

        children = store.find('parentId', record.id);

        return {
            icon: ['fe-icon', 'fe-kind-folder'],
            name: record.name,
            path: '/' + names.join('/'),
            rows: [
                ['Kind',     'Folder'],
                ['Contents', !record.listing || record.loaded
                    ? `${children.filter(child => !child.isLeaf).length} folders, ${children.filter(child => child.isLeaf).length} files`
                    : 'Loads when the folder first opens']
            ]
        }
    }

    /**
     * @param {Number} size Bytes
     * @returns {String}
     */
    formatSize(size) {
        if (size < 1024) {
            return `${size} bytes`
        }

        return size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`
    }

    /**
     * @summary Listens to the tree's store, so a rename of the shown entry reaches the detail pane, and opens on
     * `src/components/Cart.mjs`, selected and shown.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        let me      = this,
            tree    = me.getReference('tree'),
            {store} = tree;

        store.on({
            load        : 'refreshDetails',
            recordChange: 'refreshDetails',
            scope       : me
        });

        // The tree renders its items once it is mounted. The selection takes the item's id, the one the tree renders
        tree.on('mounted', () => {
            tree.selectionModel.select(tree.getItemId('cart'));
            me.onTreeItemClick({record: store.get('cart')})
        }, me, {once: true})
    }

    /**
     * @param {Object} data
     * @param {String} data.value
     */
    onFilterChange({value}) {
        this.getReference('tree').filter('name', value, null)
    }

    /**
     * @param {Object} data
     * @param {Neo.data.Model} data.record
     */
    onTreeItemClick({record}) {
        this.shownId = record?.id ?? null;
        this.refreshDetails()
    }

    /**
     * @summary Shows the shown entry as it is now: its name, its path through its folders, and what it holds.
     */
    refreshDetails() {
        let me     = this,
            record = me.shownId && me.getReference('tree').store.get(me.shownId);

        me.getReference('detail').details = record ? me.getDetails(record) : null
    }
}

export default Neo.setupClass(ViewportController);
