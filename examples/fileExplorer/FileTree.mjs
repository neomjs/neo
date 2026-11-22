import ItemEditing from '../../src/list/plugin/ItemEditing.mjs';
import TreeList    from '../../src/tree/List.mjs';

/**
 * @summary The explorer's tree of folders and files. An item moves into another folder by drag
 * (`Neo.draggable.tree.SortZone`) and is renamed in place by F2 or a double-click (`Neo.list.plugin.ItemEditing`).
 * A folder with a `listing` holds no children until it first opens: the tree fetches them from that URL then,
 * through `onFolderItemClick`, the hook `Neo.tree.List` awaits before it toggles a folder.
 * @class Neo.examples.fileExplorer.FileTree
 * @extends Neo.tree.List
 */
class FileTree extends TreeList {
    static config = {
        /**
         * @member {String} className='Neo.examples.fileExplorer.FileTree'
         * @protected
         */
        className: 'Neo.examples.fileExplorer.FileTree',
        /**
         * @member {String[]} cls=['fe-tree']
         * @reactive
         */
        cls: ['fe-tree'],
        /**
         * @member {Boolean} dragResortable=true
         * @reactive
         */
        dragResortable: true,
        /**
         * @member {Object[]} plugins
         * @reactive
         */
        plugins: [{
            module: ItemEditing,
            editor: {validator: field => FileTree.validateName(field.value)}
        }],
        /**
         * @member {Boolean} showCollapseExpandAllIcons=false
         */
        showCollapseExpandAllIcons: false
    }

    /**
     * The listings in flight, keyed by folder id, so a second click waits for the first fetch
     * @member {Map<String, Promise>} #loading=new Map()
     */
    #loading = new Map()

    /**
     * @summary Relays the sort zone's `move` as the tree's own event. The zone writes a moved record's `parentId`
     * silently, so `move` is the one signal that an entry changed its folder.
     * @param {Object} config
     */
    construct(config) {
        config.sortZoneConfig = {
            ...config.sortZoneConfig,
            listeners: {move: data => this.fire('move', data)}
        };

        super.construct(config)
    }

    /**
     * @summary Fetches a folder's listing into the store: one record per entry, ids unique under the folder.
     * @param {Neo.data.Model} folder
     * @returns {Promise<void>}
     * @protected
     */
    async loadListing(folder) {
        let response = await fetch(`${Neo.config.resourcesPath}examples/data/${folder.listing}`);

        if (!response.ok) {
            throw new Error(`The listing of ${folder.name} did not load: ${response.status}`)
        }

        let entries = await response.json();

        // Before the add, so the store's load event already reads the folder as loaded
        folder.setSilent({loaded: true});

        this.store.add(entries.map((entry, index) => ({
            ...entry,
            id      : `${folder.id}-${index}`,
            parentId: folder.id
        })))
    }

    /**
     * @summary Loads a folder's listing the first time it opens. A folder whose listing failed stays closed and loads
     * again on the next open. Whether the listing arrived is the record's `loaded`, not whether the folder holds
     * anything: a file dropped into an unopened folder must not stand in for its listing.
     * @param {Neo.data.Model} record
     * @returns {Promise<Boolean|void>} false cancels the toggle
     */
    async onFolderItemClick(record) {
        let me     = this,
            isOpen = !record.collapsed;

        if (!record.listing || record.loaded) {
            return
        }

        if (!me.#loading.has(record.id)) {
            me.#loading.set(record.id, me.loadListing(record).finally(() => me.#loading.delete(record.id)))
        }

        try {
            await me.#loading.get(record.id)
        } catch (error) {
            console.error(error);
            return false
        }

        // A folder can show as open before its listing arrived (clearing the filter opens every folder): the toggle
        // would close it the moment its listing arrives
        if (isOpen) {
            return false
        }
    }

    /**
     * @summary A name is valid when it is not empty and holds no slash.
     * @param {String} value
     * @returns {Boolean|String} true, or the reason it is not valid
     */
    static validateName(value) {
        value = String(value || '').trim();

        if (!value) {
            return 'A name cannot be empty'
        }

        return value.includes('/') ? 'A name cannot contain a slash' : true
    }
}

export default Neo.setupClass(FileTree);
