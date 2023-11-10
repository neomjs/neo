import Controller from '../../../../src/controller/Component.mjs';

/**
 * @class LearnNeo.view.home.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='LearnNeo.view.home.MainContainerController'
         * @protected
         */
        className: 'LearnNeo.view.home.MainContainerController'
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        Neo.Main.getByPath({path: 'location.search'})
            .then(data => {
                const searchString = data?.substr(1) || '';
                const search = searchString ? JSON.parse(`{"${decodeURI(searchString.replace(/&/g, "\",\"").replace(/=/g, "\":\""))}"}`) : {};
                this.getModel().setData('deck', search.deck || 'learnneo');
            });

        fetch('../../../../resources/data/deck/EditorConfig.json')
            .then(response => response.json()
            .then(data =>
                this.getModel().setData('editorConfig', data)
            ))
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onContentChange(data) {
        let me      = this,
            content = me.getReference('content');

        content.toggleCls('lab', data.isLab);

        content.html   = data.html;
        content.record = data.record;

        await me.timeout(200);

        // todo: we need to add the links as neo configs
        await Neo.main.addon.HighlightJS.loadLibrary({
            appName        : me.appName,
            highlightJsPath: '../../docs/resources/highlight/highlight.pack.js',
            themePath      : '../../docs/resources/highlightjs-custom-github-theme.css'
        });

        await me.timeout(200);

        Neo.main.addon.HighlightJS.syntaxHighlightInit({
            appName: me.appName,
            vnodeId: content.id
        })
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onContentEdit(data) {
        const vm = this.getModel();
        console.log(data);
        const editorConfig = vm.getData('editorConfig');
        const subDir = vm.getData('deck')
        if (!editorConfig || !subDir) return;

        const filePath = `${editorConfig.root}/${subDir}/p/${data.record.id}.md`;

        await fetch('http://localhost:3000/openInEditor', {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({path: filePath, editor: editorConfig.editor})
        })
    }

    /**
     * @param {Object} data
     */
    onContentRefresh(data) {
        this.getReference('tree').doFetchContent(data.record)
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
