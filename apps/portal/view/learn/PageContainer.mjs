import Container   from '../../../../src/container/Base.mjs';
import ContentView from './ContentView.mjs';
import Toolbar     from '../../../../src/toolbar/Base.mjs';

/**
 * @class Portal.view.learn.PageContainer
 * @extends Neo.container.Base
 */
class PageContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.PageContainer'
         * @protected
         */
        className: 'Portal.view.learn.PageContainer',
        /**
         * @member {String[]} baseCls=['learn-content-container','neo-container']
         * @protected
         */
        baseCls: ['learn-content-container', 'neo-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : ContentView,
            reference: 'content',
            listeners: {
                edit   : 'onContentEdit',
                refresh: 'onContentRefresh'
            }
        }, {
            module: Toolbar,
            items : [{
                text: 'Previous Page'
            }, '->', {
                text: 'Next Page'
            }]
        }]
    }
}

Neo.setupClass(PageContainer);

export default PageContainer;
