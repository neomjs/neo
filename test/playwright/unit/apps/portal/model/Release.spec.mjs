import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'PortalReleaseModelTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import Release        from '../../../../../../apps/portal/model/Release.mjs';

/**
 * @summary Pins the Portal release tree label: a release without a date reads as unreleased,
 * never "Invalid Date" or "1/1/1970", while major-version folders keep their plain id.
 *
 * `treeNodeName` is a pure calculated field, so it is called directly with the raw index entries
 * the store hands it: leaves do not carry `isLeaf`, folders carry `isLeaf: false`.
 */
const {calculate} = Release.config.fields.find(field => field.name === 'treeNodeName');

test.describe('Portal.model.Release', () => {
    test('labels a release without a date as unreleased', () => {
        const label = calculate({id: '13.4.0', parentId: 'v13'});

        expect(label).toBe('<b>13.4.0</b> <span class="release-date">[unreleased]</span>');
        expect(label).not.toContain('Invalid Date');
        expect(label).not.toContain('1970')
    });

    test('labels a released note with its date', () => {
        const date = '2026-11-01T10:00:00Z';

        expect(calculate({date, id: '13.3.0', isLeaf: true, parentId: 'v13'}))
            .toBe(`<b>13.3.0</b> <span class="release-date">[${new Date(date).toLocaleDateString()}]</span>`)
    });

    test('keeps a major-version folder as its plain id', () => {
        expect(calculate({collapsed: false, id: 'v13', isLeaf: false, parentId: null})).toBe('v13')
    })
});
