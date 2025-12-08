import BaseViewport       from '../../../src/container/Viewport.mjs';
import Container          from '../../../src/tree/List.mjs';
import TreeList           from '../../../src/tree/List.mjs';
import FileStore          from '../store/Files.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class Legit.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Legit.view.Viewport'
         * @protected
         */
        className: 'Legit.view.Viewport',
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController,
        /**
         * @member {String} legitApiKey=null
         */
        legitApiKey: null,
        /*
         * @member {Object} layout={ntype:'hbox', align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},

        /**
         * @member {Object[]} items
         */
        items: [{
            module: TreeList,
            store : FileStore
        }, {

        }]
    }
}

export default Neo.setupClass(Viewport);
