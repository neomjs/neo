import Button       from '../../../../src/button/Base.mjs';
import Container    from '../../../../src/container/Base.mjs';
import ExampleGroup from '../../model/ExampleGroup.mjs';
import GroupIndex   from './GroupIndex.mjs';
import List         from './List.mjs';

/**
 * @summary The page of one example group: its heading, the build control and its cards.
 *
 * Below 640 px a crumb stays on top of the page, and its group button opens the whole banded index as a sheet
 * (`Portal.view.examples.GroupIndex`, presentation `sheet`): one tap opens it, a second navigates. The sheet takes focus
 * when it opens, closes on Escape, on its button and on a followed link, and returns focus to its button.
 * @class Portal.view.examples.GroupPage
 * @extends Neo.container.Base
 */
class GroupPage extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.examples.GroupPage'
         * @protected
         */
        className: 'Portal.view.examples.GroupPage',
        /**
         * The build control's config, from `Portal.view.examples.MainContainer#createBuildControl()`.
         * @member {Object|null} buildControl=null
         */
        buildControl: null,
        /**
         * @member {String[]} cls=['portal-examples-group-page']
         * @reactive
         */
        cls: ['portal-examples-group-page'],
        /**
         * The id of the group this page shows.
         * @member {String|null} family=null
         */
        family: null,
        /**
         * The group's record as the selected build publishes it. The controller writes it on every publication.
         * @member {Portal.model.ExampleGroup|null} group_=null
         * @reactive
         */
        group_: null,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The cards' store config, from `Portal.view.examples.MainContainer#createGroupPage()`.
         * @member {Object|null} listStore=null
         */
        listStore: null,
        /**
         * True while the phone's sheet shows the banded index.
         * @member {Boolean} sheetOpen_=false
         * @reactive
         */
        sheetOpen_: false
    }

    /**
     * @summary Shows the group's new title, icon, count and sentence.
     * @param {Portal.model.ExampleGroup|null} value
     * @param {Portal.model.ExampleGroup|null} oldValue
     * @protected
     */
    afterSetGroup(value, oldValue) {
        oldValue && value && this.updateHeading()
    }

    /**
     * @summary Shows or hides the sheet, and tells its button.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSheetOpen(value, oldValue) {
        if (oldValue === undefined) return;

        const button = this.getGroupButton();

        button.getVdomRoot()['aria-expanded'] = value;
        button.update();
        this.getSheet().hidden = !value
    }

    /**
     * @summary The crumb with its sheet, the heading beside the build control, and the cards.
     * @protected
     */
    createItems() {
        const me      = this,
              {group} = me;

        me.items = [{
            module: Container,
            cls   : ['portal-examples-group-crumb'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module: Button,
                cls   : ['portal-examples-group-crumb-home'],
                route : '/examples',
                text  : 'Examples',
                ui    : 'tertiary'
            }, {
                ntype: 'component',
                cls  : ['portal-examples-group-crumb-separator'],
                vdom : {tag: 'span', 'aria-hidden': true, cn: [{tag: 'span', text: '›'}]}
            }, {
                module   : Button,
                cls      : ['portal-examples-group-button'],
                handler  : me.onGroupButtonClick.bind(me),
                iconCls  : group.iconCls,
                reference: 'group-button',
                text     : group.title,
                ui       : 'secondary'
            }, {
                module      : GroupIndex,
                activeFamily: me.family,
                hidden      : true,
                id          : me.id + '__sheet',
                presentation: 'sheet',
                reference   : 'group-sheet',
                domListeners: {
                    click  : me.onSheetClick,
                    keydown: me.onSheetKeyDown,
                    scope  : me
                }
            }]
        }, {
            module: Container,
            cls   : ['portal-examples-group-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'start', wrap: 'wrap'},
            items : [{
                ntype    : 'component',
                cls      : ['portal-examples-group-heading'],
                flex     : 1,
                reference: 'group-heading',
                vdom     : {tag: 'header', cn: [{tag: 'h1'}, {tag: 'p'}]}
            }, {
                ...me.buildControl,
                flex: 'none'
            }]
        }, {
            module        : List,
            bind          : {catalogMode: data => data.catalogMode},
            flex          : 'none',
            reference     : 'group-list',
            store         : me.listStore,
            useWrapperNode: false // the page scrolls, not the list
        }];

        super.createItems();

        // The engine's button has no disclosure state: this page owns which sheet it controls and whether it is open
        Object.assign(me.getGroupButton().getVdomRoot(), {'aria-controls': me.id + '__sheet', 'aria-expanded': false});

        me.updateHeading()
    }

    /**
     * @returns {Neo.button.Base}
     */
    getGroupButton() {
        return this.down({reference: 'group-button'})
    }

    /**
     * @returns {Portal.view.examples.List}
     */
    getList() {
        return this.down({reference: 'group-list'})
    }

    /**
     * @returns {Portal.view.examples.GroupIndex}
     */
    getSheet() {
        return this.down({reference: 'group-sheet'})
    }

    /**
     * @summary The group button toggles the sheet. An opened sheet takes focus, a closed one returns it to the button.
     */
    async onGroupButtonClick() {
        const me    = this,
              sheet = me.getSheet();

        me.sheetOpen = !me.sheetOpen;

        if (me.sheetOpen) {
            await sheet.waitFor(() => sheet.mounted);
            sheet.mounted && sheet.focus(sheet.id, true)
        }
    }

    /**
     * @summary A followed link closes the sheet; the route opens its page.
     * @param {Object} data
     */
    onSheetClick(data) {
        if (data.path.some(node => node.tagName === 'a')) {
            this.sheetOpen = false
        }
    }

    /**
     * @summary Escape closes the sheet and returns focus to its button.
     * @param {Object} data
     */
    onSheetKeyDown(data) {
        if (data.key === 'Escape') {
            this.sheetOpen = false;
            this.getGroupButton().focus()
        }
    }

    /**
     * @summary Writes the group's title, count and sentence into the crumb and the heading.
     */
    updateHeading() {
        const me            = this,
              {group}       = me,
              button        = me.getGroupButton(),
              heading       = me.down({reference: 'group-heading'}),
              [title, line] = heading.vdom.cn;

        button.set({iconCls: group.iconCls, text: group.title});

        title.text = group.title;
        line.text  = [ExampleGroup.countLabel(group), group.sentence].filter(Boolean).join(' · ');
        heading.update()
    }
}

export default Neo.setupClass(GroupPage);
