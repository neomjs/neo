import Component from '../../../../src/controller/Component.mjs';

/**
 * @class LearnNeo.view.home.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static config = {
        /**
         * @member {String} className='LearnNeo.view.home.MainContainerController'
         * @protected
         */
        className: 'LearnNeo.view.home.MainContainerController'
    }

    /**
     * @param {Object} record
     */
    onContentListLeafClick(record) {
        let contentContainer = this.getReference('content-container');

        console.log('onContentListLeafClick', {contentContainer, record});
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
