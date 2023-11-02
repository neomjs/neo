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
     * @param {Object} data
     */
    async onContentListLeafClick(data) {
        const
            me      = this,
            content = me.getReference('content');

        content.html = data.html;

        await this.timeout(200);

        // todo: we need to add the links as neo configs
        await Neo.main.addon.HighlightJS.loadLibrary({
            appName        : me.appName,
            highlightJsPath: '../../docs/resources/highlight/highlight.pack.js',
            themePath      : '../../docs/resources/highlightjs-custom-github-theme.css'
        });

        await this.timeout(200);

        Neo.main.addon.HighlightJS.syntaxHighlightInit({
            appName: me.appName,
            vnodeId: content.id
        })

        // contentContainer.removeAll();
        // contentContainer.add({
        //     ntype: 'component',
        //     html: data.html
        // });
        // contentContainer.layout.activeIndex = 0;
    }

    get contentPath() {
        return `../../../resources/data/${this.deck}`;
    }

}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
