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
    onContentListLeafClick(data) {
        const contentContainer = this.getReference('content-container');

        contentContainer.removeAll();
        contentContainer.add({
            ntype: 'component',
            html: data.html
        });
        contentContainer.layout.activeIndex = 0;
    }

    get contentPath() {
        return `../../../resources/data/${this.deck}`;
    }

}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
