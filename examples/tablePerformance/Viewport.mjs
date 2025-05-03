import BaseViewport   from '../../src/container/Viewport.mjs';
import MainContainer  from './MainContainer.mjs';
import MainContainer2 from './MainContainer2.mjs';
import MainContainer3 from './MainContainer3.mjs';

/**
 * @class Neo.examples.tablePerformance.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        className: 'Neo.examples.tablePerformance.Viewport',
        style    : {overflow: 'hidden', padding: '10px'},

        layout: {
            ntype: 'vbox',
            align: 'stretch'
        },

        items: [{
            module: MainContainer
        }, {
            module: MainContainer2,
            style : {marginTop: '20px'}
        }, {
            module: MainContainer3,
            style : {marginTop: '20px'}
        }]
    }

    /**
     * @param {Number} amountColumns
     * @param {Number} amountRows
     */
    createRandomData(amountColumns, amountRows) {
        let data = [],
            i    = 0,
            j;

        for (; i < amountRows; i++) {
            data.push({});

            for (j=0; j < amountColumns; j++) {
                data[i]['column' + j] = 'Column' + (j + 1) + ' - ' + Math.round(Math.random() / 1.5);
                data[i]['column' + j + 'style'] = Math.round(Math.random() / 1.7) > 0 ? 'brown' : i%2 ? '#3c3f41' : '#323232'
            }
        }

        return data
    }
}

export default Neo.setupClass(Viewport);
