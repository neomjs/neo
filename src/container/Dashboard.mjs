import Container from './Base.mjs';

/**
 * @class Neo.container.Dashboard
 * @extends Neo.container.Base
 */
class Dashboard extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.container.Dashboard'
         * @protected
         */
        className: 'Neo.container.Dashboard',
        /**
         * @member {String} ntype='dashboard'
         * @protected
         */
        ntype: 'dashboard'
    }}
}

Neo.applyClassConfig(Dashboard);

export default Dashboard;
