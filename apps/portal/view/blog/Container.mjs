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
         * @member {String[]} cls=['portal-blog-container']
         */
        cls: ['portal-blog-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module: BaseContainer,
            cls   : ['portal-blog-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'stretch'},

            items: [{
                module         : SearchField,
                cls            : ['portal-blog-searchfield'],
                listeners      : {change: 'onBlogSearchFieldChange'},
                placeholderText: 'Filter Blog Items',
                width          : 240
            }]
        }, {
            module   : List,
            flex     : 1,
            reference: 'blog-list'
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }
}

Neo.setupClass(Container);

export default Container;
