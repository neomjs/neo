import {test, expect} from '@playwright/test';

import {
    verifyDiscussionFrontmatter,
    verifyFrontmatterIntegrity
} from '../../../../../../ai/services/github-workflow/sync/verifyFrontmatterIntegrity.mjs';

/**
 * @summary Coverage for `ai/services/github-workflow/sync/verifyFrontmatterIntegrity.mjs` —
 * the post-serialization integrity gate authored under #11573.
 *
 * Test axes:
 *
 * 1. Empty / malformed input safety (null content, empty key set).
 * 2. Happy path — full key set present.
 * 3. AC3 failing fixture — synthesized markdown lacking `closed`/`closedAt` (the empirical
 *    bug captured by operator V-B-A 2026-05-18: 0/104 on-disk Discussion files lacked
 *    these keys despite #11554 having merged the frontmatter-emit fix).
 * 4. AC2 allowed fixture — historical/archive-style discussions where `closed: true`
 *    and `closedAt: '<date>'` are both present.
 * 5. Convenience wrapper `verifyDiscussionFrontmatter` requires all 8 Discussion keys.
 */
test.describe('ai/services/github-workflow/sync/verifyFrontmatterIntegrity (#11573)', () => {
    test('verifyFrontmatterIntegrity: returns ok=true when all required keys present', () => {
        const content = [
            '---',
            'number: 11089',
            'title: Test',
            'closed: false',
            'closedAt: null',
            '---',
            'Body.'
        ].join('\n');

        const result = verifyFrontmatterIntegrity(content, ['number', 'closed', 'closedAt']);

        expect(result).toEqual({ok: true, missing: []});
    });

    test('verifyFrontmatterIntegrity: returns missing keys when fields absent', () => {
        const content = [
            '---',
            'number: 11089',
            'title: Test',
            '---',
            'Body.'
        ].join('\n');

        const result = verifyFrontmatterIntegrity(content, ['number', 'closed', 'closedAt']);

        expect(result.ok).toBe(false);
        expect(result.missing).toEqual(['closed', 'closedAt']);
    });

    test('verifyFrontmatterIntegrity: handles empty required-keys array as trivially ok', () => {
        expect(verifyFrontmatterIntegrity('any content', [])).toEqual({ok: true, missing: []});
    });

    test('verifyFrontmatterIntegrity: handles non-string content defensively', () => {
        expect(verifyFrontmatterIntegrity(null, ['number'])).toEqual({ok: false, missing: ['number']});
        expect(verifyFrontmatterIntegrity(undefined, ['closed'])).toEqual({ok: false, missing: ['closed']});
    });

    test('verifyFrontmatterIntegrity: matches at line start, ignores inline mentions in body', () => {
        // The string "closed:" appears inline in the body, but NOT at the start of any line.
        const content = [
            '---',
            'number: 11089',
            '---',
            'See discussion-history for when closed: state changed.'
        ].join('\n');

        const result = verifyFrontmatterIntegrity(content, ['closed']);

        expect(result.ok).toBe(false);
        expect(result.missing).toEqual(['closed']);
    });

    test('verifyFrontmatterIntegrity: escapes regex metacharacters in key names', () => {
        const content = "---\nweird.key: value\n---\nBody.";

        const result = verifyFrontmatterIntegrity(content, ['weird.key']);

        expect(result).toEqual({ok: true, missing: []});
    });

    test('verifyDiscussionFrontmatter: full key set passes (active Discussion)', () => {
        const content = [
            '---',
            'number: 11089',
            'title: Test',
            'author: neo-test',
            'category: Ideas',
            'createdAt: \'2026-05-10T01:33:43Z\'',
            'updatedAt: \'2026-05-10T22:54:27Z\'',
            'closed: false',
            'closedAt: null',
            '---',
            'Body.'
        ].join('\n');

        const result = verifyDiscussionFrontmatter(content);

        expect(result).toEqual({ok: true, missing: []});
    });

    test('verifyDiscussionFrontmatter: full key set passes (archived Discussion)', () => {
        const content = [
            '---',
            'number: 5408',
            'title: Old discussion',
            'author: tobiu',
            'category: Ideas',
            'createdAt: \'2024-06-03T13:44:19Z\'',
            'updatedAt: \'2025-03-04T20:25:15Z\'',
            'closed: true',
            'closedAt: \'2024-08-03T00:00:00Z\'',
            '---',
            'Body.'
        ].join('\n');

        const result = verifyDiscussionFrontmatter(content);

        expect(result).toEqual({ok: true, missing: []});
    });

    test('verifyDiscussionFrontmatter: catches the #11554 regression — missing closed + closedAt', () => {
        // Empirical anchor: this is the exact frontmatter shape that all 104 on-disk
        // Discussion markdown files had on 2026-05-18 (operator V-B-A) — pre-#11554 shape.
        const content = [
            '---',
            'number: 11089',
            'title: Calibrate AGENTS.md core values + define nightshift operating mode',
            'author: neo-opus-4-7',
            'category: Ideas',
            'createdAt: \'2026-05-10T01:33:43Z\'',
            'updatedAt: \'2026-05-10T22:54:27Z\'',
            '---',
            'Body.'
        ].join('\n');

        const result = verifyDiscussionFrontmatter(content);

        expect(result.ok).toBe(false);
        expect(result.missing).toEqual(['closed', 'closedAt']);
    });

    test('verifyDiscussionFrontmatter: catches single missing key', () => {
        const content = [
            '---',
            'number: 11089',
            'title: Test',
            'author: neo-test',
            'category: Ideas',
            'createdAt: \'2026-05-10T01:33:43Z\'',
            'updatedAt: \'2026-05-10T22:54:27Z\'',
            'closed: false',
            '---',
            'Body.'
        ].join('\n');

        const result = verifyDiscussionFrontmatter(content);

        expect(result.ok).toBe(false);
        expect(result.missing).toEqual(['closedAt']);
    });
});
