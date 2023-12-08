import BaseContainer from '../../../../src/container/Base.mjs';
import List          from './List.mjs';
import SearchField   from '../../../../src/form/field/Search.mjs';

/**
 * @class Portal.view.blog.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.blog.Container'
         * @protected
         */
        className: 'Portal.view.blog.Container',
        /**
         * @member {String[]} baseCls=['website-blog-container','neo-container']
         */
        baseCls: ['website-blog-container', 'neo-container'],
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
                listeners      : {change: 'onBlogSearchFieldChange'},
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
    }
}

Neo.applyClassConfig(Container);

export default Container;
