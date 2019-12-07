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
        className: 'RealWorld2.view.article.PreviewList'
    }}
}

Neo.applyClassConfig(PreviewList);

export {PreviewList as default};