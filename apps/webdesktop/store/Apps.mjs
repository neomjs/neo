import App       from '../model/App.mjs';
import TreeStore from '../../../src/data/TreeStore.mjs';

/**
 * Every app the desktop knows, grouped. Groups carry no permission (see `WebDesktop.model.App`).
 * @type {Object[]}
 */
export const catalog = [
    {id: 'communication', text: 'Communication', iconCls: 'fas fa-comments', isLeaf: false, collapsed: false},
    {id: 'mail',          text: 'Mail',          iconCls: 'fas fa-envelope',         parentId: 'communication', color: '#3b82f6', permission: 'view-mail',        description: 'Read and send email.'},
    {id: 'messages',      text: 'Messages',      iconCls: 'fas fa-message',          parentId: 'communication', color: '#22c55e', permission: 'view-messages',    description: 'Chat with your team.'},
    {id: 'calendar',      text: 'Calendar',      iconCls: 'fas fa-calendar-days',    parentId: 'communication', color: '#f97316', permission: 'view-calendar',    description: 'Plan your week.'},
    {id: 'media',         text: 'Media',         iconCls: 'fas fa-photo-film', isLeaf: false, collapsed: false},
    {id: 'photos',        text: 'Photos',        iconCls: 'fas fa-images',           parentId: 'media',         color: '#ec4899', permission: 'view-photos',      description: 'Browse your pictures.'},
    {id: 'music',         text: 'Music',         iconCls: 'fas fa-music',            parentId: 'media',         color: '#a855f7', permission: 'view-music',       description: 'Play your library.'},
    {id: 'videos',        text: 'Videos',        iconCls: 'fas fa-film',             parentId: 'media',         color: '#ef4444', permission: 'view-videos',      description: 'Watch recordings.'},
    {id: 'files',         text: 'Files',         iconCls: 'fas fa-folder-open', isLeaf: false, collapsed: false},
    {id: 'documents',     text: 'Documents',     iconCls: 'fas fa-folder-open',      parentId: 'files',         color: '#eab308', permission: 'view-documents',   description: 'Open shared documents.'},
    {id: 'recycle-bin',   text: 'Recycle Bin',   iconCls: 'fas fa-trash-can',        parentId: 'files',         color: '#64748b', permission: 'view-recycle-bin', description: 'Restore deleted files.'},
    {id: 'system',        text: 'System',        iconCls: 'fas fa-gear', isLeaf: false, collapsed: false},
    {id: 'settings',      text: 'Settings',      iconCls: 'fas fa-gear',             parentId: 'system',        color: '#06b6d4', permission: 'view-settings',    description: 'Configure the desktop.'},
    {id: 'reports',       text: 'Reports',       iconCls: 'fas fa-chart-column',     parentId: 'system',        color: '#14b8a6', permission: 'view-reports',     description: 'See usage figures.'},
    {id: 'support',       text: 'Support',       iconCls: 'fas fa-life-ring', isLeaf: false, collapsed: false},
    {id: 'help',          text: 'Help',          iconCls: 'fas fa-circle-question',  parentId: 'support',       color: '#8b5cf6', permission: 'view-help',        description: 'Find answers.'}
];

/**
 * @summary Each node's place among its siblings: the arrangement's order first, then the catalog's.
 * @param {Object} [arrangement={}] Parent key → child keys, in an account's order. A child it does not name follows
 * the named ones in catalog order, so an app added to the catalog later still shows up; a value that is no array
 * names none.
 * @returns {Map<String, Number>} Node key → order
 */
export function orderOf(arrangement={}) {
    let children = new Map(),
        order    = new Map();

    catalog.forEach(({id, parentId='root'}) => {
        children.has(parentId) ? children.get(parentId).push(id) : children.set(parentId, [id])
    });

    children.forEach((ids, parentId) => {
        let saved = arrangement[parentId],
            named = Array.isArray(saved) ? [...new Set(saved)].filter(id => ids.includes(id)) : [];

        [...named, ...ids.filter(id => !named.includes(id))].forEach((id, index) => order.set(id, index))
    });

    return order
}

/**
 * @summary The desktop's navigation tree: one store for the launcher and for every level of the start menu.
 *
 * Its single filter is the app's only visibility rule. The root state provider writes the signed-in account's
 * permission keys into the filter's `value`; every view bound to this store follows. `includeEmptyValues: false`
 * keeps an empty grant closed: with the default, an empty value turns a filter off, which would show every app to an
 * account without permissions.
 *
 * Its sorter on `order` is the arrangement: a drag in the launcher or {@link #arrange} writes `order`, and every view
 * follows the sort. The filter never touches `order`, so a permission change keeps the remaining apps in place.
 * @class WebDesktop.store.Apps
 * @extends Neo.data.TreeStore
 */
class Apps extends TreeStore {
    static config = {
        /**
         * @member {String} className='WebDesktop.store.Apps'
         * @protected
         */
        className: 'WebDesktop.store.Apps',
        /**
         * @member {Object[]} filters
         */
        filters: [{
            includeEmptyValues: false,
            operator          : 'included',
            property          : 'permission',
            value             : []
        }],
        /**
         * @member {Neo.data.Model} model=App
         */
        model: App,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{
            property             : 'order',
            reapplyOnRecordChange: true
        }]
    }

    /**
     * Each instance gets its own copy of the catalog: a TreeStore keeps the raw rows and writes hierarchy state onto
     * them.
     * @param {Object} config
     */
    construct(config={}) {
        let order = orderOf();

        super.construct({data: catalog.map(app => ({...app, order: order.get(app.id)})), ...config})
    }

    /**
     * Applies an arrangement as one batch. The apps it does not name take their catalog place.
     * @param {Object} [arrangement={}] Parent key → child keys, as {@link #getArrangement} returns them
     */
    arrange(arrangement={}) {
        let me      = this,
            changes = [];

        orderOf(arrangement).forEach((order, key) => {
            me.get(key).order !== order && changes.push({key, values: {order}})
        });

        changes.length && me.updateRows(changes)
    }

    /**
     * @returns {Object} Group key → app keys, in the store's order, hidden apps included
     */
    getArrangement() {
        let me     = this,
            result = {};

        catalog.forEach(({id, isLeaf}) => {
            if (isLeaf === false) {
                result[id] = me.getChildren(id).map(record => record.id)
            }
        });

        return result
    }
}

export default Neo.setupClass(Apps);
