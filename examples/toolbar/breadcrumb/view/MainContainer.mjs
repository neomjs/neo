import BreadcrumbToolbar from '../../../../src/toolbar/Breadcrumb.mjs';
import Store             from '../../../../src/data/Store.mjs';
import Viewport          from '../../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.toolbar.breadcrumb.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.toolbar.breadcrumb.view.MainContainer'
         * @protected
         */
        className: 'Neo.examples.toolbar.breadcrumb.view.MainContainer',
        /**
         * @member {Object[]} items
         */
        items: [{
            module: BreadcrumbToolbar,
            flex  : 'none',

            store: {
                module: Store,

                model: {
                    fields: [{
                        name: 'id',
                        type: 'Integer'
                    }, {
                        name: 'name',
                        type: 'String'
                    }, {
                        name: 'parentId',
                        type: 'Integer'
                    }, {
                        name: 'route',
                        type: 'String'
                    }]
                }
            }
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'}
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
