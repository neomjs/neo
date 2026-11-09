import BaseContainer from '../../../../../src/container/Base.mjs';
import List          from './List.mjs';
import SearchField   from '../../../../../src/form/field/Search.mjs';

/**
 * @summary The news section's Videos tab: a search field over the list of films.
 * @class Portal.view.news.videos.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Portal.view.news.videos.Container'
         * @protected
         */
        className: 'Portal.view.news.videos.Container',
        /**
         * @member {String[]} cls=['portal-videos-container']
         * @reactive
         */
        cls: ['portal-videos-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module: BaseContainer,
            cls   : ['portal-videos-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'stretch'},

            items: [{
                module         : SearchField,
                cls            : ['portal-videos-searchfield'],
                listeners      : {change: 'up.onSearchFieldChange'},
                placeholderText: 'Filter Videos',
                width          : 240
            }]
        }, {
            module   : List,
            flex     : 1,
            reference: 'videos-list'
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * Filters the films by title
     * @param {Object} data
     * @param {String|null} data.value
     */
    onSearchFieldChange(data) {
        this.getReference('videos-list').store.getFilter('name').value = data.value || null
    }
}

export default Neo.setupClass(Container);
