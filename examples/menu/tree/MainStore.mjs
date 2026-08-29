import MainModel from './MainModel.mjs';
import TreeStore from '../../../src/data/TreeStore.mjs';

/**
 * @summary A flat, parent-keyed menu definition — the shape a contribution registry produces.
 *
 * Compare `examples/menu/list/MainStore.mjs`, which nests an `items` array inside each group. Here
 * every entry is a sibling record pointing at its parent by key, so an independent module can append
 * one row targeting `edit` without reading, rewriting, or even knowing about the rest of the menu.
 * That is the property nested arrays cannot offer: contributing into a group means mutating the
 * group's own record.
 *
 * `collapsed` is irrelevant to a cascading menu — each level is read through the Structural Layer via
 * `TreeStore#getChildren()`, so nothing has to be expanded for a submenu to render.
 *
 * @class Neo.examples.menu.tree.MainStore
 * @extends Neo.data.TreeStore
 */
class MainStore extends TreeStore {
    static config = {
        /**
         * @member {String} className='Neo.examples.menu.tree.MainStore'
         * @protected
         */
        className: 'Neo.examples.menu.tree.MainStore',
        /**
         * @member {Neo.examples.menu.tree.MainModel} model=MainModel
         */
        model: MainModel,
        /**
         * @member {Object[]} data
         */
        data: [
            {id: 'file',            iconCls: 'fa fa-folder',        text: 'File',        isLeaf: false},
            {id: 'file-new',        iconCls: 'fa fa-plus',          text: 'New',         isLeaf: false, parentId: 'file'},
            {id: 'file-new-file',   iconCls: 'far fa-file',         text: 'File',        isLeaf: true,  parentId: 'file-new'},
            {id: 'file-new-folder', iconCls: 'far fa-folder',       text: 'Folder',      isLeaf: true,  parentId: 'file-new'},
            {id: 'file-open',       iconCls: 'far fa-folder-open',  text: 'Open',        isLeaf: true,  parentId: 'file'},
            {id: 'file-save',       iconCls: 'far fa-save',         text: 'Save',        isLeaf: true,  parentId: 'file'},

            {id: 'edit',            iconCls: 'fa fa-pen',           text: 'Edit',        isLeaf: false},
            {id: 'edit-copy',       iconCls: 'far fa-copy',         text: 'Copy',        isLeaf: true,  parentId: 'edit'},
            {id: 'edit-paste',      iconCls: 'fa fa-paste',         text: 'Paste',       isLeaf: true,  parentId: 'edit'},

            // Contributed by an unrelated module: one appended record, targeting a group it does not own.
            {id: 'edit-format',     iconCls: 'fa fa-wand-magic',    text: 'Format',      isLeaf: true,  parentId: 'edit'},

            {id: 'view',            iconCls: 'far fa-eye',          text: 'View',        isLeaf: false},
            {id: 'view-theme',      iconCls: 'fa fa-palette',       text: 'Theme',       isLeaf: false, parentId: 'view'},
            {id: 'view-theme-dark', iconCls: 'fa fa-moon',          text: 'Dark',        isLeaf: true,  parentId: 'view-theme'},
            {id: 'view-theme-light',iconCls: 'fa fa-sun',           text: 'Light',       isLeaf: true,  parentId: 'view-theme'},
            {id: 'view-zoom',       iconCls: 'fa fa-magnifying-glass', text: 'Zoom',     isLeaf: true,  parentId: 'view'},

            {id: 'about',           iconCls: 'fa fa-circle-info',   text: 'About',       isLeaf: true}
        ]
    }
}

export default Neo.setupClass(MainStore);
