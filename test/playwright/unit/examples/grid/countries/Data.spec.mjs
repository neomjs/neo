import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'CountriesDataTest'}});

import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import MainModel      from '../../../../../../examples/grid/countries/MainModel.mjs';

const file = new URL('../../../../../../examples/grid/countries/data/countries.json', import.meta.url);

test.describe('examples/grid/countries data', () => {
    test('217 economies under their source and licence, each with the model\'s fields', () => {
        const {data, source} = JSON.parse(fs.readFileSync(file, 'utf8')),
              model          = Neo.create(MainModel),
              fields         = [...model.fieldsMap.keys()].sort();

        expect(source.licence).toBe('CC BY 4.0');
        expect(source.name).toBe('World Bank, World Development Indicators');
        expect(Object.keys(source.series).sort()).toEqual(fields.filter(name => !['country', 'flag', 'id', 'region'].includes(name)));

        expect(data).toHaveLength(217);
        expect(new Set(data.map(record => record.id)).size).toBe(217);

        data.forEach(record => {
            expect(Object.keys(record).sort(), record.id).toEqual(fields);
            expect(record.flag === null || /^[a-z]{2}$/.test(record.flag), record.id).toBe(true);
            expect(Number.isInteger(record.population) && record.population > 0, record.id).toBe(true)
        });

        // Shipped in the store's default order: the largest population first
        data.slice(1).forEach((record, index) => expect(record.population, record.id).toBeLessThanOrEqual(data[index].population));

        model.destroy()
    });
});
