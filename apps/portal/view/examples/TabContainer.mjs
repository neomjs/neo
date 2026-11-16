import Button                 from '../../../../src/button/Base.mjs';
import StateProvider          from '../../../../src/state/Provider.mjs';
import ExampleStore           from '../../store/Examples.mjs';
import List                   from './List.mjs';
import TabContainer           from '../shared/TabContainer.mjs';
import TabContainerController from './TabContainerController.mjs';

/**
 * @summary Publishes the available example families and one shared build selection.
 * @class Portal.view.examples.TabContainer
 * @extends Portal.view.shared.TabContainer
 */
class ExamplesTabContainer extends TabContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.examples.TabContainer'
         * @protected
         */
        className: 'Portal.view.examples.TabContainer',
        /**
         * @member {Number|null} activeIndex=null
         * @reactive
         */
        activeIndex: null,
        /**
         * @member {Neo.controller.Component} controller=TabContainerController
         * @reactive
         */
        controller: TabContainerController,
        /**
         * @member {Boolean} dragResortable=true
         * @reactive
         */
        dragResortable: true,
        /**
         * The single ordered source of family identity, title, route and tab icon.
         * Featured is independent of home-family membership; other tabs require a covered catalog record.
         * @member {Object[]} familyDefinitions
         */
        familyDefinitions: [
            {family: null,           title: 'Featured',       route: '/examples',              iconCls: 'fa fa-star'},
            {family: 'grid-table',   title: 'Grid & Table',   route: '/examples/grid',         iconCls: 'fa fa-table'},
            {family: 'forms',        title: 'Forms',          route: '/examples/forms',        iconCls: 'fa fa-keyboard'},
            {family: 'multi-window', title: 'Multi-Window',   route: '/examples/multi-window', iconCls: 'far fa-window-restore'},
            {family: 'calendar',     title: 'Calendar',       route: '/examples/calendar',     iconCls: 'fa fa-calendar'},
            {family: 'components',   title: 'Components',     route: '/examples/components',   iconCls: 'fa fa-cubes'},
            {family: 'state',        title: 'State & Data',   route: '/examples/state',        iconCls: 'fa fa-database'}
        ],
        /**
         * Build labels and legacy route identities.
         * @member {Object[]} buildModes
         */
        buildModes: [
            {id: 'dist_prod', text: 'Production'},
            {id: 'dist_esm',  text: 'ESM'},
            {id: 'dist_dev',  text: 'Development build'},
            {id: 'devmode',   text: 'Dev mode'}
        ],
        /**
         * Owns the one fetched catalog and the build state consumed by every list and the control.
         * @member {Object} stateProvider
         * @reactive
         */
        stateProvider: {
            module: StateProvider,
            data  : {catalogMode: 'dist_prod'},
            stores: {
                catalog: {module: ExampleStore, url: '../../apps/portal/resources/data/examples.json'}
            }
        }
    }

    /**
     * @summary Seeds Featured and a persistent build menu at the foot of the existing tab bar.
     * @protected
     */
    createItems() {
        let me = this;

        me.items = [me.createFamilyItem(me.familyDefinitions[0])];
        me.headerActions = [{
            module     : Button,
            action     : 'example-build',
            text       : 'Build',
            bind       : {text: data => 'Build: ' + me.buildModes.find(mode => mode.id === data.catalogMode).text},
            cls        : ['neo-tab-header-button', 'portal-examples-build-selector'],
            iconCls    : 'fa fa-layer-group',
            reference  : 'example-build-selector',
            showOnFocus: false,
            menu       : {
                items: me.buildModes.map(mode => ({...mode, handler: 'onSelectBuild'}))
            }
        }];

        super.createItems()
    }

    /**
     * @summary Projects one family through a model-backed Store over the provider's catalog.
     *
     * The store lists the family's covered records only (`hasCover()`): a record without a cover stays in the
     * catalog and gets no card, so an overview never shows a placeholder.
     * @param {Object} definition
     * @returns {Object}
     */
    createFamilyItem(definition) {
        const me       = this,
              featured = definition.family === null,
              catalog  = me.getCatalogStore();

        return {
            module   : List,
            bind     : {catalogMode: data => data.catalogMode},
            cls      : [featured ? 'portal-examples-featured' : 'portal-examples-family-overview'],
            reference: 'examples-' + (featured ? 'featured' : definition.route.slice('/examples/'.length)) + '-list',
            store    : {
                module  : ExampleStore,
                model   : catalog.model,
                sourceId: catalog.id,
                filters : [
                    {property: featured ? 'featured' : 'family', operator: '===', value: featured || definition.family},
                    {property: 'image', fields: ['image'], filterBy: ({item}) => !me.hasCover(item)}
                ]
            },
            header: {iconCls: definition.iconCls, route: definition.route, text: definition.title}
        }
    }

    /**
     * @summary Whether a record publishes a card: it names a cover. The one rule the family stores filter by
     * and the controller publishes tabs by.
     * @param {Object} record A catalog record or its raw row
     * @returns {Boolean}
     */
    hasCover(record) {
        return !!record.image
    }

    /**
     * @summary Returns the section-owned unfiltered catalog; family stores borrow its records.
     * @returns {Portal.store.Examples}
     */
    getCatalogStore() {
        return this.getStateProvider().getStore('catalog')
    }
}

export default Neo.setupClass(ExamplesTabContainer);
