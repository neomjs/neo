import BaseViewport       from '../../../src/container/Viewport.mjs';
import Component          from '../../../src/component/Base.mjs';
import Container          from '../../../src/container/Base.mjs';
import Dashboard          from '../../../src/dashboard/Container.mjs';
import KpiTile            from './KpiTile.mjs';
import {KPIS}             from './kpis.mjs';
import ThemeSwitcher      from '../../../src/button/ThemeSwitcher.mjs';
import ViewportController from './ViewportController.mjs';

/**
 * Where a window can open, a tile dragged out of the dashboard opens in one; a touch device keeps it in the page.
 * @type {Boolean}
 */
const canOpenWindows = !Neo.config.hasTouchEvents;

/**
 * @summary A live store dashboard of six key figures in a `Neo.dashboard.Container`. Drag a tile by its title to
 * reorder the board; drag it out of the window and it opens in a window of its own, still live, and dragged back it
 * returns to its slot. The detached tile opens the `childapps/widget` shell, which shares this App worker.
 * @class Neo.examples.dashboard.sortable.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.sortable.Viewport'
         * @protected
         */
        className: 'Neo.examples.dashboard.sortable.Viewport',
        /**
         * @member {String[]} cls=['sortable-dashboard-viewport']
         * @reactive
         */
        cls: ['sortable-dashboard-viewport'],
        /**
         * @member {Neo.controller.Component} controller=ViewportController
         * @reactive
         */
        controller: ViewportController,
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['sortable-header'],
            flex  : 'none',
            layout: {ntype: 'flexbox', align: 'center', direction: 'row', pack: 'start', wrap: 'wrap'},

            items: [{
                module: Component,
                cls   : ['sortable-title'],
                tag   : 'h1',
                text  : 'Store operations, live'
            }, {
                module: Component,
                cls   : ['sortable-hint'],
                flex  : 1,
                text  : canOpenWindows
                    ? 'Drag a tile by its title to reorder the board, or out of the window.'
                    : 'Drag a tile by its title to reorder the board.'
            }, {
                module: ThemeSwitcher
            }]
        }, {
            module           : Dashboard,
            cls              : ['sortable-board'],
            detachToNewWindow: canOpenWindows,
            dragProxyExtraCls: ['sortable-drag-proxy'],
            flex             : 1,
            layout           : {ntype: 'vbox', align: 'stretch'},
            popupUrl         : tile => {
                const {environment} = Neo.config,
                      folder        = environment === 'development' ? '' : environment + '/';

                return `${folder}examples/dashboard/sortable/childapps/widget/index.html?theme=${tile.getTheme()}`
            },
            reference        : 'dashboard',

            items: KPIS.map(kpi => ({
                module       : KpiTile,
                canOpenWindow: canOpenWindows,
                flex         : 1,
                kpiId        : kpi.id,
                label        : kpi.label,
                reference    : `tile-${kpi.id}`
            }))
        }]
    }
}

export default Neo.setupClass(Viewport);
