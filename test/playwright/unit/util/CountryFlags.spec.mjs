
import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'CountryFlagsTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import CountryFlags   from '../../../../src/util/CountryFlags.mjs';

test.describe('Neo.util.CountryFlags', () => {

    test('should normalize country names regardless of case and spaces', () => {
        expect(CountryFlags.getCountryCode('Germany')).toBe('de');
        expect(CountryFlags.getCountryCode('germany')).toBe('de');
        expect(CountryFlags.getCountryCode(' GERMANY ')).toBe('de');
    });

    test('should recognize a two-letter country code', () => {
        expect(CountryFlags.getCountryCode('DE')).toBe('de');
    });

    test('should recognize country aliases before the two-letter rule', () => {
        expect(CountryFlags.getCountryCode('USA')).toBe('us');
        expect(CountryFlags.getCountryCode('UK')).toBe('gb');
    });

    test('should accept an unknown two-letter code', () => {
        expect(CountryFlags.getCountryCode('zz')).toBe('zz');
    });

    test('should accept a two-character input containing a number', () => {
        expect(CountryFlags.getCountryCode('x1')).toBe('x1');
    });

    test('should find a country name inside a longer location', () => {
        expect(CountryFlags.getCountryCode('Berlin, Germany')).toBe('de');
    });

    test('should find an alias inside a longer location', () => {
        expect(CountryFlags.getCountryCode('San Francisco, USA')).toBe('us');
    });

    test('should match whole country names rather than partial words', () => {
        expect(CountryFlags.getCountryCode('Somalia')).toBe('so');
        expect(CountryFlags.getCountryCode('Mali')).toBe('ml');
    });

    test('should prefer the longer matching country name', () => {
        expect(CountryFlags.getCountryCode('Dominican Republic')).toBe('do');
        expect(CountryFlags.getCountryCode('Dominica')).toBe('dm');
    });

    test('should return null for invalid or unrecognized inputs', () => {
        expect(CountryFlags.getCountryCode('Remote')).toBe(null);
        expect(CountryFlags.getCountryCode('Deutschland')).toBe(null);
        expect(CountryFlags.getCountryCode('')).toBe(null);
        expect(CountryFlags.getCountryCode(null)).toBe(null);
        expect(CountryFlags.getCountryCode(42)).toBe(null);
    });

    test('should generate the correct flag URL for Germany', () => {
        expect(CountryFlags.getFlagUrl('Germany'))
            .toBe('https://hatscripts.github.io/circle-flags/flags/de.svg');
    });

    test('should generate a URL for an unknown two-letter code', () => {
        expect(CountryFlags.getFlagUrl('zz'))
            .toBe('https://hatscripts.github.io/circle-flags/flags/zz.svg');
    });

    test('should return null for a code containing a number in a flag URL', () => {
        expect(CountryFlags.getFlagUrl('x1')).toBe(null);
    });

    test('should return the England regional code but no flag URL', () => {
        expect(CountryFlags.getCountryCode('England')).toBe('gb-eng');
        expect(CountryFlags.getFlagUrl('England')).toBe(null);
    });


});

