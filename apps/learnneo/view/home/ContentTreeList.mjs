import ContentStore from '../../store/Content.mjs'
import TreeList     from '../../../../src/tree/List.mjs';

/**
 * @class LearnNeo.view.home.ContentTreeList
 * @extends Neo.container.Base
 */
class ContentTreeList extends TreeList {
    static config = {
        /**
         * @member {String} className='LearnNeo.view.home.ContentTreeList'
         * @protected
         */
        className: 'LearnNeo.view.home.ContentTreeList',
        /**
         * @member {Neo.data.Store} store=ContentStore
         */
        store: ContentStore
    }

    /**
     * todo: createItems() should get triggered onStoreLoad()
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        Neo.Xhr.promiseJson({
            url: '../../../resources/learnneo/content.json'
        }).then(data => {
            me.store.data = data.json.data;
            me.createItems(null, me.getListItemsRoot(), 0);
            me.update();
        })
    }
}

Neo.applyClassConfig(ContentTreeList);

export default ContentTreeList;
