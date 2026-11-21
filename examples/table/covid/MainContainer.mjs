import Label          from '../../../src/component/Label.mjs';
import TableContainer from './TableContainer.mjs';
import ThemeSwitcher  from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar        from '../../../src/toolbar/Base.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

/**
 * @summary COVID-19 country metrics table with docked leading columns, header resize, and theme switching.
 * @class Neo.examples.table.covid.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.table.covid.MainContainer'
         * @protected
         */
        className: 'Neo.examples.table.covid.MainContainer',
        /**
         * @member {Object[]} items
         * @reactive
         */
        items: [{
            module: Toolbar,
            cls   : ['covid-table-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module: Label,
                text  : 'COVID-19 Country Metrics'
            }, '->', {
                module: ThemeSwitcher,
                flex  : 'none'
            }]
        }, {
            module      : TableContainer,
            flex        : 1,
            wrapperStyle: {flex: 1, minHeight: 0}
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'}
    }
}

export default Neo.setupClass(MainContainer);
