import FooterContainer            from './FooterContainer.mjs';
import HeaderContainer            from './HeaderContainer.mjs';
import MainContainerController    from './MainContainerController.mjs';
import MainContainerStateProvider from './MainContainerStateProvider.mjs';
import TabContainer               from '../../../src/tab/Container.mjs';
import Viewport                   from '../../../src/container/Viewport.mjs';

/**
 * @class SharedCovid.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='SharedCovid.view.MainContainer'
         * @protected
         */
        className: 'SharedCovid.view.MainContainer',
        /**
         * @member {String[]} baseCls=['covid-viewport','neo-viewport']
         */
        baseCls: ['covid-viewport', 'neo-viewport'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * @member {Object[]} items
         */
        items: [HeaderContainer, {
            module              : TabContainer,
            activateInsertedTabs: true,
            activeIndex         : null, // render no items initially
            flex                : 1,
            reference           : 'tab-container',
            sortable            : true,
            style               : {margin: '10px', marginTop: 0},

            items: [{
                module   : () => import('./TableContainer.mjs'),
                reference: 'table-container',
                header   : {
                    iconCls: 'fa fa-table',
                    route  : 'mainview=table',
                    text   : 'Table'
                }
            }, {
                module   : () => import('./mapboxGl/Container.mjs'),
                reference: 'mapbox-gl-container',
                header   : {
                    iconCls: 'fa fa-globe-americas',
                    route  : 'mainview=mapboxglmap',
                    text   : 'Mapbox GL Map'
                }
            }, {
                module: () => import('./WorldMapContainer.mjs'),
                header: {
                    iconCls: 'fa fa-globe-americas',
                    route  : 'mainview=worldmap',
                    text   : 'World Map'
                }
            }, {
                module   : () => import('./GalleryContainer.mjs'),
                reference: 'gallery-container',
                header   : {
                    iconCls: 'fa fa-images',
                    route  : 'mainview=gallery',
                    text   : 'Gallery'
                }
            }, {
                module   : () => import('./HelixContainer.mjs'),
                reference: 'helix-container',
                header   : {
                    iconCls: 'fa fa-dna',
                    route  : 'mainview=helix',
                    text   : 'Helix'
                }
            }, {
                module   : () => import('./AttributionComponent.mjs'),
                reference: 'attribution',
                header   : {
                    iconCls: 'fa fa-copyright',
                    route  : 'mainview=attribution',
                    text   : 'Attribution'
                }
            }]
        }, FooterContainer],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Neo.state.Provider} stateProvider=MainContainerStateProvider
         * @reactive
         */
        stateProvider: MainContainerStateProvider
    }
}

export default Neo.setupClass(MainContainer);
