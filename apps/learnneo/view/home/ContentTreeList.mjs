import ContentStore from '../../store/Content.mjs'
import TreeList from '../../../../src/tree/List.mjs';

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
         * @member {String[]} cls=['topics-tree']
         */
        cls: ['topics-tree'],
        /**
         * @member {Neo.data.Store} store=ContentStore
         */
        store: ContentStore
    }

    get contentPath() {
        return `../../../resources/data/${this.deck}`;
    }

    /**
     * @param {Object} record
     * @returns {Promise<void>}
     */
    async doFetchContent(record) {
        let me = this,
            path = `${me.contentPath}`;

        path += record.path ? `/pages/${record.path}` : `/p/${record.id}.md`;

        if (record.isLeaf && path) {
            const data = await fetch(path);
            const content = await data.text();

            await Neo.main.addon.Markdown.markdownToHtml(content)
                .then(
                    html => me.fire('contentChange', {component: me, html}),
                    () => me.fire('contentChange', {component: me}));
        }
    }

    /**
     *
     */
    doLoadStore() {
        const me = this;
        Neo.Xhr.promiseJson({
            url: `${this.contentPath}/t.json`
        }).then(data => {
            // TODO: Tree lists should do this themselves when their store is loaded.
            me.store.data = data.json.data;
            me.createItems(null, me.getListItemsRoot(), 0);
            me.update();
        })
    }

    /**
     * todo: createItems() should get triggered onStoreLoad()
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        Neo.Main.getByPath({path: 'location.search'})
            .then(data => {
                const searchString = data?.substr(1) || '';
                const search = searchString ? JSON.parse(`{"${decodeURI(searchString.replace(/&/g, "\",\"").replace(/=/g, "\":\""))}"}`) : {};
                me.deck = search.deck || 'learnneo';
                me.doLoadStore();
                console.log(search);
            });
    }

    /**
     * @param {Object} record
     */
    onLeafItemClick(record) {
        super.onLeafItemClick(record);
        this.doFetchContent(record);
    }
}

Neo.applyClassConfig(ContentTreeList);

export default ContentTreeList;
