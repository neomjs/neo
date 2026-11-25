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
    });

    test('toRouteHref keeps hash prefixes in hash mode and formats clean base-prefixed paths in pathname mode', () => {
        const previous = {
            routerBasePath: Neo.config.routerBasePath,
            routerMode    : Neo.config.routerMode
        };

        try {
            Object.assign(Neo.config, {routerBasePath: '', routerMode: 'hash'});
            expect(StringUtil.toRouteHref('/')).toBe('#/');
            expect(StringUtil.toRouteHref('/learn')).toBe('#/learn');
            expect(StringUtil.toRouteHref('#/examples/grid')).toBe('#/examples/grid');
            expect(StringUtil.toRouteHref('')).toBe('');
            expect(StringUtil.toRouteHref(null)).toBeNull();

            Object.assign(Neo.config, {routerBasePath: '', routerMode: 'pathname'});
            expect(StringUtil.toRouteHref('/')).toBe('/');
            expect(StringUtil.toRouteHref('#/')).toBe('/');
            expect(StringUtil.toRouteHref('/learn')).toBe('/learn');
            expect(StringUtil.toRouteHref('#/examples/grid')).toBe('/examples/grid');
            expect(StringUtil.toRouteHref('#/news/tickets/')).toBe('/news/tickets/');

            Object.assign(Neo.config, {routerBasePath: '/docs', routerMode: 'pathname'});
            expect(StringUtil.toRouteHref('/')).toBe('/docs/');
            expect(StringUtil.toRouteHref('/learn/Intro')).toBe('/docs/learn/Intro');
            expect(StringUtil.toRouteHref('#/learn/Intro#section')).toBe('/docs/learn/Intro#section')
        } finally {
            Object.assign(Neo.config, previous)
        }
    });

    test('toRouteHref resolves per-window routerMode and routerBasePath from Neo.windowConfigs[windowId]', () => {
        const previousConfig        = {routerBasePath: Neo.config.routerBasePath, routerMode: Neo.config.routerMode},
              previousWindowConfigs = Neo.windowConfigs;

        try {
            Object.assign(Neo.config, {routerBasePath: '', routerMode: 'hash'});
            Neo.windowConfigs = {
                'win-path': {routerBasePath: '/alpha', routerMode: 'pathname'},
                'win-hash': {routerBasePath: '', routerMode: 'hash'}
            };

            expect(StringUtil.toRouteHref('/learn', 'win-path')).toBe('/alpha/learn');
            expect(StringUtil.toRouteHref('/', 'win-path')).toBe('/alpha/');
            expect(StringUtil.toRouteHref('/learn', 'win-hash')).toBe('#/learn');
            expect(StringUtil.toRouteHref('/learn', 'unknown-win')).toBe('#/learn');
            expect(StringUtil.toRouteHref('/learn')).toBe('#/learn')
        } finally {
            Object.assign(Neo.config, previousConfig);
            previousWindowConfigs === undefined ? delete Neo.windowConfigs : Neo.windowConfigs = previousWindowConfigs
        }
    })
});
