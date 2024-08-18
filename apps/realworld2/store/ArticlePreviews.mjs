import ArticlePreview from '../model/ArticlePreview.mjs';
import Store          from '../../../src/data/Store.mjs';

/**
 * @class RealWorld2.store.ArticlePreviews
 * @extends Neo.data.Store
 */
class ArticlePreviews extends Store {
    static config = {
        className: 'RealWorld2.store.ArticlePreviews',

        keyProperty: 'slug',
        model      : ArticlePreview
    }
}

export default Neo.setupClass(ArticlePreviews);
