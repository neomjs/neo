import Component from '../../../../src/model/Component.mjs';
import Store     from '../../store/Content.mjs';

/**
 * @class Portal.view.learn.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Component {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.MainContainerModel'
         * @protected
         */
        className: 'Portal.view.learn.MainContainerModel',
        /**
         * @member {Object} data
         */
        data: {},
        /**
         * @member {Object} stores
         */
        stores: {
            tree: {
                module      : Store,
                responseRoot: 'data'
            }
        }
    }
}

Neo.setupClass(MainContainerModel);

export default MainContainerModel;
