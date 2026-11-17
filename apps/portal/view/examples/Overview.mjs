import Button     from '../../../../src/button/Base.mjs';
import Container  from '../../../../src/container/Base.mjs';
import Example    from '../../model/Example.mjs';
import GroupIndex from './GroupIndex.mjs';
import GroupList  from './GroupList.mjs';

/**
 * @summary The front door of the examples section at `/examples`: what the section holds and how much, the action that
 * tests its first claim, three groups to start with, the banded index of every group, and every group's card by band.
 *
 * Every number follows the groups store (`Portal.store.ExampleGroups`): the headline counts the home records of the
 * groups that publish in the selected build, so it adds up to the counts the index shows.
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
         * The bands in their order, from `Portal.view.examples.MainContainer#familyDefinitions`.
         * @member {String[]} bands=[]
         */
        bands: [],
        /**
         * The build control's config, from `Portal.view.examples.MainContainer#createBuildControl()`.
         * @member {Object|null} buildControl=null
         */
        buildControl: null,
        /**
         * @member {String[]} cls=['portal-examples-overview']
         * @reactive
         */
        cls: ['portal-examples-overview'],
        /**
         * The groups that publish in the selected build, from `Portal.view.examples.MainContainer#getGroupStore()`.
         * The overview's card lists borrow its records.
         * @member {Portal.store.ExampleGroups|null} groupStore=null
         */
        groupStore: null,
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
         * The action that tests the headline's first claim, and the one beside it: a catalog record each, opened in the
         * selected build.
         * @member {Object[]} actions
         */
        actions: [
            {record: 'grid-big-data', text: 'Open the 100,000 × 200 grid', iconCls: 'fa fa-play', ui: 'primary'},
            {record: 'workstation',   text: 'or the Workstation →',                             ui: 'tertiary'}
        ],
        /**
         * The groups whose cards stand above the index.
         * @member {String[]} startFamilies=['grid-table','forms','multi-window']
         */
        startFamilies: ['grid-table', 'forms', 'multi-window']
    }

    /**
     * @summary Creates the intro, the three start cards, the index and a card list per band, and follows the groups
     * store from then on.
     * @protected
     */
    createItems() {
        const me           = this,
              {groupStore} = me,
              groupsOf     = filter => ({module: groupStore.constructor, sourceId: groupStore.id, filters: [filter]});

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
                    {tag: 'p',  cls: ['portal-examples-overview-lead'], text: me.lead}
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
                tag  : 'h2',
                text : 'Start here'
            }, {
                ...me.buildControl,
                flex: 'none'
            }]
        }, {
            module   : GroupList,
            cls      : ['portal-examples-overview-start-cards'],
            flex     : 'none',
            reference: 'overview-start-cards',
            store    : groupsOf({property: 'family', value: me.startFamilies, filterBy: ({item, value}) => !value.includes(item.family)})
        }, {
            ntype    : 'component',
            cls      : ['portal-examples-overview-heading'],
            flex     : 'none',
            reference: 'overview-index-heading',
            vdom     : {tag: 'h2', cn: [{tag: 'span'}, {tag: 'small', text: 'each with its own page'}]}
        }, {
            module: GroupIndex,
            flex  : 'none'
        }, ...me.bands.map(band => ({
            module   : Container,
            cls      : ['portal-examples-overview-band'],
            flex     : 'none',
            reference: 'overview-band-' + band.toLowerCase().replaceAll(' ', '-'),
            items    : [{
                ntype: 'component',
                cls  : ['portal-examples-overview-heading'],
                vdom : {tag: 'h2', cn: [{tag: 'span', text: band}, {tag: 'small'}]}
            }, {
                module: GroupList,
                store : groupsOf({property: 'band', value: band})
            }]
        }))];

        super.createItems();

        // The groups arrive with the catalog: the controller publishes them on its first load
        groupStore.on('load', me.onGroupsLoad, me)
    }

    /**
     * @summary Stops following the groups store.
     */
    destroy() {
        this.groupStore?.un('load', this.onGroupsLoad, this);
        super.destroy()
    }

    /**
     * @summary Counts the published examples and groups into the headline, points the actions at the selected build,
     * and shows each band with its number of groups, or not at all while it has none.
     */
    onGroupsLoad() {
        const me           = this,
              {groupStore} = me,
              provider     = me.getStateProvider(),
              catalogMode  = provider.getData('catalogMode'),
              catalog      = provider.getStore('catalog'),
              intro        = me.down({reference: 'overview-intro'}),
              indexHeading = me.down({reference: 'overview-index-heading'}),
              groups       = groupStore.getCount();
        let examples = 0;

        groupStore.forEach(group => {examples += group.count});

        intro.vdom.cn[1].text = `${examples} live examples in ${groups} groups`;
        intro.update();

        indexHeading.vdom.cn[0].text = `All ${groups} groups`;
        indexHeading.update();

        me.actions.forEach(({record}) => {
            const item = catalog.get(record);

            me.down({reference: 'overview-action-' + record}).set({
                hidden: !item || !Example.publishes(item, catalogMode),
                url   : item ? Example.href(item, catalogMode) : null
            })
        });

        me.bands.forEach(band => {
            const section = me.down({reference: 'overview-band-' + band.toLowerCase().replaceAll(' ', '-')}),
                  count   = groupStore.items.filter(group => group.band === band).length,
                  heading = section.items[0];

            heading.vdom.cn[1].text = count === 1 ? '1 group' : `${count} groups`;
            heading.update();
            section.hidden = count === 0
        })
    }
}

export default Neo.setupClass(Overview);
