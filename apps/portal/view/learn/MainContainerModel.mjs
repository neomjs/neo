import Component           from '../../../../src/model/Component.mjs';
import ContentSectionStore from '../../store/ContentSections.mjs';
import ContentStore        from '../../store/Content.mjs';

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
        data: {
            /**
             * @member {Number|null} data.selectedPageRecordId=null
             */
            selectedPageRecordId: null
        },
        /**
         * @member {Object} stores
         */
        stores: {
            contentSections: {
                module: ContentSectionStore
            },
            tree: {
                module      : ContentStore,
                responseRoot: 'data'
            }
        }
    }
}

Neo.setupClass(MainContainerModel);

export default MainContainerModel;
