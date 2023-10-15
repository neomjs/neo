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
    async onContentListLeafClick(record) {
        const
            contentContainer = this.getReference('content-container'),
            path             = '../../../resources/data/learnneo/pages';

        console.log('onContentListLeafClick', {contentContainer, record});
        console.log('onContentListLeafClick', {contentContainer, record});

        if (record.isLeaf && record.path) {
            const data    = await fetch(`${path}/${record.path}`);
            const content = await data.text();

            contentContainer.removeAll();

            await this.timeout(50);

            contentContainer.add({
                ntype: 'component',
                html : content
            });

            await this.timeout(50);


            contentContainer.layout.activeIndex = 0;
        }
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
