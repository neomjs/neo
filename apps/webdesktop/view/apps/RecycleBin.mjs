import Button    from '../../../../src/button/Base.mjs';
import Container from '../../../../src/container/Base.mjs';
import GlassGrid from './GlassGrid.mjs';
import Label     from '../../../../src/component/Label.mjs';
import RowModel  from '../../../../src/selection/grid/RowModel.mjs';
import Toolbar   from '../../../../src/toolbar/Base.mjs';

/**
 * @summary The Recycle Bin app: the deleted files, and Restore, which moves the selected one back into the
 * `documents` store of the desktop's root state provider.
 * @class WebDesktop.view.apps.RecycleBin
 * @extends Neo.container.Base
 */
class RecycleBin extends Container {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.RecycleBin'
         * @protected
         */
        className: 'WebDesktop.view.apps.RecycleBin',
        /**
         * Its toolbar is styled with Documents' rules, which load with this window even if Documents never opened
         * @member {String[]} additionalThemeFiles=['WebDesktop.view.apps.Documents']
         */
        additionalThemeFiles: ['WebDesktop.view.apps.Documents'],
        /**
         * @member {String[]} cls=['webdesktop-recycle-bin']
         */
        cls: ['webdesktop-recycle-bin'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            cls   : ['webdesktop-documents-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                cls   : ['webdesktop-documents-title'],
                text  : 'Deleted files'
            }, '->', {
                module   : Button,
                disabled : true,
                handler  : 'up.onRestoreButtonClick',
                iconCls  : 'fas fa-trash-arrow-up',
                reference: 'restore-button',
                text     : 'Restore'
            }]
        }, {
            module    : GlassGrid,
            bind      : {store: 'stores.recycleBin'},
            cls       : ['webdesktop-files-grid'],
            flex      : 1,
            reference : 'files',
            viewConfig: {selectionModel: {module: RowModel}},
            columns   : [
                {dataField: 'iconCls',      text: '',         width: 40, type: 'icon'},
                {dataField: 'name',         text: 'Name',     flex : 1},
                {dataField: 'folder',       text: 'From',     width: 96},
                {dataField: 'modifiedText', text: 'Modified', width: 110},
                {dataField: 'sizeText',     text: 'Size',     width: 80}
            ]
        }]
    }

    /**
     * The selected file, null while none is
     * @member {Neo.data.Record|null} #file=null
     * @private
     */
    #file = null

    /**
     * Enables Restore while a file is selected.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('files').view.selectionModel.on({selectionChange: me.onFileSelectionChange, scope: me})
    }

    /**
     * @param {Object}            data
     * @param {Neo.data.Record[]} data.records
     */
    onFileSelectionChange({records}) {
        let me = this;

        me.#file = records[0] || null;
        me.getReference('restore-button').disabled = !me.#file
    }

    /**
     * Moves the selected file back into Documents.
     */
    onRestoreButtonClick() {
        let me       = this,
            file     = me.#file,
            provider = me.getStateProvider();

        if (file) {
            me.#file = null;
            provider.getStore('recycleBin').remove(file);
            provider.getStore('documents').add(file.toJSON());
            me.getReference('restore-button').disabled = true
        }
    }
}

export default Neo.setupClass(RecycleBin);
