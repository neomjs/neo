import { setup } from '../../setup.mjs';

setup({
    appConfig: {
        name: 'JsonTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Json           from '../../../../src/util/Json.mjs';

test.describe('Neo.util.Json', () => {
    test('parses plain JSON objects and arrays', () => {
        expect(Json.extract('{"name":"Neo","versions":[12,13]}')).toEqual({
            name    : 'Neo',
            versions: [12, 13]
        });
        expect(Json.extract('[1, true, null, "four"]')).toEqual([1, true, null, 'four']);
    });

    test('parses every supported Markdown fence form', () => {
        for (const language of ['json', 'javascript', 'js', '']) {
            expect(Json.extract(`\`\`\`${language}\n{"language":"${language || 'untagged'}"}\n\`\`\``)).toEqual({
                language: language || 'untagged'
            });
        }
    });

    test('finds a supported fenced block inside surrounding text', () => {
        const input = 'Here is the requested value:\n```json\n{"ready":true}\n```\nHope that helps.';

        expect(Json.extract(input)).toEqual({ready: true});
    });

    test('returns null for empty, whitespace-only, and malformed input without throwing', () => {
        for (const input of ['', '   \n\t', '{"missing":}', '```json\nnot json\n```']) {
            expect(() => Json.extract(input)).not.toThrow();
            expect(Json.extract(input)).toBeNull();
        }
    });

    test('preserves representative nested JSON values', () => {
        const input = JSON.stringify({
            active : true,
            count  : 3,
            label  : 'nested',
            missing: null,
            values : [false, 1.5, {items: ['a', 'b']}]
        });

        expect(Json.extract(input)).toEqual({
            active : true,
            count  : 3,
            label  : 'nested',
            missing: null,
            values : [false, 1.5, {items: ['a', 'b']}]
        });
    });
});
