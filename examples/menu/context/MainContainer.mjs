import Button   from '../../../src/button/Base.mjs';
import Label    from '../../../src/component/Label.mjs';
import MenuList from '../../../src/menu/List.mjs';
import Viewport from '../../../src/container/Viewport.mjs';

/**
 * Minimal context-menu composition: real browser `contextmenu` input becomes serialized point
 * alignment for one reusable floating Menu. Menu owns outside-pointer/focus dismissal; the app owns
 * only its surface, menu contents, and the selected-action state shown below.
 *
 * @class Neo.examples.menu.context.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.menu.context.MainContainer'
         * @protected
         */
        className: 'Neo.examples.menu.context.MainContainer',
        /**
         * @member {String[]} cls=['neo-context-menu-workspace']
         */
        cls: ['neo-context-menu-workspace'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'center',pack:'center'}
         */
        layout: {ntype: 'vbox', align: 'center', pack: 'center'},
        /**
         * @member {Object} style
         */
        style: {gap: '1.5em', padding: '3em'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Label,
            text  : 'Right-click anywhere in this workspace to open the context menu.'
        }, {
            module   : Button,
            handler  : 'up.onFocusableClick',
            reference: 'focusable-target',
            text     : 'Focusable outside target'
        }, {
            module   : Label,
            reference: 'context-status',
            text     : 'Last action: none'
        }]
    }

    /**
     * The one Menu instance reused across every context-menu invocation.
     * @member {Neo.menu.List|null} contextMenu=null
     * @protected
     */
    contextMenu = null
    /**
     * Last pointer point handed to the alignment engine, exposed for whitebox evidence.
     * @member {Object|null} contextPoint=null
     */
    contextPoint = null
    /**
     * Stable Menu identity exposed without serializing the Menu instance itself.
     * @member {String|null} contextMenuId=null
     */
    contextMenuId = null
    /**
     * Number of real context-menu invocations handled by this instance.
     * @member {Number} openCount=0
     */
    openCount = 0
    /**
     * Last selected leaf action.
     * @member {String} lastAction='none'
     */
    lastAction = 'none'

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        // Native suppression is scoped to this example class; no application/document workaround.
        Neo.main.DomEvents.registerPreventDefaultTargets({
            name    : 'contextmenu',
            cls     : 'neo-context-menu-workspace',
            windowId: me.windowId
        });

        me.addDomListeners({contextmenu: me.onContextMenu, scope: me})
    }

    /**
     * Creates the one floating Menu. A context point is geometry, not a persistent trigger element,
     * so `parentComponent` is deliberately absent.
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
            items       : [{
                handler: me.onLeafAction.bind(me, 'Open'),
                iconCls: 'fa fa-folder-open',
                id     : 'open',
                text   : 'Open'
            }, {
                iconCls: 'fa fa-magnifying-glass',
                id     : 'inspect',
                items  : [{
                    iconCls: 'fa fa-circle-info',
                    id     : 'details',
                    items  : [{
                        handler: me.onLeafAction.bind(me, 'Copy name'),
                        iconCls: 'fa fa-copy',
                        id     : 'copy-name',
                        text   : 'Copy name'
                    }],
                    text: 'Details'
                }],
                text: 'Inspect'
            }, {
                id       : 'sep-1',
                separator: true
            }, {
                disabled: true,
                handler : me.onLeafAction.bind(me, 'Delete'),
                iconCls : 'fa fa-trash',
                id      : 'delete',
                text    : 'Delete (disabled)'
            }],
            parentId: 'document.body',
            theme   : me.theme,
            windowId: me.windowId
        })
    }

    /**
     * @summary Creates the complete point-alignment contract for one pointer coordinate.
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
     * Destroys the detached floating Menu with its owning example.
     * @param {...*} args
     */
    destroy(...args) {
        this.contextMenu?.destroy(true, false);
        super.destroy(...args)
    }

    /**
     * Records an ordinary focusable outside click without taking over Menu dismissal.
     */
    onFocusableClick() {
        this.getReference('context-status').text = 'Focusable outside target clicked'
    }

    /**
     * Records the selected Menu leaf in worker state and in the visible status label.
     * @param {String} action
     * @protected
     */
    onLeafAction(action) {
        this.lastAction = action;
        this.getReference('context-status').text = `Last action: ${action}`
    }

    /**
     * Opens or repositions the reusable Menu from a real serialized browser context-menu event.
     * @param {Object} data
     * @param {Number} data.clientX
     * @param {Number} data.clientY
     * @returns {Promise<void>}
     * @protected
     */
    async onContextMenu(data) {
        let me    = this,
            point = me.contextPoint = {x: data.clientX, y: data.clientY},
            menu  = me.contextMenu || (me.contextMenu = me.createContextMenu());

        me.contextMenuId = menu.id;
        me.openCount++;

        menu.hideSubMenu();
        menu.selectionModel?.deselectAll(true);
        menu.align = me.createMenuAlign(point);

        if (menu.hidden) {
            menu.hidden = false
        } else {
            await menu.alignTo()
        }
    }
}

export default Neo.setupClass(MainContainer);
