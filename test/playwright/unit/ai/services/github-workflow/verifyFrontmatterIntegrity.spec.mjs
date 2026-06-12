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

    test('verifyFrontmatterIntegrity: ignores body content (no false-positive on body-line `key:`)', () => {
        // Body contains a quoted "closed:" line. The frontmatter LACKS `closed:`. Per the
        // ticket contract + GPT cycle-1 V-B-A on PR #11574 (gray-matter parse, not regex on
        // whole doc), this MUST report `closed` as missing.
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

    test('verifyFrontmatterIntegrity: regression — body-line literal `closed:` does NOT satisfy missing frontmatter key (GPT V-B-A #11574 cycle-1)', () => {
        // GPT's empirical false-positive reproduction from PR #11574 cycle-1 review:
        //   content has `closed:` / `closedAt:` only AFTER the closing `---`, not inside
        //   the frontmatter block. The pre-fix regex-on-whole-doc helper falsely reported
        //   {ok:true, missing:[]}. The gray-matter parse correctly reports both keys missing.
        const content = '---\nnumber: 1\n---\nclosed:\nclosedAt:\n';

        const result = verifyFrontmatterIntegrity(content, ['closed', 'closedAt']);

        expect(result.ok).toBe(false);
        expect(result.missing).toEqual(['closed', 'closedAt']);
    });

    test('verifyFrontmatterIntegrity: handles malformed frontmatter defensively', () => {
        const content = 'No frontmatter at all, just body text.';

        const result = verifyFrontmatterIntegrity(content, ['number', 'closed']);

        expect(result.ok).toBe(false);
        expect(result.missing).toEqual(['number', 'closed']);
    });

    test('verifyFrontmatterIntegrity: handles keys with special characters via hasOwnProperty (no regex needed)', () => {
        const content = "---\nweird-key: value\n---\nBody.";

        const result = verifyFrontmatterIntegrity(content, ['weird-key']);

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
