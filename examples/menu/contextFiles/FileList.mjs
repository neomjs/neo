import List  from '../../../src/list/Base.mjs';
import Store from '../../../src/data/Store.mjs';

const icons = {
    archive: 'fa-file-zipper',
    doc    : 'fa-file-lines',
    image  : 'fa-file-image',
    sheet  : 'fa-file-excel',
    text   : 'fa-file'
};

/**
 * @summary The project's files, one row each: its type icon, its name, the folder it is in and its star.
 * @class Neo.examples.menu.contextFiles.FileList
 * @extends Neo.list.Base
 */
class FileList extends List {
    static config = {
        /**
         * @member {String} className='Neo.examples.menu.contextFiles.FileList'
         * @protected
         */
        className: 'Neo.examples.menu.contextFiles.FileList',
        /**
         * @member {String[]} cls=['neo-context-files-list']
         */
        cls: ['neo-context-files-list'],
        /**
         * @member {String} displayField='name'
         */
        displayField: 'name',
        /**
         * @member {Object} store
         */
        store: {
            module: Store,
            model : {
                fields: [
                    {name: 'id',      type: 'Integer'},
                    {name: 'folder',  type: 'String'},
                    {name: 'kind',    type: 'String'},
                    {name: 'name',    type: 'String'},
                    {name: 'starred', type: 'Boolean'}
                ]
            },
            data: [
                {id: 1, folder: 'Documents', kind: 'doc',     name: 'Roadmap.md',          starred: true},
                {id: 2, folder: 'Documents', kind: 'sheet',   name: 'Budget 2027.xlsx',    starred: false},
                {id: 3, folder: 'Images',    kind: 'image',   name: 'Launch banner.png',   starred: false},
                {id: 4, folder: 'Images',    kind: 'image',   name: 'Team photo.jpg',      starred: true},
                {id: 5, folder: 'Archive',   kind: 'archive', name: 'Release 13.4.zip',    starred: false},
                {id: 6, folder: 'Documents', kind: 'text',    name: 'Meeting notes.txt',   starred: false}
            ]
        }
    }

    /**
     * @param {Neo.data.Model} record
     * @returns {Object[]}
     */
    createItemContent(record) {
        let {starred} = record;

        return [
            {tag: 'i',    cls: ['neo-context-files-icon', 'fa', icons[record.kind] || icons.text]},
            {tag: 'span', cls: ['neo-context-files-name'],   text: record.name},
            {tag: 'span', cls: ['neo-context-files-folder'], text: record.folder},
            {tag: 'i',    cls: ['neo-context-files-star', starred ? 'fa' : 'fa-regular', 'fa-star'], title: starred ? 'Starred' : 'Not starred'}
        ]
    }
}

export default Neo.setupClass(FileList);
