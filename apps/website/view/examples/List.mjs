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
        store: Examples,
        /**
         * @member {String|null} storeUrl_=null
         */
        storeUrl_: null
    }}

    /**
     * Triggered before the store config gets changed.
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        if (value) {
            if (value.isClass) {
                value = {
                    module: value,
                    url   : this.storeUrl
                };
            } else if (Neo.isObject(value)) {
                value.url = this.storeUrl;
            }
        }

        return super.beforeSetStore(value, oldValue);
    }

    /**
     * @param {Object} record
     */
    createItemContent(record) {
        return [{
            cls: ['content'],
            cn : [{
                cls  : ['neo-full-size', 'preview-image'],
                style: {
                    backgroundColor: record.backgroundColor,
                    backgroundImage: `url('${record.image}')`
                }
            }, {
                cls: ['neo-relative'],
                cn : [{
                    cls: ['neo-absolute', 'neo-item-bottom-position'],
                    cn : [{
                        cls : ['neo-title'],
                        html: record.name.replace(/^(.{65}[^\s]*).*/, "$1")
                    }, {
                        cls: ['neo-inner-content', 'neo-top-20'],
                        cn : [{
                            cls : ['neo-inner-details'],
                            html: record.browsers.join(', ')
                        }, {
                            cls : ['neo-inner-details'],
                            html: record.environments.join(', ')
                        }]
                    }]
                }]
            }]
        }];
    }
}

Neo.applyClassConfig(List);

export {List as default};