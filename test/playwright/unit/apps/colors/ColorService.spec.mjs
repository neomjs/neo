import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'ColorsColorServiceTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import ColorService   from '../../../../../apps/colors/service/ColorService.mjs';

test.describe('Colors.service.ColorService', () => {
    test('a batch has a record per row, a colour per cell, and a summary that counts every cell', () => {
        const {data, success} = ColorService.read({amountColors: 4, amountColumns: 3, amountRows: 5}),
              cells           = data.tableData.flatMap(({id, ...columns}) => Object.values(columns));

        expect(success).toBe(true);
        expect(data.tableData.map(record => record.id)).toEqual(['row1', 'row2', 'row3', 'row4', 'row5']);
        expect(Object.keys(data.tableData[0])).toEqual(['id', 'columnA', 'columnB', 'columnC']);
        expect(cells.every(color => Number.isInteger(color) && color >= 1 && color <= 4)).toBe(true);
        expect(data.summaryData.map(({color}) => color)).toEqual(ColorService.colors.slice(0, 4));

        data.summaryData.forEach(({count}, index) => {
            expect(count, `colour ${index + 1}`).toBe(cells.filter(color => color === index + 1).length)
        })
    })
});
