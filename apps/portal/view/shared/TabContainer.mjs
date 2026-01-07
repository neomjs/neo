import Container from '../../../../src/tab/Container.mjs';

/**
 * @class Portal.view.shared.TabContainer
 * @extends Neo.tab.Container
 */
class TabContainer extends Container {
    static config = {
        /**
         * @member {String} className='Portal.view.shared.TabContainer'
         * @protected
         */
        className: 'Portal.view.shared.TabContainer',
        /**
         * @member {String[]} baseCls=['portal-shared-tab-container','neo-tab-container']
         */
        baseCls: ['portal-shared-tab-container', 'neo-tab-container'],
        /**
         * @member {String} tabBarPosition='left'
         * @reactive
         */
        tabBarPosition: 'left'
    }
}

export default Neo.setupClass(TabContainer);
