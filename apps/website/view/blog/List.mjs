import {default as BaseList} from '../../../../src/list/Base.mjs';

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
        className: 'Website.view.blog.List'
    }}
}

Neo.applyClassConfig(List);

export {List as default};