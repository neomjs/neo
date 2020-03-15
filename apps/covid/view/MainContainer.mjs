import {default as Component}    from '../../../src/component/Base.mjs';
import CountryGallery            from './CountryGallery.mjs';
import CountryHelix              from './CountryHelix.mjs';
import MainContainerController   from './MainContainerController.mjs';
import {default as TabContainer} from '../../../src/tab/Container.mjs';
import Viewport                  from '../../../src/container/Viewport.mjs';

/**
 * @class Covid.view.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'Covid.view.MainContainer',
        ntype    : 'main-container',

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
            flex  : 1,
            style : {margin: '20px'},

            items: [{
                module: CountryGallery,

                tabButtonConfig: {
                    iconCls: 'fa fa-images',
                    text   : 'Gallery'
                }
            }, {
                module: CountryHelix,

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