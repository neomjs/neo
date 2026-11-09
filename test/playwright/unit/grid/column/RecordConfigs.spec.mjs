import {setup} from '../../../setup.mjs';

const appName = 'RecordConfigsColumnTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../../src/Neo.mjs';
import * as core         from '../../../../../src/core/_export.mjs';
import InstanceManager   from '../../../../../src/manager/Instance.mjs';
import CountryFlagColumn from '../../../../../src/grid/column/CountryFlag.mjs';
import GitHubUserColumn  from '../../../../../src/grid/column/GitHubUser.mjs';
import ProgressColumn    from '../../../../../src/grid/column/Progress.mjs';

/**
 * @summary Unit tests for Neo.grid.column.Progress, CountryFlag, and GitHubUser record mapping.
 *
 * Each column transforms a row record into component configs via `applyRecordConfigs(config, record)`.
 * These tests pin the record-derived keys for each column and verify that keys passed in `config`
 * take precedence over the record-derived values.
 */
test.describe('Neo.grid.column.Progress', () => {
    test('maps record[dataField] to value', () => {
        const column = Neo.create(ProgressColumn, {dataField: 'completion'});

        expect(column.applyRecordConfigs({}, {completion: 75})).toEqual({
            value: 75
        });

        expect(column.applyRecordConfigs({}, {completion: 0})).toEqual({
            value: 0
        });

        column.destroy();
    });

    test('a key passed in config wins over the record-derived value', () => {
        const column = Neo.create(ProgressColumn, {dataField: 'completion'});

        expect(column.applyRecordConfigs({maxValue: 200, value: 90}, {completion: 45})).toEqual({
            maxValue: 200,
            value   : 90
        });

        column.destroy();
    });
});

test.describe('Neo.grid.column.CountryFlag', () => {
    test('maps record[dataField] to countryCode and record[contentField] (defaulting to "location") to location', () => {
        const defaultColumn = Neo.create(CountryFlagColumn, {dataField: 'country'});

        expect(defaultColumn.contentField).toBe('location');
        expect(defaultColumn.applyRecordConfigs({}, {
            country : 'DE',
            location: 'Germany'
        })).toEqual({
            countryCode: 'DE',
            location   : 'Germany'
        });

        const customColumn = Neo.create(CountryFlagColumn, {
            contentField: 'city',
            dataField   : 'isoCode'
        });

        expect(customColumn.applyRecordConfigs({}, {
            city   : 'Tehran',
            isoCode: 'IR'
        })).toEqual({
            countryCode: 'IR',
            location   : 'Tehran'
        });

        defaultColumn.destroy();
        customColumn.destroy();
    });

    test('a key passed in config wins over the record-derived countryCode and location', () => {
        const column = Neo.create(CountryFlagColumn, {dataField: 'country'});

        expect(column.applyRecordConfigs(
            {countryCode: 'FR', location: 'France', reference: 'flag'},
            {country: 'DE', location: 'Germany'}
        )).toEqual({
            countryCode: 'FR',
            location   : 'France',
            reference  : 'flag'
        });

        column.destroy();
    });
});

test.describe('Neo.grid.column.GitHubUser', () => {
    test('maps avatarUrl, username from login, and fullName (or empty string when name is missing or equals login)', () => {
        const column = Neo.create(GitHubUserColumn, {dataField: 'login'});

        expect(column.applyRecordConfigs({}, {
            avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
            login    : 'maryam',
            name     : 'Maryam Mirzakhani'
        })).toEqual({
            avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
            fullName : 'Maryam Mirzakhani',
            username : 'maryam'
        });

        expect(column.applyRecordConfigs({}, {
            avatarUrl: 'https://avatars.githubusercontent.com/u/2?v=4',
            login    : 'octocat'
        })).toEqual({
            avatarUrl: 'https://avatars.githubusercontent.com/u/2?v=4',
            fullName : '',
            username : 'octocat'
        });

        expect(column.applyRecordConfigs({}, {
            avatarUrl: 'https://avatars.githubusercontent.com/u/3?v=4',
            login    : 'samehandle',
            name     : 'samehandle'
        })).toEqual({
            avatarUrl: 'https://avatars.githubusercontent.com/u/3?v=4',
            fullName : '',
            username : 'samehandle'
        });

        column.destroy();
    });

    test('a key passed in config wins over the record-derived avatarUrl, fullName, and username', () => {
        const column = Neo.create(GitHubUserColumn, {dataField: 'login'});

        expect(column.applyRecordConfigs(
            {
                avatarUrl: 'https://example.com/override.png',
                fullName : 'Override Name',
                username : 'override-user'
            },
            {
                avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4',
                login    : 'maryam',
                name     : 'Maryam Mirzakhani'
            }
        )).toEqual({
            avatarUrl: 'https://example.com/override.png',
            fullName : 'Override Name',
            username : 'override-user'
        });

        column.destroy();
    });
});
