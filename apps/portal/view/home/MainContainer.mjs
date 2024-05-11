import Container from '../../../../src/container/Base.mjs';

import MainNeo   from "./parts/MainNeo.mjs";
import HelloWorld from "./parts/HelloWorld.mjs";
import CoolStuff from "./parts/CoolStuff.mjs";
import AfterMath from "./parts/AfterMath.mjs";

/**
 * @class Portal.view.home.MainContainer
 * @extends Neo.container.Base
 */
class Viewport extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.home.MainContainer'
         * @protected
         */
        className: 'Portal.view.home.MainContainer',
        /**
         * @member {String[]} cls=['newwebsite-viewport']
         */
        cls: ['newwebsite-viewport'],
        scrollable: true,

        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [
            { module: MainNeo },
            { module: HelloWorld },
            { module: CoolStuff },
            { module: AfterMath }
        ]
    }
}

Neo.setupClass(Viewport);

export default Viewport;
