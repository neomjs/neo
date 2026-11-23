import App  from '../model/App.mjs';
import Apps from '../../../src/desktop/store/Apps.mjs';

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
 * @summary The desktop's navigation tree: the engine's apps store over this catalog, with the app's only visibility rule.
 *
 * The root state provider writes the signed-in account's permission keys into the filter's `value`; every view bound to
 * this store follows. `includeEmptyValues: false` keeps an empty grant closed: with the default, an empty value turns a
 * filter off, which would show every app to an account without permissions.
 * @class WebDesktop.store.Apps
 * @extends Neo.desktop.store.Apps
 */
class WebDesktopApps extends Apps {
    static config = {
        /**
         * @member {String} className='WebDesktop.store.Apps'
         * @protected
         */
        className: 'WebDesktop.store.Apps',
        /**
         * @member {Object[]} data=catalog
         */
        data: catalog,
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
        model: App
    }
}

export default Neo.setupClass(WebDesktopApps);
