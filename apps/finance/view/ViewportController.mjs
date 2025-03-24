import Component from '../../../src/controller/Component.mjs';

/**
 * @class Finance.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Component {
    static config = {
        /**
         * @member {String} className='Finance.view.ViewportController'
         * @protected
         */
        className: 'Finance.view.ViewportController'
    }

    /**
     *
     */
    onCompaniesStoreLoad() {
        console.log('onCompaniesStoreLoad');
    }
}

export default Neo.setupClass(ViewportController);
