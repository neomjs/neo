import AttributionComponent           from './AttributionComponent.mjs';
import FooterContainer                from './FooterContainer.mjs';
import GalleryContainer               from './GalleryContainer.mjs';
import HeaderContainer                from './HeaderContainer.mjs';
import HelixContainer                 from './HelixContainer.mjs';
import MainContainerController        from './MainContainerController.mjs';
import {default as MapboxGlContainer} from './mapboxGl/Container.mjs';
import {default as TabContainer}      from '../../../src/tab/Container.mjs';
import TableContainer                 from './TableContainer.mjs';
import Viewport                       from '../../../src/container/Viewport.mjs';
import WorldMapContainer              from './WorldMapContainer.mjs';

/**
 * @class SharedCovid.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='SharedCovid.view.MainContainer'
         * @protected
         */
        className: 'SharedCovid.view.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Array} cls=['covid-viewport', 'neo-viewport']
         */
        cls: ['covid-viewport', 'neo-viewport'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Array} items
         */
        items: [HeaderContainer, {
            module   : TabContainer,
            flex     : 1,
            reference: 'tab-container',
            style    : {margin: '10px', marginTop: 0},

            items: [{
                module         : TableContainer,
                reference      : 'table-container',
                tabButtonConfig: {
                    iconCls: 'fa fa-table',
                    route  : 'mainview=table',
                    text   : 'Table'
                }
            }, {
                module         : MapboxGlContainer,
                reference      : 'mapbox-gl-container',
                tabButtonConfig: {
                    iconCls: 'fa fa-globe-americas',
                    route  : 'mainview=mapboxglmap',
                    text   : 'Mapbox GL Map'
                }
            }, {
                module         : WorldMapContainer,
                tabButtonConfig: {
                    iconCls: 'fa fa-globe-americas',
                    route  : 'mainview=worldmap',
                    text   : 'World Map'
                }
            }, {
                module         : GalleryContainer,
                reference      : 'gallery-container',
                tabButtonConfig: {
                    iconCls: 'fa fa-images',
                    route  : 'mainview=gallery',
                    text   : 'Gallery'
                }
            }, {
                module         : HelixContainer,
                reference      : 'helix-container',
                tabButtonConfig: {
                    iconCls: 'fa fa-dna',
                    route  : 'mainview=helix',
                    text   : 'Helix'
                }
            }, {
                module         : AttributionComponent,
                reference      : 'attribution',
                tabButtonConfig: {
                    iconCls: 'fa fa-copyright',
                    route  : 'mainview=attribution',
                    text   : 'Attribution'
                }
            }]
        }, FooterContainer],
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};