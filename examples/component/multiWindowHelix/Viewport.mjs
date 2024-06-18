import MainContainer      from '../helix/MainContainer.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * @class Neo.examples.component.multiWindowHelix.Viewport
 * @extends Neo.examples.component.helix.MainContainer
 */
class Viewport extends MainContainer {
    static config = {
        className: 'Neo.examples.component.multiWindowHelix.Viewport',
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         */
        controller: ViewportController
    }
}

Neo.setupClass(Viewport);

export default Viewport;
