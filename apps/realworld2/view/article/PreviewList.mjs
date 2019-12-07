import ArticlePreviews   from '../../store/ArticlePreviews.mjs'
import {default as List} from '../../../../src/list/Base.mjs';

/**
 * @class RealWorld2.view.article.PreviewList
 * @extends Neo.list.Base
 */
class PreviewList extends List {
    static getConfig() {return {
        /**
         * @member {String} className='RealWorld2.view.article.PreviewList'
         * @private
         */
        className: 'RealWorld2.view.article.PreviewList',
        /**
         * @member {String} displayField='title'
         */
        displayField: 'title',
        /**
         * @member {Neo.data.Store} store=ArticlePreviews
         */
        store: ArticlePreviews
    }}
}

Neo.applyClassConfig(PreviewList);

export {PreviewList as default};