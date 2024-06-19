import AfterMath  from './parts/AfterMath.mjs';
import Container  from '../../../../src/container/Base.mjs';
import CoolStuff  from './parts/CoolStuff.mjs';
import Features   from './parts/Features.mjs';
import HelloWorld from './parts/HelloWorld.mjs';
import MainNeo    from './parts/MainNeo.mjs';

/**
 * @class Portal.view.home.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.home.MainContainer'
         * @protected
         */
        className: 'Portal.view.home.MainContainer',
        /**
         * @member {String[]} cls=['portal-home-maincontainer']
         */
        cls: ['portal-home-maincontainer'],
        /**
         * @member {Object[]} items
         */
        items: [
            {
                ntype: 'component',
                id   : 'progress'
            },
            MainNeo,
            Features,
            HelloWorld,
            CoolStuff,
            AfterMath
        ],
        /**
         * @member {Boolean} scrollable=true
         */
        scrollable: true,

        domListeners: [{
            scroll(event) {
                this.toggleCls('hide-sidebar', event.scrollTop > 80)
            }
        }]
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
