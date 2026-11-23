import Base from '../../../src/core/Base.mjs';

/**
 * @summary Generates the Colors dashboard's data inside the app, for the time its WebSocket backend does not answer.
 *
 * `read()` returns what the backend's `Colors.backend.ColorService.read()` returns: it is the generator that runs on
 * the server (`backend/ColorService.mjs` in neomjs/multiwindowcolors), ported. `Colors.view.ViewportController` asks
 * the backend first and takes its batches from here once a call passes its deadline.
 * @class Colors.service.ColorService
 * @extends Neo.core.Base
 * @singleton
 */
class ColorService extends Base {
    static config = {
        /**
         * @member {String} className='Colors.service.ColorService'
         * @protected
         */
        className: 'Colors.service.ColorService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The colour each index stands for in the summary: `colors[0]` is colour 1.
     * @member {String[]} colors
     */
    colors = [
        '#1c60a0', '#206db6', '#247acb', '#2e87da', '#4493de',
        '#59a0e2', '#6face6', '#85b9ea', '#9bc5ed', '#b0d2f1'
    ]

    /**
     * @summary Generates one batch: a colour index per grid cell, and how often each colour occurs.
     * @param {Object} opts
     * @param {Number} opts.amountColors How many colours the cells choose from, ten at most
     * @param {Number} opts.amountColumns
     * @param {Number} opts.amountRows
     * @returns {{success: Boolean, data: {summaryData: Object[], tableData: Object[]}}} `tableData` holds a record
     * per row (`id`, then `columnA` onwards, each a colour index from 1), `summaryData` a `{color, count}` per colour
     */
    read({amountColors, amountColumns, amountRows}) {
        const counts      = new Array(amountColors).fill(0),
              firstColumn = 'A'.charCodeAt(0),
              tableData   = [];

        for (let row = 1; row <= amountRows; row++) {
            const record = {id: `row${row}`};

            for (let column = 0; column < amountColumns; column++) {
                const color = Math.floor(Math.random() * amountColors) + 1;

                record['column' + String.fromCharCode(firstColumn + column)] = color;
                counts[color - 1]++
            }

            tableData.push(record)
        }

        return {
            success: true,
            data   : {
                summaryData: counts.map((count, index) => ({color: this.colors[index], count})),
                tableData
            }
        }
    }
}

export default Neo.setupClass(ColorService);
