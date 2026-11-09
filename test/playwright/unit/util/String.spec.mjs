import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'StringUtilTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import StringUtil     from '../../../../src/util/String.mjs';

test.describe('Neo.util.String', () => {
    test('escapeHtml replaces every character selected by charPattern', () => {
        expect(StringUtil.escapeHtml('&<>"\'$\\')).toBe('&amp;&lt;&gt;&quot;&apos;&dollar;&bsol;')
    });

    test('unescapeHtml replaces every entity selected by entityPattern', () => {
        expect(StringUtil.unescapeHtml(
            '&amp;&lt;&gt;&quot;&apos;&dollar;&bsol;&sol;'
        )).toBe('&<>"\'$\\/')
    });

    test('mapping helpers preserve unknown values', () => {
        expect(StringUtil.getEntityFromChar('&')).toBe('&amp;');
        expect(StringUtil.getEntityFromChar('x')).toBe('x');
        expect(StringUtil.getCharFromEntity('&amp;')).toBe('&');
        expect(StringUtil.getCharFromEntity('&unknown;')).toBe('&unknown;')
    });

    test('escapeHtml and unescapeHtml pass non-string input through unchanged', () => {
        const objectValue = {value: '&amp;'};

        expect(StringUtil.escapeHtml(objectValue)).toBe(objectValue);
        expect(StringUtil.unescapeHtml(objectValue)).toBe(objectValue);
        expect(StringUtil.escapeHtml(null)).toBeNull();
        expect(StringUtil.unescapeHtml(42)).toBe(42)
    });

    test('uncapitalize only lowercases the first character and preserves falsy input', () => {
        expect(StringUtil.uncapitalize('HelloWorld')).toBe('helloWorld');
        expect(StringUtil.uncapitalize('alreadyLower')).toBe('alreadyLower');
        expect(StringUtil.uncapitalize('')).toBe('');
        expect(StringUtil.uncapitalize(null)).toBeNull();
        expect(StringUtil.uncapitalize(false)).toBe(false)
    });

    test('escapeRegExp escapes regex metacharacters and passes non-strings through', () => {
        const metacharacters = '\\^$.*+?()[]{}|/-';
        const escaped        = StringUtil.escapeRegExp(metacharacters);

        expect(escaped).toBe('\\\\\\^\\$\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|\\/\\-');

        const regex = new RegExp(escaped, 'g');
        expect(`prefix ${metacharacters} suffix`.replace(regex, 'MATCH')).toBe('prefix MATCH suffix');

        for (const ch of metacharacters) {
            const singleRegex = new RegExp(StringUtil.escapeRegExp(ch), 'gi');
            expect(singleRegex.test(ch)).toBe(true);
            if (ch === '.') {
                expect(singleRegex.test('a')).toBe(false);
            }
        }

        const obj = {a: 1};
        expect(StringUtil.escapeRegExp(obj)).toBe(obj);
        expect(StringUtil.escapeRegExp(null)).toBeNull();
        expect(StringUtil.escapeRegExp(undefined)).toBeUndefined();
        expect(StringUtil.escapeRegExp(123)).toBe(123)
    })
});
