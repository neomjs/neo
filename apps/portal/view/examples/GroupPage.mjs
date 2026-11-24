import Container    from '../../../../src/container/Base.mjs';
import ExampleGroup from '../../model/ExampleGroup.mjs';
import List         from './List.mjs';

/**
 * @summary The page of one example group: its heading, the build control and its cards.
 *
 * Navigation between groups and back to `/examples` lives once in `Portal.view.examples.MainContainer` (left-rail
 * index on desktop, crumb and sheet on phones). The page scrolls as a unit so its direct `List` child (`useWrapperNode:
 * false`) uses this container as its intersection root.
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
         * Vertical stack of the group heading and cards; the page itself scrolls (see `List#useWrapperNode`).
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The cards' store config, from `Portal.view.examples.MainContainer#createGroupPage()`.
         * @member {Object|null} listStore=null
         */
        listStore: null
    }

    /**
     * @summary Shows the group's new title, count and sentence.
     * @param {Portal.model.ExampleGroup|null} value
     * @param {Portal.model.ExampleGroup|null} oldValue
     * @protected
     */
    afterSetGroup(value, oldValue) {
        oldValue && value && this.updateHeading()
    }

    /**
     * @summary Creates the heading with the build control and the group's demonstration cards.
     * @protected
     */
    createItems() {
        const me = this;

        me.items = [{
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
            ntype    : 'component',
            cls      : ['portal-examples-kind-heading'],
            flex     : 'none',
            hidden   : true,
            reference: 'cards-heading',
            tag      : 'h2',
            text     : 'Demonstrations'
        }, {
            module        : List,
            bind          : {catalogMode: data => data.catalogMode, exampleTheme: data => data.theme},
            flex          : 'none',
            leadCard      : true,
            listeners     : {leaveRow: 'onListLeaveRow', leaveStart: 'onListLeaveStart', select: 'onListSelect'},
            reference     : 'group-list',
            useWrapperNode: false, // the page scrolls, not the list
            wrapperCls    : ['portal-examples-group-cards'],
            store         : me.createKindStore(false)
        }, {
            ntype    : 'component',
            cls      : ['portal-examples-kind-heading'],
            flex     : 'none',
            hidden   : true,
            reference: 'tiles-heading',
            tag      : 'h2',
            text     : me.group.tileHeading || 'Components'
        }, {
            module        : List,
            bind          : {catalogMode: data => data.catalogMode, exampleTheme: data => data.theme},
            flex          : 'none',
            listeners     : {leaveRow: 'onListLeaveRow', leaveStart: 'onListLeaveStart', select: 'onListSelect'},
            reference     : 'tile-list',
            tiles         : true,
            useWrapperNode: false,
            wrapperCls    : ['portal-examples-group-tiles'],
            store         : me.createKindStore(true)
        }];

        super.createItems();
        me.updateHeading()
    }

    /**
     * @summary The store config of one kind's list: the group's records filtered to its cards or to its tiles.
     * Cards keep the catalog's order; tiles sort by name, so a visitor scans them like an index.
     * @param {Boolean} tiles True for the `kind: 'component'` records
     * @returns {Object}
     * @protected
     */
    createKindStore(tiles) {
        const {listStore} = this;

        return {...listStore, ...(tiles && {sorters: [{property: 'name', direction: 'ASC'}]}), filters: [...listStore.filters, {
            property: 'kind',
            fields  : ['kind'],
            value   : 'component',
            filterBy: tiles ? ({item, value}) => item.kind !== value : ({item, value}) => item.kind === value
        }]}
    }

    /**
     * @returns {Portal.view.examples.List} The list of the group's cards
     */
    getList() {
        return this.down({reference: 'group-list'})
    }

    /**
     * @returns {Portal.view.examples.List[]} The card list, then the tile list
     */
    getLists() {
        return [this.getList(), this.getTileList()]
    }

    /**
     * @returns {Portal.view.examples.List} The list of the group's tiles
     */
    getTileList() {
        return this.down({reference: 'tile-list'})
    }

    /**
     * @summary Writes the group's title, count and sentence into the heading.
     */
    updateHeading() {
        const me            = this,
              {group}       = me,
              heading       = me.down({reference: 'group-heading'}),
              [title, line] = heading.vdom.cn;

        title.text = group.title;
        line.text  = [ExampleGroup.countLabel(group), group.sentence].filter(Boolean).join(' · ');
        heading.update();

        // Each kind gets its heading only when the page shows both
        const both = group.tileCount > 0 && group.count + group.crossCount > group.tileCount;

        me.down({reference: 'cards-heading'}).hidden = !both;
        me.down({reference: 'tiles-heading'}).set({hidden: !both, text: group.tileHeading || 'Components'})
    }
}

export default Neo.setupClass(GroupPage);
