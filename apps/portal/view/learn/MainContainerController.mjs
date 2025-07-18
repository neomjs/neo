import Controller        from '../../../../src/controller/Component.mjs';
import CubeLayoutButton  from './CubeLayoutButton.mjs'; // required for the Portal App .md file
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
            '/learn'          : 'onRouteDefault',
            '/learn/{*itemId}': 'onRouteLearnItem'
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
            this.setState({
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
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onContentEdit(data) {
        const vm = this.getStateProvider();
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
        this.navigateTo(this.getStateProvider().getData('nextPageRecord').id)
    }

    /**
     * @param {Object} data
     */
    onPageSectionsToggleButtonClick(data) {
        this.getReference('page-sections-container').toggleCls('neo-expanded')
    }

    /**
     * @param {Object} data
     */
    onPreviousPageButtonClick(data) {
        this.navigateTo(this.getStateProvider().getData('previousPageRecord').id)
    }

    /**
     * @param {Object} data
     */
    onRouteDefault(data) {
        if (!this.getStateProvider().data.currentPageRecord) {
            this.onRouteLearnItem({itemId: 'benefits/Introduction'})
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.itemId
     */
    onRouteLearnItem({itemId}) {
        let stateProvider = this.getStateProvider(),
            store         = stateProvider.getStore('contentTree');

        if (store.getCount() > 0) {
            stateProvider.data.currentPageRecord = store.get(itemId)
        } else {
            store.on({
                load : () => {stateProvider.data.currentPageRecord = store.get(itemId)},
                delay: 10,
                once : true
            })
        }
    }

    /**
     * @param {Object} data
     */
    onSideNavToggleButtonClick(data) {
        this.getReference('sidenav-container').toggleCls('neo-expanded')
    }
}

export default Neo.setupClass(MainContainerController);
