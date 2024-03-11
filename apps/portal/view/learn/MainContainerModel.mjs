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
             * @member {Number|null} data.countPages=null
             */
            countPages: null,
            /**
             * @member {Number|null} data.selectedPageRecordIndex=null
             */
            selectedPageRecordIndex: null
        },
        /**
         * @member {Object} stores
         */
        stores: {
            contentSections: {
                module: ContentSectionStore
            },
            contentTree: {
                module: ContentStore
            }
        }
    }
}

Neo.setupClass(MainContainerModel);

export default MainContainerModel;
