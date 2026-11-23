import Container     from '../../../src/container/Base.mjs';
import FileList      from './FileList.mjs';
import Label         from '../../../src/component/Label.mjs';
import MenuList      from '../../../src/menu/List.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

const folders = ['Documents', 'Images', 'Archive'];

/**
 * @summary Project files with a context menu. A right-click on a file selects it and opens that file's actions at
 * the pointer; a right-click on the free space below the files offers a new one. Every action changes the list, and
 * the status line names the last one. `examples/menu/context` stays the page `ContextMenuNL.spec.mjs` drives.
 * @class Neo.examples.menu.contextFiles.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.menu.contextFiles.MainContainer'
         * @protected
         */
        className: 'Neo.examples.menu.contextFiles.MainContainer',
        /**
         * @member {String[]} cls=['neo-context-files']
         */
        cls: ['neo-context-files'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['neo-context-files-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module: Label,
                cls   : ['neo-context-files-title'],
                flex  : 1,
                text  : 'Project files'
            }, {
                module: ThemeSwitcher,
                flex  : 'none'
            }]
        }, {
            module: Label,
            cls   : ['neo-context-files-hint'],
            flex  : 'none',
            text  : 'Right-click a file for its actions, or the free space below the files for a new one.'
        }, {
            module   : FileList,
            flex     : 1,
            reference: 'files'
        }, {
            module   : Label,
            cls      : ['neo-context-files-status'],
            flex     : 'none',
            reference: 'status',
            text     : 'Last action: none'
        }]
    }

    /**
     * The one floating menu, refilled for each right-click.
     * @member {Neo.menu.List|null} contextMenu=null
     * @protected
     */
    contextMenu = null
    /**
     * Counts the files New file created, for their names.
     * @member {Number} newCount=0
     * @protected
     */
    newCount = 0

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        // Inside this example a right-click opens its menu, not the browser's
        Neo.main.DomEvents.registerPreventDefaultTargets({
            name    : 'contextmenu',
            cls     : 'neo-context-files',
            windowId: me.windowId
        });

        me.addDomListeners({contextmenu: me.onContextMenu, scope: me})
    }

    /**
     * Adds a file after an index and selects it.
     * @param {Object} data
     * @param {Number} index
     * @returns {Neo.data.Model}
     * @protected
     */
    addFile(data, index) {
        let list   = this.getReference('files'),
            {store} = list,
            id     = Math.max(0, ...store.items.map(item => item.id)) + 1,
            record = store.insert(index, {...data, id})[0];

        list.selectItem(record);

        return record
    }

    /**
     * @summary Keeps the detached floating context menu synchronized with the viewport theme.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);

        if (this.contextMenu && value) {
            this.contextMenu.theme = value
        }
    }

    /**
     * @returns {Neo.menu.List}
     * @protected
     */
    createContextMenu() {
        let me = this;

        return Neo.create(MenuList, {
            align       : me.createMenuAlign({x: 0, y: 0}),
            appName     : me.appName,
            displayField: 'text',
            floating    : true,
            hidden      : true,
            items       : [],
            parentId    : 'document.body',
            theme       : me.getTheme(),
            windowId    : me.windowId
        })
    }

    /**
     * The actions for one file. Move to offers the folders the file is not in, Star turns into Unstar.
     * @param {Neo.data.Model} record
     * @returns {Object[]}
     * @protected
     */
    createFileItems(record) {
        let me = this;

        return [
            {handler: me.onOpen.bind(me, record),      iconCls: 'fa fa-folder-open', id: 'open',      text: 'Open'},
            {handler: me.onDuplicate.bind(me, record), iconCls: 'fa fa-copy',        id: 'duplicate', text: 'Duplicate'},
            {
                iconCls: 'fa fa-folder-tree',
                id     : 'move',
                items  : folders.filter(folder => folder !== record.folder).map(folder => ({
                    handler: me.onMove.bind(me, record, folder),
                    iconCls: 'fa fa-folder',
                    id     : `move-${folder.toLowerCase()}`,
                    text   : folder
                })),
                text: 'Move to'
            },
            {
                handler: me.onStar.bind(me, record),
                iconCls: record.starred ? 'fa-regular fa-star' : 'fa fa-star',
                id     : 'star',
                text   : record.starred ? 'Unstar' : 'Star'
            },
            {id: 'separator', separator: true},
            {handler: me.onDelete.bind(me, record), iconCls: 'fa fa-trash', id: 'delete', text: 'Delete'}
        ]
    }

    /**
     * @summary The point-alignment contract for one pointer coordinate, as `examples/menu/context` uses it.
     * @param {{x:Number,y:Number}} point
     * @returns {Object}
     * @protected
     */
    createMenuAlign(point) {
        return {
            axisLock   : true,
            constrainTo: 'document.body',
            edgeAlign  : 't0-b0',
            target     : {x: point.x, y: point.y, width: 0, height: 0}
        }
    }

    /**
     * Destroys the detached floating menu with the example.
     * @param {...*} args
     */
    destroy(...args) {
        this.contextMenu?.destroy(true, false);
        super.destroy(...args)
    }

    /**
     * Opens the menu at the pointer: a file's actions on a file, New file anywhere else.
     * @param {Object} data
     * @returns {Promise<void>}
     * @protected
     */
    async onContextMenu(data) {
        let me     = this,
            list   = me.getReference('files'),
            index  = list.getInteractiveItemIndex(data.path),
            record = index === undefined ? null : list.store.get(list.getItemRecordId(data.path[index].id)),
            menu   = me.contextMenu || (me.contextMenu = me.createContextMenu());

        record && list.selectItem(record);

        menu.hideSubMenu();
        menu.items = record ? me.createFileItems(record) : [{handler: me.onNewFile.bind(me), iconCls: 'fa fa-file-circle-plus', id: 'new', text: 'New file'}];
        menu.align = me.createMenuAlign({x: data.clientX, y: data.clientY});

        if (menu.hidden) {
            menu.hidden = false
        } else {
            await menu.alignTo()
        }
    }

    /**
     * @param {Neo.data.Model} record
     */
    onDelete(record) {
        this.getReference('files').store.remove(record);
        this.setStatus(`Deleted ${record.name}`)
    }

    /**
     * Adds a copy below the file: "Budget 2027.xlsx" becomes "Budget 2027 copy.xlsx".
     * @param {Neo.data.Model} record
     */
    onDuplicate(record) {
        let {folder, kind, name} = record,
            dot  = name.lastIndexOf('.'),
            copy = dot > 0 ? `${name.slice(0, dot)} copy${name.slice(dot)}` : `${name} copy`;

        this.addFile({folder, kind, name: copy, starred: false}, this.getReference('files').store.indexOf(record) + 1);
        this.setStatus(`Duplicated ${name}`)
    }

    /**
     * @param {Neo.data.Model} record
     * @param {String} folder
     */
    onMove(record, folder) {
        record.folder = folder;
        this.setStatus(`Moved ${record.name} to ${folder}`)
    }

    /**
     * Adds an empty text file at the end of the list.
     */
    onNewFile() {
        let me   = this,
            name = `Untitled ${++me.newCount}.txt`;

        me.addFile({folder: 'Documents', kind: 'text', name, starred: false}, me.getReference('files').store.getCount());
        me.setStatus(`Created ${name}`)
    }

    /**
     * @param {Neo.data.Model} record
     */
    onOpen(record) {
        this.setStatus(`Opened ${record.name}`)
    }

    /**
     * @param {Neo.data.Model} record
     */
    onStar(record) {
        record.starred = !record.starred;
        this.setStatus(`${record.starred ? 'Starred' : 'Unstarred'} ${record.name}`)
    }

    /**
     * @param {String} action
     * @protected
     */
    setStatus(action) {
        this.getReference('status').text = `Last action: ${action}`
    }
}

export default Neo.setupClass(MainContainer);
