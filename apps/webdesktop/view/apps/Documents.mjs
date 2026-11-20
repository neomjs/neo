import Button    from '../../../../src/button/Base.mjs';
import Container from '../../../../src/container/Base.mjs';
import GlassGrid from './GlassGrid.mjs';
import Label     from '../../../../src/component/Label.mjs';
import RowModel  from '../../../../src/selection/grid/RowModel.mjs';
import Store     from '../../../../src/data/Store.mjs';
import Toolbar   from '../../../../src/toolbar/Base.mjs';
import TreeList  from '../../../../src/tree/List.mjs';

/**
 * @summary The Documents app: a folder tree beside the shared files. A folder narrows the grid through the
 * `documents` store's `folder` filter, and Delete moves the selected file into the Recycle Bin's store. Both stores
 * belong to the desktop's root state provider, so the Recycle Bin window sees the file whether it is open or not.
 * @class WebDesktop.view.apps.Documents
 * @extends Neo.container.Base
 */
class Documents extends Container {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.Documents'
         * @protected
         */
        className: 'WebDesktop.view.apps.Documents',
        /**
         * @member {String[]} cls=['webdesktop-documents']
         */
        cls: ['webdesktop-documents'],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module                    : TreeList,
            cls                       : ['webdesktop-documents-folders'],
            flex                      : 'none',
            reference                 : 'folders',
            showCollapseExpandAllIcons: false,
            store                     : {
                module: Store,
                model : {
                    fields: [
                        {name: 'collapsed', type: 'Boolean', defaultValue: false},
                        {name: 'iconCls',   type: 'String',  defaultValue: 'far fa-folder'},
                        {name: 'id',        type: 'String'},
                        {name: 'isLeaf',    type: 'Boolean', defaultValue: true},
                        {name: 'name',      type: 'String'},
                        {name: 'parentId',  type: 'String',  defaultValue: null, nullable: true}
                    ]
                },
                data: [
                    {id: 'all',      name: 'All documents', iconCls: 'fas fa-layer-group'},
                    {id: 'folders',  name: 'Folders', isLeaf: false},
                    {id: 'Projects', name: 'Projects', parentId: 'folders'},
                    {id: 'Design',   name: 'Design',   parentId: 'folders'},
                    {id: 'Finance',  name: 'Finance',  parentId: 'folders'},
                    {id: 'Shared',   name: 'Shared',   parentId: 'folders'}
                ]
            }
        }, {
            module: Container,
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                cls   : ['webdesktop-documents-toolbar'],
                flex  : 'none',
                items : [{
                    module   : Label,
                    cls      : ['webdesktop-documents-title'],
                    reference: 'title',
                    text     : 'All documents'
                }, '->', {
                    module   : Button,
                    disabled : true,
                    handler  : 'up.onDeleteButtonClick',
                    iconCls  : 'fas fa-trash-can',
                    reference: 'delete-button',
                    text     : 'Delete'
                }]
            }, {
                module    : GlassGrid,
                bind      : {store: 'stores.documents'},
                cls       : ['webdesktop-files-grid'],
                flex      : 1,
                reference : 'files',
                viewConfig: {selectionModel: {module: RowModel}},
                columns   : [
                    {dataField: 'iconCls',      text: '',         width: 40, type: 'icon'},
                    {dataField: 'name',         text: 'Name',     flex : 1},
                    {dataField: 'folder',       text: 'Folder',   width: 96},
                    {dataField: 'modifiedText', text: 'Modified', width: 110},
                    {dataField: 'sizeText',     text: 'Size',     width: 80}
                ]
            }]
        }]
    }

    /**
     * The selected file, null while none is
     * @member {Neo.data.Record|null} #file=null
     * @private
     */
    #file = null

    /**
     * Narrows the files to the selected folder, and enables Delete while a file is selected.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('folders').on({select: me.onFolderSelect, scope: me});
        me.getReference('files').view.selectionModel.on({selectionChange: me.onFileSelectionChange, scope: me})
    }

    /**
     * Moves the selected file into the Recycle Bin.
     */
    onDeleteButtonClick() {
        let me       = this,
            file     = me.#file,
            provider = me.getStateProvider();

        if (file) {
            me.#file = null;
            provider.getStore('documents').remove(file);
            provider.getStore('recycleBin').add(file.toJSON());
            me.getReference('delete-button').disabled = true
        }
    }

    /**
     * @param {Object}            data
     * @param {Neo.data.Record[]} data.records
     */
    onFileSelectionChange({records}) {
        let me = this;

        me.#file = records[0] || null;
        me.getReference('delete-button').disabled = !me.#file
    }

    /**
     * @param {Object}            data
     * @param {Neo.data.Record[]} data.records
     */
    onFolderSelect({records}) {
        let me       = this,
            [folder] = records;

        if (folder?.isLeaf) {
            me.getStateProvider().getStore('documents').getFilter('folder').value = folder.id === 'all' ? null : folder.id;
            me.getReference('title').text = folder.name
        }
    }
}

export default Neo.setupClass(Documents);
