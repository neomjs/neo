import {default as BaseList} from '../../../../src/list/Base.mjs';
import Examples              from '../../store/Examples.mjs';

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
         * @member {Neo.data.Store} store=Examples
         */
        store: Examples
    }}

    /**
     * @param {Object} record
     */
    createItemContent(record) {
        return [{
            cls: ['content'],
            cn : [{
                cls  : ['neo-full-size', 'preview-image'],
                style: {
                    backgroundImage: `url('${record.image}')`
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
    }
}

Neo.applyClassConfig(List);

export {List as default};