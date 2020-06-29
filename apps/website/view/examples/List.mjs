import {default as BaseList} from '../../../../src/list/Base.mjs';
import BlogPosts             from '../../store/BlogPosts.mjs';

/**
 * @class Website.view.examples.List
 * @extends Neo.list.Base
 */
class List extends BaseList {
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.examples.List'
         * @protected
         */
        className: 'Website.view.examples.List',
        /**
         * @member {String[]} cls=['website-examples-list','neo-list-container','neo-list']
         */
        cls: ['website-examples-list', 'neo-list-container', 'neo-list'],
        /**
         * @member {Neo.data.Store} store=BlogPosts
         */
        store: BlogPosts
    }}

    /**
     * @param {Object} record
     */
    createItemContent(record) {
        const vdomCn = [{
            cls: ['content'],
            cn : [{
                cls  : ['neo-full-size', 'preview-image'],
                style: {
                    backgroundImage: record.image
                }
            }, {
                cls: ['neo-relative'],
                cn : [{
                    cls: ['neo-absolute', 'neo-item-bottom-position'],
                    cn : [{
                        cls : ['neo-title'],
                        html: record.name.replace(/^(.{65}[^\s]*).*/, "$1")
                    }]
                }]
            }]
        }];

        return vdomCn;
    }
}

Neo.applyClassConfig(List);

export {List as default};