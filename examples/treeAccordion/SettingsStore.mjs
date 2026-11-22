import Store from '../../src/data/Store.mjs';

/**
 * @summary An app's settings for the tree accordion: sections hold settings, a setting may hold its own choices.
 * Account opens first; the other sections open on a click.
 * A record names its folder by `parentId`; `content` is the line under a setting's name, `iconCls` its icon and colour.
 * @class Neo.examples.treeAccordion.SettingsStore
 * @extends Neo.data.Store
 */
class SettingsStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.treeAccordion.SettingsStore'
         * @protected
         */
        className: 'Neo.examples.treeAccordion.SettingsStore',
        /**
         * @member {Object} model
         */
        model: {
            fields: [
                {name: 'collapsed', type: 'Boolean', defaultValue: false},
                {name: 'content',   type: 'String'},
                {name: 'iconCls',   type: 'String'},
                {name: 'id',        type: 'String'},
                {name: 'isLeaf',    type: 'Boolean', defaultValue: true},
                {name: 'name',      type: 'String'},
                {name: 'parentId',  type: 'String',  defaultValue: null}
            ]
        },
        /**
         * @member {Object[]} data
         */
        data: [
            {id: 'account',       name: 'Account',            isLeaf: false},
            {id: 'profile',       name: 'Profile',            parentId: 'account',       content: 'Name, photo and a short bio',   iconCls: 'fa fa-user color-blue'},
            {id: 'password',      name: 'Password',           parentId: 'account',       content: 'Last changed 3 months ago',     iconCls: 'fa fa-key color-yellow'},
            {id: 'two-step',      name: 'Two-step sign-in',   parentId: 'account',       content: 'On, with an authenticator app', iconCls: 'fa fa-shield-halved color-green'},
            {id: 'notifications', name: 'Notifications',      isLeaf: false, collapsed: true},
            {id: 'email',         name: 'Email',              parentId: 'notifications', content: 'A digest every Monday',         iconCls: 'fa fa-envelope color-blue'},
            {id: 'push',          name: 'Mobile push',        parentId: 'notifications', content: 'Mentions and direct messages',  iconCls: 'fa fa-mobile-screen color-red'},
            {id: 'quiet-hours',   name: 'Quiet hours',        parentId: 'notifications', content: '22:00 to 07:00',                iconCls: 'fa fa-moon color-yellow'},
            {id: 'privacy',       name: 'Privacy',            isLeaf: false, collapsed: true},
            {id: 'visibility',    name: 'Profile visibility', parentId: 'privacy',       content: 'Members of your workspace',     iconCls: 'fa fa-eye color-green'},
            {id: 'your-data',     name: 'Your data',          parentId: 'privacy',       content: 'Export it or delete it',        iconCls: 'fa fa-database color-red', isLeaf: false},
            {id: 'export',        name: 'Export',             parentId: 'your-data',     content: 'Everything, as one JSON file',  iconCls: 'fa-regular fa-square-check color-green'},
            {id: 'delete',        name: 'Delete account',     parentId: 'your-data',     content: 'Asks twice before it does',     iconCls: 'fa-regular fa-square color-red'},
            {id: 'appearance',    name: 'Appearance',         isLeaf: false, collapsed: true},
            {id: 'theme',         name: 'Theme',              parentId: 'appearance',    content: 'Follows the system',            iconCls: 'fa fa-palette color-blue'},
            {id: 'language',      name: 'Language',           parentId: 'appearance',    content: 'English (UK)',                  iconCls: 'fa fa-language color-yellow'},
            {id: 'text-size',     name: 'Text size',          parentId: 'appearance',    content: 'Default',                       iconCls: 'fa fa-text-height color-green'}
        ]
    }
}

export default Neo.setupClass(SettingsStore);
