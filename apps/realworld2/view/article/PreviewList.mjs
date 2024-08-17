import ArticlePreviews  from '../../store/ArticlePreviews.mjs'
import List             from '../../../../src/list/Base.mjs';
import PreviewComponent from './PreviewComponent.mjs';

/**
 * @class RealWorld2.view.article.PreviewList
 * @extends Neo.list.Base
 */
class PreviewList extends List {
    static config = {
        /**
         * @member {String} className='RealWorld2.view.article.PreviewList'
         * @protected
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
    }

    /**
     * @param {Boolean} [silent=false]
     */
    createItems(silent=false) {
        let me = this,
            listItem;

        me.vdom.cn = [];

        me.store.items.forEach(item => {
            listItem = Neo.create({
                module  : PreviewComponent,
                parentId: me.id,
                ...item,
                author   : item.author.username, // todo: PreviewComponent should use an author object
                userImage: item.author.image
            });

            me.vdom.cn.push(listItem.vdom);
        });

        if (!silent) {
            me.promiseUpdate().then(() => {
                me.fire('createItems');
            });
        }
    }
}

export default Neo.setupClass(PreviewList);
