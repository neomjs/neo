import {setup} from '../../setup.mjs';

const appName = 'ListSearchHighlightTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Instance       from '../../../../src/manager/Instance.mjs';
import CountryList    from '../../../../src/list/Country.mjs';
import List           from '../../../../src/list/Base.mjs';

test.describe('Neo.list.Base and Neo.list.Country search highlight escaping', () => {
    let list;

    test.afterEach(() => {
        list?.destroy();
        list = null
    });

    test('Neo.list.Base#createItemContent highlights literal regex metacharacters without throwing', () => {
        list = Neo.create(List, {
            appName,
            displayField        : 'name',
            highlightFilterValue: true,
            store               : {
                keyProperty: 'id',
                model      : {
                    fields: [
                        {name: 'id',   type: 'String'},
                        {name: 'name', type: 'String'}
                    ]
                },
                filters: [
                    {property: 'name', operator: 'like', value: '('}
                ],
                data: [
                    {id: '1', name: 'Option (A) (b)'},
                    {id: '2', name: 'Option B'}
                ]
            }
        });

        const record = list.store.get('1');

        expect(() => list.createItemContent(record, 0)).not.toThrow();
        expect(list.createItemContent(record, 0)).toBe(
            'Option <span class="neo-highlight-search">(</span>A) <span class="neo-highlight-search">(</span>b)'
        );

        list.store.getFilter('name').value = '(a)';
        expect(list.createItemContent(record, 0)).toBe(
            'Option <span class="neo-highlight-search">(A)</span> (b)'
        )
    });

    test('Neo.list.Country#createItemContent highlights literal regex metacharacters without throwing', () => {
        list = Neo.create(CountryList, {
            appName,
            displayField        : 'name',
            highlightFilterValue: true,
            store               : {
                keyProperty: 'code',
                model      : {
                    fields: [
                        {name: 'code', type: 'String'},
                        {name: 'name', type: 'String'}
                    ]
                },
                filters: [
                    {property: 'name', operator: 'like', value: '('}
                ],
                data: [
                    {code: 'FK', name: 'Falkland Islands (Malvinas)'}
                ]
            }
        });

        const record = list.store.get('FK');
        let content;

        expect(() => {
            content = list.createItemContent(record, 0)
        }).not.toThrow();

        expect(Array.isArray(content)).toBe(true);
        expect(content[1]).toEqual({
            tag : 'span',
            cls : ['neo-country-text'],
            html: 'Falkland Islands <span class="neo-highlight-search">(</span>Malvinas)'
        })
    })
});
