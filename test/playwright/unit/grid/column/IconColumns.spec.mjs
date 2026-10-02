import {setup} from '../../../setup.mjs';

const appName = 'IconColumnsTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import IconColumn      from '../../../../../src/grid/column/Icon.mjs';
import IconLinkColumn  from '../../../../../src/grid/column/IconLink.mjs';
import LinkedInColumn  from '../../../../../src/grid/column/LinkedIn.mjs';

/**
 * @summary Unit tests for the icon, icon-link and LinkedIn grid columns.
 *
 * Each of these columns decides what a cell shows in `applyRecordConfigs(config, record)`.
 * The tests call that method directly with a plain object as the record and pin:
 * 1. Which keys are derived from the record and from the column configs.
 * 2. The formatters of the icon-link column.
 * 3. The profile URL the LinkedIn column builds from a bare handle.
 * 4. That a key passed in `config` wins over the derived one.
 */
test.describe('Neo.grid.column.Icon', () => {
    test('uses the record value as cellIconCls when the column has none', () => {
        const column = Neo.create(IconColumn, {dataField: 'icon'});

        expect(column.applyRecordConfigs({}, {icon: 'fa fa-check'})).toEqual({
            cellIconCls: 'fa fa-check',
            hidden     : false
        });

        expect(column.applyRecordConfigs({}, {icon: ''})).toEqual({
            cellIconCls: '',
            hidden     : true
        });

        expect(column.applyRecordConfigs({}, {icon: null}).hidden).toBe(true);
        expect(column.applyRecordConfigs({}, {}).hidden).toBe(true);
    });

    test('uses a fixed cellIconCls from the column', () => {
        const column = Neo.create(IconColumn, {
            cellIconCls: 'fa fa-star',
            dataField  : 'starred'
        });

        expect(column.applyRecordConfigs({}, {starred: true})).toEqual({
            cellIconCls: 'fa fa-star',
            hidden     : false
        });

        expect(column.applyRecordConfigs({}, {starred: false})).toEqual({
            cellIconCls: 'fa fa-star',
            hidden     : true
        });

        expect(column.applyRecordConfigs({}, {}).hidden).toBe(true);
    });
});

test.describe('Neo.grid.column.IconLink', () => {
    test('passes the record value through without formatters', () => {
        const record = {name: 'Neo.mjs', website: 'https://neomjs.com'};

        let column = Neo.create(IconLinkColumn, {
            cellIconCls: 'fa fa-globe',
            dataField  : 'website'
        });

        expect(column.applyRecordConfigs({}, record)).toEqual({
            cellIconCls: 'fa fa-globe',
            label      : null,
            url        : 'https://neomjs.com'
        });

        column = Neo.create(IconLinkColumn, {
            cellIconCls: 'fa fa-globe',
            dataField  : 'website',
            labelField : 'name'
        });

        expect(column.applyRecordConfigs({}, record)).toEqual({
            cellIconCls: 'fa fa-globe',
            label      : 'Neo.mjs',
            url        : 'https://neomjs.com'
        });
    });

    test('builds the url with urlFormatter', () => {
        const
            calls  = [],
            record = {login: 'jane'},
            column = Neo.create(IconLinkColumn, {
                dataField   : 'login',
                urlFormatter: (value, record) => {
                    calls.push([value, record]);
                    return `https://github.com/${value}`
                }
            });

        expect(column.applyRecordConfigs({}, record).url).toBe('https://github.com/jane');

        expect(calls.length).toBe(1);
        expect(calls[0][0]).toBe('jane');
        expect(calls[0][1]).toBe(record);
    });

    test('builds the label with labelFormatter', () => {
        const
            calls          = [],
            record         = {login: 'jane', name: 'Jane Doe'},
            labelFormatter = (value, record) => {
                calls.push([value, record]);
                return `Profile of ${value}`
            };

        // With a labelField, the formatter gets the labelField value
        let column = Neo.create(IconLinkColumn, {
            dataField : 'login',
            labelField: 'name',
            labelFormatter
        });

        expect(column.applyRecordConfigs({}, record).label).toBe('Profile of Jane Doe');

        // Without a labelField, the formatter gets the record value
        column = Neo.create(IconLinkColumn, {
            dataField: 'login',
            labelFormatter
        });

        expect(column.applyRecordConfigs({}, record).label).toBe('Profile of jane');

        expect(calls.length).toBe(2);
        expect(calls[0][0]).toBe('Jane Doe');
        expect(calls[0][1]).toBe(record);
        expect(calls[1][0]).toBe('jane');
        expect(calls[1][1]).toBe(record);
    });
});

test.describe('Neo.grid.column.LinkedIn', () => {
    test('builds the profile url from a bare handle', () => {
        const column = Neo.create(LinkedInColumn, {dataField: 'linkedin'});

        expect(column.applyRecordConfigs({}, {linkedin: 'jane-doe'}).url).toBe('https://www.linkedin.com/in/jane-doe/');
    });

    test('keeps a value starting with http as it is', () => {
        const column = Neo.create(LinkedInColumn, {dataField: 'linkedin'});

        expect(column.applyRecordConfigs({}, {linkedin: 'https://www.linkedin.com/in/jane-doe/'}).url).toBe('https://www.linkedin.com/in/jane-doe/');
        expect(column.applyRecordConfigs({}, {linkedin: 'http://linkedin.com/company/neo'}).url).toBe('http://linkedin.com/company/neo');
    });

    test('defaults cellIconCls to the LinkedIn brand icon', () => {
        const column = Neo.create(LinkedInColumn, {dataField: 'linkedin'});

        expect(column.cellIconCls).toBe('fa-brands fa-linkedin');

        expect(column.applyRecordConfigs({}, {linkedin: 'jane-doe'})).toEqual({
            cellIconCls: 'fa-brands fa-linkedin',
            url        : 'https://www.linkedin.com/in/jane-doe/'
        });
    });
});

test.describe('Neo.grid.column: icon columns', () => {
    test('a key passed in config wins over the derived one', () => {
        const icon = Neo.create(IconColumn, {dataField: 'icon'});

        expect(icon.applyRecordConfigs({cellIconCls: 'fa fa-ban', hidden: false}, {icon: ''})).toEqual({
            cellIconCls: 'fa fa-ban',
            hidden     : false
        });

        const fixedIcon = Neo.create(IconColumn, {
            cellIconCls: 'fa fa-star',
            dataField  : 'starred'
        });

        expect(fixedIcon.applyRecordConfigs({cellIconCls: 'fa fa-ban'}, {starred: true}).cellIconCls).toBe('fa fa-ban');

        const iconLink = Neo.create(IconLinkColumn, {
            cellIconCls: 'fa fa-globe',
            dataField  : 'website',
            labelField : 'name'
        });

        expect(iconLink.applyRecordConfigs(
            {cellIconCls: 'fa fa-link', label: 'Home', url: '#'},
            {name: 'Neo.mjs', website: 'https://neomjs.com'}
        )).toEqual({
            cellIconCls: 'fa fa-link',
            label      : 'Home',
            url        : '#'
        });

        const linkedIn = Neo.create(LinkedInColumn, {dataField: 'linkedin'});

        expect(linkedIn.applyRecordConfigs(
            {cellIconCls: 'fa fa-user', url: '#'},
            {linkedin: 'jane-doe'}
        )).toEqual({
            cellIconCls: 'fa fa-user',
            url        : '#'
        });

        // Keys the column does not derive are passed through
        expect(linkedIn.applyRecordConfigs({style: {color: 'red'}}, {linkedin: 'jane-doe'}).style).toEqual({color: 'red'});
    });
});
