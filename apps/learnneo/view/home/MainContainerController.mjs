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

    onContentChange(data) {
        const content = this.getReference('content');
        content[data.isLab ? 'addCls' : 'removeCls']('lab');
        content.html = data.html;
        content.record = data.record;
    }
    async onContentEdit(data) {
        const vm = this.getModel();
        console.log(data);
        const editorConfig = vm.getData('editorConfig');
        const subDir = vm.getData('deck')
        if (!editorConfig || !subDir) return;

        const filePath = `${editorConfig.root}/${subDir}/p/${data.record.id}.md`;
        fetch('http://localhost:3000/openInEditor', {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({path: filePath, editor: editorConfig.editor})
        });
    }

    onContentRefresh(data) {
        this.getReference('tree').doFetchContent(data.record);
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        Neo.Main.getByPath({path: 'location.search'})
            .then(data => {
                const searchString = data?.substr(1) || '';
                const search = searchString ? JSON.parse(`{"${decodeURI(searchString.replace(/&/g, "\",\"").replace(/=/g, "\":\""))}"}`) : {};
                this.getModel().setData('deck', search.deck || 'learnneo');
            });
        fetch("`../../../../resources/data/deck/EditorConfig.json")
            .then(response => response.json()
                .then(data =>
                    this.getModel().setData('editorConfig', data)
                ));

    }


}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
