import Base from '../../../src/container/Base.mjs';

/**
 * @class Route.view.CenterContainer
 * @extends Neo.container.Base
 */
class CenterContainer extends Base {
    static config = {
        /**
         * @member {String} className='Route.view.CenterContainer'
         * @protected
         */
        className: 'Route.view.CenterContainer',
        baseCls: ['route_center', 'neo-container'],

        /**
         * @member {Object[]} items
         */
        items: [
            {module: () => import('./center/CardContact.mjs')},
            {module: () => import('./center/CardAdministration.mjs')},
            {module: () => import('./center/CardSection1.mjs')},
            {module: () => import('./center/CardSection2.mjs')},
            {module: () => import('./center/CardHome.mjs')},
            {module: () => import('./center/CardAdministrationDenied.mjs')},
        ],

        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'card', align: 'stretch', activeIndex: 4},
        }
}

Neo.setupClass(CenterContainer);

export default CenterContainer;
