import Component from '../../../src/model/Component.mjs';

/**
 * @class Portal.view.ViewportModel
 * @extends Neo.model.Component
 */
class ViewportModel extends Component {
    static config = {
        /**
         * @member {String} className='Portal.view.ViewportModel'
         * @protected
         */
        className: 'Portal.view.ViewportModel',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * Values are: large, medium, small, xSmall, null
             * @member {String|null} size
             */
            size: null
        }
    }
}

export default Neo.setupClass(ViewportModel);
