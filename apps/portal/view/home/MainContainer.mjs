import AfterMath  from './parts/AfterMath.mjs';
import Container  from '../../../../src/container/Base.mjs';
import CoolStuff  from './parts/CoolStuff.mjs';
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
                if (event.scrollTop > 80) {
                    this.addCls('hide-sidebar')
                } else {
                    this.removeCls('hide-sidebar')
                }
            }
        }]
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
