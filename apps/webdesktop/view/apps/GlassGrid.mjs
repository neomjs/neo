import GridContainer from '../../../../src/grid/Container.mjs';

/**
 * @summary The engine's grid on an app window's glass: its stylesheet sets the grid's own CSS variables from the
 * window's tokens, so the apps' grids share one look and no rule competes with the grid's rules.
 * @class WebDesktop.view.apps.GlassGrid
 * @extends Neo.grid.Container
 */
class GlassGrid extends GridContainer {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.GlassGrid'
         * @protected
         */
        className: 'WebDesktop.view.apps.GlassGrid',
        /**
         * @member {String[]} baseCls=['webdesktop-glass-grid','neo-grid-container']
         * @protected
         */
        baseCls: ['webdesktop-glass-grid', 'neo-grid-container']
    }
}

export default Neo.setupClass(GlassGrid);
