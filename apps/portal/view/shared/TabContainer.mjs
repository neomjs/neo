import Container   from '../../../../src/tab/Container.mjs';
import TabOverflow from '../../../../src/tab/plugin/Overflow.mjs';

/**
 * @summary The portal's section tab container (news, examples): a left-docked tab bar whose headers that exceed
 * the bar's height collapse behind one overflow control, so every tab stays reachable on a short viewport.
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
         * The header toolbar of every section. `Neo.tab.plugin.Overflow` measures the bar's height on a left dock.
         * @member {Object} headerToolbar
         */
        headerToolbar: {
            cls    : ['portal-shared-tab-header-toolbar', 'neo-tab-header-toolbar'],
            plugins: [{module: TabOverflow}]
        },
        /**
         * @member {String} tabBarPosition='left'
         * @reactive
         */
        tabBarPosition: 'left'
    }
}

export default Neo.setupClass(TabContainer);
