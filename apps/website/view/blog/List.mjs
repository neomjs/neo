import {default as BaseList} from '../../../../src/list/Base.mjs';
import BlogPosts             from '../../store/BlogPosts.mjs';

/**
 * @class Website.view.blog.List
 * @extends Neo.list.Base
 */
class List extends BaseList {
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.blog.List'
         * @protected
         */
        className: 'Website.view.blog.List',
        /**
         * @member {String[]} cls=['website-blog-list','neo-list-container','neo-list']
         */
        cls: ['website-blog-list', 'neo-list-container', 'neo-list'],
        /**
         * @member {Neo.data.Store} store=BlogPosts
         */
        store: BlogPosts
    }}

    /**
     * @param {Object} record
     */
    createItemContent(record) {
        let me = this;

        return [{
            cls : ['content'],
            html: record.name
        }, {
            cls  : ['preview-image'],
            style: {
                backgroundImage: `url('https://raw.githubusercontent.com/neomjs/pages/master/resources/website/blog/${record.image}')`
            }
        }];
    }
}

Neo.applyClassConfig(List);

export {List as default};