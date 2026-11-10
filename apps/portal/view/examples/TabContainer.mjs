import ExampleStore           from '../../store/Examples.mjs';
import List                   from './List.mjs';
import TabContainer           from '../shared/TabContainer.mjs';
import TabContainerController from './TabContainerController.mjs';

/**
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
         * @member {Boolean} sortable=true
         * @reactive
         */
        dragResortable: true,
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module: List,
            store : {module: ExampleStore, url: '../../apps/portal/resources/data/examples.json'}
        },
        /**
         * Items are listed in the intended top-to-bottom display order for the left-docked tab bar.
         * @member {Object[]} items
         */
        items: [{
            catalogMode: 'dist_prod',
            environment: 'dist/production',
            reference  : 'examples-dist-prod-list',
            header     : {
                iconCls: 'fa fa-chess-king',
                route  : '/examples/dist_prod',
                text   : 'dist/prod'
            }
        }, {
            catalogMode: 'dist_esm',
            environment: 'dist/production',
            reference  : 'examples-dist-esm-list',
            header     : {
                iconCls: 'fa fa-chess-queen',
                route  : '/examples/dist_esm',
                text   : 'dist/esm'
            }
        }, {
            catalogMode: 'dist_dev',
            environment: 'dist/development',
            reference  : 'examples-dist-dev-list',
            header     : {
                iconCls: 'fa fa-chess-bishop',
                route  : '/examples/dist_dev',
                text   : 'dist/dev'
            }
        }, {
            reference: 'examples-devmode-list',
            header   : {
                iconCls: 'fa fa-chess-knight',
                route  : '/examples/devmode',
                text   : 'Dev Mode'
            }
        }, {
            catalogMode: 'dist_prod',
            cls        : ['portal-examples-grid-overview'],
            environment: 'dist/production',
            reference  : 'examples-grid-list',
            store      : {
                module : ExampleStore,
                url    : '../../apps/portal/resources/data/examples.json',
                filters: [{property: 'family', operator: '===', value: 'grid-table'}]
            },
            header: {
                iconCls: 'fa fa-table',
                route  : '/examples/grid',
                text   : 'Grid & Table'
            }
        }]
    }
}

export default Neo.setupClass(ExamplesTabContainer);
