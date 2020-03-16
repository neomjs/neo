import GalleryContainer          from './GalleryContainer.mjs';
import HelixContainer            from './HelixContainer.mjs';
import MainContainerController   from './MainContainerController.mjs';
import {default as TabContainer} from '../../../src/tab/Container.mjs';
import TableContainer            from './country/TableContainer.mjs';
import Viewport                  from '../../../src/container/Viewport.mjs';

/**
 * @class Covid.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.MainContainer'
         * @private
         */
        className: 'Covid.view.MainContainer',

        autoMount : true,
        controller: MainContainerController,
        layout    : {ntype: 'vbox', align: 'stretch'},

        items: [{
            ntype : 'component', // todo: HeaderComponent,
            height: 70,
            html  : 'COVID-19 neo.mjs App',
            style : {padding: '20px'}
        }, {
            module: TabContainer,
            activeIndex: 2, // todo: remove, just for testing
            flex  : 1,
            style : {margin: '20px'},

            items: [{
                module   : TableContainer,
                reference: 'table',

                tabButtonConfig: {
                    iconCls: 'fa fa-table',
                    text   : 'Table'
                }
            }, {
                module: GalleryContainer,

                tabButtonConfig: {
                    iconCls: 'fa fa-images',
                    text   : 'Gallery'
                }
            }, {
                module: HelixContainer,

                tabButtonConfig: {
                    iconCls: 'fa fa-dna',
                    text   : 'Helix'
                }
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};