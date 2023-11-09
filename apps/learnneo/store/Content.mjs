import ContentModel from '../model/Content.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class LearnNeo.store.Content
 * @extends Neo.data.Store
 */
class Content extends Store {
    static config = {
        /**
         * @member {String} className='LearnNeo.store.Content'
         * @protected
         */
        className: 'LearnNeo.store.Content',
        /**
         * @member {Neo.data.Model} model=ContentModel
         */
        model: ContentModel,
        // autoLoad: true


    }

    xonConstructed() {
        super.onConstructed();

        let me = this;

        // Neo.Main.getByPath({path: 'location.search'})
        //     .then(data => {
        //         const searchString = data?.substr(1) || '';
        //         const search = searchString ? JSON.parse(`{"${decodeURI(searchString.replace(/&/g, "\",\"").replace(/=/g, "\":\""))}"}`) : {};
        //         this.deck = search.deck || 'learnneo';
        //         this.url = `${this.contentPath}/tree.json`;
        //         this.load();
        //         // this.doLoadStore();
        //         console.log(search);
        //     });

    }
    xload() {
        this.model = ContentModel;
        Neo.Main.getByPath({path: 'location.search'})
            .then(data => {
                const searchString = data?.substr(1) || '';
                const search = searchString ? JSON.parse(`{"${decodeURI(searchString.replace(/&/g, "\",\"").replace(/=/g, "\":\""))}"}`) : {};
                this.deck = search.deck || 'learnneo';
                this.url = `${this.contentPath}/tree.json`;
                // this.load();
                super.load();
                console.log(search);
            });
    }

    get contentPath() {
        return `../../../resources/data/deck/${this.deck}`;
    }
    doLoadStore() {
        debugger;
        const me = this;
        Neo.Xhr.promiseJson({
            url: `${this.contentPath}/tree.json`
        }).then(data => {
            // TODO: Tree lists should do this themselves when their store is loaded.
            me.data = data.json.data;
            // me.createItems(null, me.getListItemsRoot(), 0);
            // me.update();
        })
    }
}

Neo.applyClassConfig(Content);

export default Content;
