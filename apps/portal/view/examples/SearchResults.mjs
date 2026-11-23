import Button       from '../../../../src/button/Base.mjs';
import Container    from '../../../../src/container/Base.mjs';
import Example      from '../../model/Example.mjs';
import ExampleStore from '../../store/Examples.mjs';
import List         from './List.mjs';

/**
 * @summary Cross-group search results view inside `.portal-examples-stage`: renders live catalog matches grouped under
 * their home group heading in definition order.
 *
 * Keeps zero persistent `Portal.view.examples.List` children while no query is active so resting stage card metrics
 * stay unchanged; clearing removes and destroys temporary group lists via {@link #clearResults}.
 * @class Portal.view.examples.SearchResults
 * @extends Neo.container.Base
 */
class SearchResults extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.examples.SearchResults'
         * @protected
         */
        className: 'Portal.view.examples.SearchResults',
        /**
         * @member {Object|null} buildControl=null
         */
        buildControl: null,
        /**
         * @member {Portal.store.Examples|null} catalogStore=null
         */
        catalogStore: null,
        /**
         * @member {String[]} cls=['portal-examples-search-results']
         * @reactive
         */
        cls: ['portal-examples-search-results'],
        /**
         * Null so stage card helpers checking `card.family || 'overview'` never mistake results for a group page.
         * @member {String|null} family=null
         */
        family: null,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * @summary Builds the results header (summary, Clear button, build selector), empty message and group container.
     * @protected
     */
    createItems() {
        const me = this;

        me.items = [{
            module: Container,
            cls   : ['portal-examples-search-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'start', wrap: 'wrap'},
            items : [{
                ntype    : 'component',
                cls      : ['portal-examples-search-heading'],
                flex     : 1,
                reference: 'search-heading',
                vdom     : {
                    tag: 'header',
                    cn : [
                        {tag: 'p', cls: ['portal-examples-search-eyebrow'], text: 'Filtered across all groups'},
                        {tag: 'h1'},
                        {tag: 'p', cls: ['portal-examples-search-summary']}
                    ]
                }
            }, {
                module: Container,
                cls   : ['portal-examples-search-actions'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
                items : [{
                    module   : Button,
                    cls      : ['portal-examples-search-clear'],
                    flex     : 'none',
                    handler  : 'onClearFind',
                    iconCls  : 'fa fa-xmark',
                    reference: 'search-clear-button',
                    text     : 'Clear (Esc)',
                    ui       : 'secondary'
                }, {
                    ...me.buildControl,
                    flex: 'none'
                }]
            }]
        }, {
            ntype    : 'component',
            cls      : ['portal-examples-search-empty'],
            flex     : 'none',
            hidden   : true,
            reference: 'search-empty',
            vdom     : {
                tag: 'div',
                cn : [
                    {tag: 'p', cls: ['portal-examples-search-empty-title'], text: 'No published examples match your query in the selected build.'},
                    {tag: 'p', cls: ['portal-examples-search-empty-hint'],  text: 'Try a capability term such as drag, date, grid or dashboard, or press Escape to return.'}
                ]
            }
        }, {
            module   : Container,
            cls      : ['portal-examples-search-groups'],
            flex     : 'none',
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'search-groups',
            items    : []
        }];

        super.createItems()
    }

    /**
     * @summary Builds one filtered `Portal.view.examples.List` config for either demonstration cards or component tiles.
     * @param {Object[]} records Matching records of one `kind`
     * @param {String} catalogMode Selected build mode
     * @param {Boolean} tiles True for compact `kind: 'component'` tiles sorted alphabetically by `name`
     * @returns {Object}
     * @protected
     */
    createKindList(records, catalogMode, tiles) {
        const me = this;

        return {
            module   : List,
            bind     : {catalogMode: data => data.catalogMode, exampleTheme: data => data.theme},
            flex     : 'none',
            leadCard : false,
            listeners: {leaveStart: 'onListLeaveStart'},
            ...(tiles ? {tiles: true} : {}),
            useWrapperNode: false,
            wrapperCls    : [
                tiles ? 'portal-examples-group-tiles' : 'portal-examples-group-cards',
                tiles ? 'portal-examples-search-tiles' : 'portal-examples-search-cards'
            ],
            store         : {
                module  : ExampleStore,
                model   : me.catalogStore.model,
                sourceId: me.catalogStore.id,
                ...(tiles ? {sorters: [{property: 'name', direction: 'ASC'}]} : {}),
                filters : [
                    {
                        property: 'ids',
                        fields  : ['id'],
                        value   : new Set(records.map(record => record.id)),
                        filterBy: ({item, value}) => !value.has(item.id)
                    },
                    {
                        property: 'catalogMode',
                        fields  : ['hidden', 'hiddenIn', 'image', 'urls'],
                        value   : catalogMode,
                        filterBy: ({item, value}) => !Example.publishes(item, value)
                    }
                ]
            }
        }
    }

    /**
     * @summary Removes and destroys dynamic grouped result lists so no temporary stores outlive an active filter.
     */
    clearResults() {
        this.getGroupsContainer().removeAll(true);
        this.down({reference: 'search-empty'}).hidden = true
    }

    /**
     * @returns {Neo.container.Base}
     */
    getGroupsContainer() {
        return this.down({reference: 'search-groups'})
    }

    /**
     * @returns {Portal.view.examples.List[]} Every result list in reading order: each group's cards, then its tiles
     */
    getLists() {
        return this.getGroupsContainer().items.flatMap(group => group.items.filter(item => item instanceof List))
    }

    /**
     * @summary Renders matching published examples grouped under their home group heading in definition order.
     * @param {Object} opts
     * @param {String} opts.query Raw trimmed search query
     * @param {Array<{definition: Object, records: Object[]}>} opts.groups Non-empty home-group result slices
     * @param {Number} opts.totalMatches Total matching records
     * @param {String} opts.catalogMode Selected build mode
     */
    showResults({query, groups, totalMatches, catalogMode}) {
        const me              = this,
              heading         = me.down({reference: 'search-heading'}),
              groupsContainer = me.getGroupsContainer(),
              groupCount      = groups.length,
              exampleWord     = totalMatches === 1 ? 'matching example' : 'matching examples',
              groupWord       = groupCount === 1 ? 'group' : 'groups';

        heading.vdom.cn[1].text = totalMatches > 0
            ? `${totalMatches} ${exampleWord} in ${groupCount} ${groupWord}`
            : `No matches for "${query}"`;
        heading.vdom.cn[2].text = totalMatches > 0
            ? `Showing live examples matching "${query}" across titles, captions, group names and keywords.`
            : `No live examples match "${query}".`;
        heading.update();

        groupsContainer.removeAll(true);
        me.down({reference: 'search-empty'}).hidden = totalMatches > 0;

        if (groups.length > 0) {
            groupsContainer.add(groups.map(({definition, records}) => {
                const cardRecords = records.filter(record => record.kind !== 'component'),
                      tileRecords = records.filter(record => record.kind === 'component'),
                      lists       = [];

                cardRecords.length > 0 && lists.push(me.createKindList(cardRecords, catalogMode, false));
                tileRecords.length > 0 && lists.push(me.createKindList(tileRecords, catalogMode, true));

                return {
                    module: Container,
                    cls   : ['portal-examples-search-group'],
                    flex  : 'none',
                    layout: {ntype: 'vbox', align: 'stretch'},
                    items : [{
                        ntype: 'component',
                        cls  : ['portal-examples-search-group-heading'],
                        flex : 'none',
                        vdom : {
                            tag: 'h2',
                            cn : [{
                                tag : 'a',
                                href: '#' + definition.route,
                                cn  : [
                                    {tag: 'i', cls: [...definition.iconCls.split(' '), 'portal-examples-search-group-icon'], 'aria-hidden': true},
                                    {tag: 'span', text: definition.title}
                                ]
                            }, {
                                tag : 'span',
                                cls : ['portal-examples-search-group-count'],
                                text: records.length === 1 ? '1 match' : `${records.length} matches`
                            }]
                        }
                    }, ...lists]
                }
            }))
        }
    }
}

export default Neo.setupClass(SearchResults);
