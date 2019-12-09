import ArticlePreviews   from '../../store/ArticlePreviews.mjs'
import {default as List} from '../../../../src/list/Base.mjs';
import PreviewComponent  from './PreviewComponent.mjs';

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

    /**
     * @param {Boolean} [silent=false]
     */
    createItems(silent=false) {
        let me   = this,
            vdom = me.vdom,
            listItem;

        vdom.cn = [];

        me.store.items.forEach(item => {
            listItem = Neo.create({
                module: PreviewComponent,
                ...item,
                author   : item.author.username, // todo: PreviewComponent should use an author object
                userImage: item.author.image
            });

            vdom.cn.push(listItem.vdom);
        });

        if (silent) {
            me._vdom = vdom;
        } else {
            me.promiseVdomUpdate().then(() => {
                me.fire('createItems');
            });
        }
    }
}

Neo.applyClassConfig(PreviewList);

export {PreviewList as default};