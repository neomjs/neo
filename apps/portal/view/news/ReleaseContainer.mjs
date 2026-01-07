import Container from '../../../../src/container/Base.mjs';

/**
 * @class Portal.view.news.ReleaseContainer
 * @extends Neo.container.Base
 */
class ReleaseContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.news.ReleaseContainer'
         * @protected
         */
        className: 'Portal.view.news.ReleaseContainer',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype: 'component',
            style: {margin: '20px'},
            html : 'Release Notes Placeholder'
        }]
    }
}

export default Neo.setupClass(ReleaseContainer);
