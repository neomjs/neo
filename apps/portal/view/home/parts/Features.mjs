import Container  from '../../../../../src/container/Base.mjs';
import ContentBox from '../ContentBox.mjs';

/**
 * @class Portal.view.home.parts.Features
 * @extends Neo.container.Base
 */
class Features extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.home.parts.Features'
         * @protected
         */
        className: 'Portal.view.home.parts.Features',
        /**
         * @member {String[]} cls=['portal-home-features','page']
         */
        cls: ['portal-home-features', 'page'],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch',wrap:'wrap'}
         */
        layout: {ntype: 'hbox', align: 'stretch', wrap: 'wrap'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: ContentBox,
            header: 'Next-Generation Runtime',
            route : '#/learn/WhyNeo-Quick',

            content: [
                'Multi-threaded',
                'Elegant state management',
                'Simple and powerful debugging'
            ]
        }, {
            module: ContentBox,
            header: 'Extreme Speed',
            route : '#/learn/WhyNeo-Speed',

            content: [
                'Multi-threaded',
                'Over 40,000 delta updates per second',
                'Item 3'
            ]
        }]
    }
}

Neo.setupClass(Features);

export default Features;
