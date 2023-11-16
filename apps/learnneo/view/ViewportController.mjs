import Controller from '../../../src/controller/Component.mjs';

/**
 * @class LearnNeo.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='LearnNeo.view.ViewportController'
         * @protected
         */
        className: 'LearnNeo.view.ViewportController'
    }
}

Neo.applyClassConfig(ViewportController);

export default ViewportController;
