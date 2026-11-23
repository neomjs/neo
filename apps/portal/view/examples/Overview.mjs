import Button     from '../../../../src/button/Base.mjs';
import Container  from '../../../../src/container/Base.mjs';
import Example    from '../../model/Example.mjs';
import GroupIndex from './GroupIndex.mjs';
import List       from './List.mjs';

/**
 * @summary The front door of the examples section at `/examples`: what the section holds and how much, the action that
 * tests its first claim, the `"Start here"` featured live demonstrations with a 2×2 lead card, and on phones the banded
 * index beneath the cards.
 *
 * Every number follows the groups store (`Portal.store.ExampleGroups`): the headline counts the home records of the
 * groups that publish in the selected build, so it adds up to the counts shown in the left-rail navigation index.
 * @class Portal.view.examples.Overview
 * @extends Neo.container.Base
 */
class Overview extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.examples.Overview'
         * @protected
         */
        className: 'Portal.view.examples.Overview',
        /**
         * @member {Object} bind
         */
        bind: {
            compactLead : data => data.size === 'x-small',
            exampleTheme: data => data.theme
        },
        /**
         * The build control's config, from `Portal.view.examples.MainContainer#createBuildControl()`. The overview
         * shows it beside its heading, and a copy under its featured cards that only a phone displays.
         * @member {Object|null} buildControl=null
         */
        buildControl: null,
        /**
         * The selected build mode, kept in sync with `Portal.view.examples.MainContainer`.
         * @member {String} catalogMode='dist_prod'
         */
        catalogMode: 'dist_prod',
        /**
         * The shared catalog store from `Portal.view.examples.MainContainer#getCatalogStore()`.
         * @member {Portal.store.Examples|null} catalogStore=null
         */
        catalogStore: null,
        /**
         * @member {String[]} cls=['portal-examples-overview']
         * @reactive
         */
        cls: ['portal-examples-overview'],
        /**
         * True when the Portal viewport is at phone width (`size: 'x-small'`, `<= 640 px`), switching the intro to
         * `phoneLead`.
         * @member {Boolean} compactLead_=false
         * @reactive
         */
        compactLead_: false,
        /**
         * The theme the actions open their examples in: the Portal's theme on screen.
         * @member {String|null} exampleTheme_=null
         * @reactive
         */
        exampleTheme_: null,
        /**
         * The groups that publish in the selected build, from `Portal.view.examples.MainContainer#getGroupStore()`.
         * @member {Portal.store.ExampleGroups|null} groupStore=null
         */
        groupStore: null,
        /**
         * Map from group `family` id to display title for `"Start here"` card group pills.
         * @member {Object|null} groupTitles=null
         */
        groupTitles: null,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * What the section offers and why it runs as it does, under the headline.
         * @member {String} lead
         */
        lead: 'Grids with 100,000 rows × 200 columns, forms, calendars, a Gantt chart, docking dashboards and multi-window apps, each one running live in your browser. Neo.mjs keeps the app and its data in workers, so the main thread only paints.',
        /**
         * Concise single-sentence lead shown on phone viewports (`size: 'x-small'`, `<= 640 px`) so the first featured
         * card starts by the middle of the first screen.
         * @member {String} phoneLead
         */
        phoneLead: 'Grids, Gantt charts, forms and apps, each one running live in your browser.',
        /**
         * The action that tests the headline's first claim, and the one beside it: a catalog record each, opened in the
         * selected build.
         * @member {Object[]} actions
         */
        actions: [
            {record: 'grid-big-data', text: 'Open the 100,000 × 200 grid', iconCls: 'fa fa-play', ui: 'primary'},
            {record: 'workstation',   text: 'or the Workstation',          iconCls: 'fa fa-arrow-right', iconPosition: 'right', ui: 'tertiary'}
        ]
    }

    /**
     * @summary Switches the intro lead between `phoneLead` (`size: 'x-small'`) and the two-sentence desktop `lead`.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetCompactLead(value, oldValue) {
        if (oldValue !== undefined) {
            const intro = this.down({reference: 'overview-intro'});

            if (intro) {
                intro.vdom.cn[2].text = value ? this.phoneLead : this.lead;
                intro.update()
            }
        }
    }

    /**
     * @summary Re-points the actions when the Portal switches its theme.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetExampleTheme(value, oldValue) {
        oldValue !== undefined && this.groupStore?.getCount() > 0 && this.updateActions()
    }

    /**
     * @summary Creates the intro, actions, `"Start here"` header with build control, featured demonstration cards,
     * and the mobile-only banded index below them, keeping `List` a direct child so `Overview` is its scroll root.
     * @protected
     */
    createItems() {
        const me                                      = this,
              {catalogMode, catalogStore, groupStore} = me;

        me.items = [{
            module: Container,
            cls   : ['portal-examples-overview-top'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'end', wrap: 'wrap'},
            items : [{
                ntype    : 'component',
                cls      : ['portal-examples-overview-intro'],
                flex     : 1,
                reference: 'overview-intro',
                vdom     : {tag: 'header', cn: [
                    {tag: 'p',  cls: ['portal-examples-overview-eyebrow'], text: 'Neo.mjs examples'},
                    {tag: 'h1', cls: ['portal-examples-overview-headline']},
                    {tag: 'p',  cls: ['portal-examples-overview-lead'], text: me.compactLead ? me.phoneLead : me.lead}
                ]}
            }, {
                module: Container,
                cls   : ['portal-examples-overview-actions'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
                items : me.actions.map(({record, ...action}) => ({
                    module   : Button,
                    ...action,
                    flex     : 'none',
                    reference: 'overview-action-' + record,
                    urlTarget: '_blank'
                }))
            }]
        }, {
            module: Container,
            cls   : ['portal-examples-overview-start'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                ntype: 'component',
                cls  : ['portal-examples-overview-heading'],
                flex : 1,
                vdom : {tag: 'h2', cn: [
                    {tag: 'span',  text: 'Start here'},
                    {tag: 'small', text: 'featured live demonstrations'}
                ]}
            }, {
                ...me.buildControl,
                flex: 'none'
            }]
        }, {
            module        : List,
            bind          : {catalogMode: data => data.catalogMode, exampleTheme: data => data.theme},
            flex          : 'none',
            groupTitles   : me.groupTitles,
            leadCard      : true,
            listeners     : {leaveStart: 'onListLeaveStart'},
            reference     : 'overview-list',
            showGroup     : true,
            useWrapperNode: false, // the overview scrolls, not the list
            wrapperCls    : ['portal-examples-overview-cards'],
            store         : {
                module  : catalogStore.constructor,
                model   : catalogStore.model,
                sourceId: catalogStore.id,
                filters : [
                    {property: 'featured',    fields: ['featured'],                             value: true,        filterBy: ({item}) => !item.featured},
                    {property: 'catalogMode', fields: ['hidden', 'hiddenIn', 'image', 'urls'], value: catalogMode, filterBy: ({item, value}) => !Example.publishes(item, value)}
                ]
            }
        }, {
            // The control's place on a phone: under the featured cards, off the first screen (Overview.css)
            ...Neo.clone(me.buildControl, true),
            cls : ['portal-examples-build-control', 'portal-examples-overview-build-foot'],
            flex: 'none'
        }, {
            module: Container,
            cls   : ['portal-examples-overview-mobile-index'],
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype    : 'component',
                cls      : ['portal-examples-overview-heading'],
                flex     : 'none',
                reference: 'overview-index-heading',
                vdom     : {tag: 'h2', cn: [{tag: 'span'}, {tag: 'small', text: 'each with its own page'}]}
            }, {
                module      : GroupIndex,
                flex        : 'none',
                presentation: 'overview',
                reference   : 'overview-group-index'
            }]
        }];

        super.createItems();

        // The groups arrive with the catalog: the controller publishes them on its first load
        groupStore.on('load', me.onGroupsLoad, me);
        groupStore.getCount() > 0 && me.onGroupsLoad()
    }

    /**
     * @summary Stops following the groups store.
     */
    destroy() {
        this.groupStore?.un('load', this.onGroupsLoad, this);
        super.destroy()
    }

    /**
     * @returns {Portal.view.examples.List}
     */
    getList() {
        return this.down({reference: 'overview-list'})
    }

    /**
     * @returns {Portal.view.examples.List[]} The overview's one list, as a group page lists its cards and tiles
     */
    getLists() {
        return [this.getList()]
    }

    /**
     * @summary Counts the published examples and groups into the headline, updates the mobile index heading,
     * and points the actions at the selected build.
     */
    onGroupsLoad() {
        const me           = this,
              {groupStore} = me,
              intro        = me.down({reference: 'overview-intro'}),
              indexHeading = me.down({reference: 'overview-index-heading'}),
              groups       = groupStore.getCount();
        let examples = 0;

        groupStore.forEach(group => {examples += group.count});

        intro.vdom.cn[1].text = `${examples} live examples in ${groups} groups`;
        intro.update();

        indexHeading.vdom.cn[0].text = `All ${groups} groups`;
        indexHeading.update();

        me.updateActions()
    }

    /**
     * @summary Points each action at its record in the selected build, opened in the Portal's theme, and hides an
     * action whose record does not publish there.
     */
    updateActions() {
        const me          = this,
              provider    = me.getStateProvider(),
              catalogMode = provider.getData('catalogMode'),
              catalog     = provider.getStore('catalog');

        me.actions.forEach(({record}) => {
            const item = catalog.get(record);

            me.down({reference: 'overview-action-' + record}).set({
                hidden: !item || !Example.publishes(item, catalogMode),
                url   : item ? Example.href(item, catalogMode, {theme: me.exampleTheme}) : null
            })
        })
    }
}

export default Neo.setupClass(Overview);
