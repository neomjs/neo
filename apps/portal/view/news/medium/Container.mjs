import BaseContainer from '../../../../../src/container/Base.mjs';
import List          from './List.mjs';
import SearchField   from '../../../../../src/form/field/Search.mjs';

/**
 * @class Portal.view.news.medium.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.news.medium.Container'
         * @protected
         */
        className: 'Portal.view.news.medium.Container',
        /**
         * @member {String[]} cls=['portal-medium-container']
         * @reactive
         */
        cls: ['portal-medium-container'],
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
                listeners      : {change: 'onMediumSearchFieldChange'},
                placeholderText: 'Filter Blog Items',
                width          : 240
            }]
        }, {
            module   : List,
            flex     : 1,
            reference: 'medium-list'
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }
}

export default Neo.setupClass(Container);
