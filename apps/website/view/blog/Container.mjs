import {default as BaseContainer} from '../../../../src/container/Base.mjs';
import List                       from './List.mjs';
import {default as SearchField}   from '../../../../src/form/field/Search.mjs';

/**
 * @class Website.view.blog.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static getConfig() {return {
        /**
         * @member {String} className='Website.view.blog.Container'
         * @protected
         */
        className: 'Website.view.blog.Container',
        /**
         * @member {String[]} cls=['website-blog-container', 'neo-container']
         */
        cls: ['website-blog-container', 'neo-container'],
        /**
         * @member {Array} items
         */
        items: [{ //#323232
            module: BaseContainer,
            cls   : ['website-blog-toolbar', 'neo-container'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'stretch'},

            items: [{
                module         : SearchField,
                cls            : ['website-blog-searchfield', 'neo-searchfield', 'neo-textfield'],
                listeners      : {change: 'onSearchFieldChange'},
                placeholderText: 'Filter Items',
                width          : 240
            }]
        }, {
            module   : List,
            flex     : 1,
            reference: 'blog-list'
        }],
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }}
}

Neo.applyClassConfig(Container);

export {Container as default};