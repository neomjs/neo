import Controller        from '../../../../src/controller/Component.mjs';
import {getSearchParams} from '../../Util.mjs';

/**
 * @class Portal.view.learn.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.MainContainerController'
         * @protected
         */
        className: 'Portal.view.learn.MainContainerController',
        /**
         * @member {Object} routes
         */
        routes: {
            '/learn'         : 'onRouteDefault',
            '/learn/{itemId}': 'onRouteLearnItem'
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let {windowId} = this;

        Neo.Main.getByPath({
            path: 'location.search',
            windowId
        }).then(data => {
            this.getModel().setData({
                deck: getSearchParams(data).deck || 'learnneo'
            })
        })
    }

    /**
     * @param {String} learnItem
     */
    navigateTo(learnItem) {
        Neo.Main.setRoute({
            value   : `/learn/${learnItem}`,
            windowId: this.component.windowId
        })
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        Neo.Main.getByPath({path: 'location.search'})
            .then(data => {
                me.getModel().setData({
                    deck: getSearchParams(data).deck || 'learnneo'
                });
            });

        // todo: target file does not exist inside the repo
        /*fetch('../../../../resources/data/deck/EditorConfig.json')
            .then(response => response.json()
                .then(data =>
                    me.getModel().setData('editorConfig', data)
                ))*/
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

        const filePath = `${editorConfig.root}/${subDir}/pages/${data.record.id}.md`;

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

    /**
     * @param {Object} data
     */
    onIntersect(data) {
        let panel    = this.getReference('page-sections-container'),
            list     = panel.list,
            recordId = parseInt(data.data.recordId);

        if (!list.isAnimating) {
            list.selectionModel.select(list.store.get(recordId))
        }
    }

    /**
     * @param {Object} data
     */
    onNextPageButtonClick(data) {
        this.navigateTo(this.getModel().getData('nextPageRecord').id)
    }

    /**
     * @param {Object} data
     */
    onPreviousPageButtonClick(data) {
        this.navigateTo(this.getModel().getData('previousPageRecord').id)
    }

    /**
     * @param {Object} data
     */
    onRouteDefault(data) {
        if (!this.getModel().data.currentPageRecord) {
            this.onRouteLearnItem({itemId: 'WhyNeo-Intro'})
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.itemId
     */
    onRouteLearnItem(data) {
        let model = this.getModel(),
            store = model.getStore('contentTree');

        if (store.getCount() > 0) {
            model.data.currentPageRecord = store.get(data.itemId)
        } else {
            store.on({
                load : () => {model.data.currentPageRecord = store.get(data.itemId)},
                delay: 10,
                once : true
            })
        }
    }
}

Neo.setupClass(MainContainerController);

export default MainContainerController;
