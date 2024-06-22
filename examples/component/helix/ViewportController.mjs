import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.component.helix.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.helix.ViewportController'
         * @protected
         */
        className: 'Neo.examples.component.helix.ViewportController'
    }
}

Neo.setupClass(ViewportController);

export default ViewportController;
