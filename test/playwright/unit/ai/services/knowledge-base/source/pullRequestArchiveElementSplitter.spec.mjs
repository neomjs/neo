import {test, expect}                    from '@playwright/test';
import {splitPullRequestArchiveMarkdown} from '../../../../../../../ai/services/knowledge-base/source/pullRequestArchiveElementSplitter.mjs';

// Pure splitter (no I/O) — direct import, mirrors ticketArchiveElementSplitter.spec.
// Boundary contract (V-B-A'd): elements start at the backtick-author delimiters — "(STATE) reviewed on
// <ISO>" (review) / "commented on <ISO>" (comment); the body runs until the FIRST such delimiter, so a
// bare `## Reviews`/`## Comments` heading without a delimiter stays body content (conservation).

const BODY = `---
id: 14067
title: Sample PR
---
# Sample PR

Resolves #14033

## Test Evidence
- npm test passed

## Commits
- abc123`;

test.describe('splitPullRequestArchiveMarkdown', () => {
    test('no-discussion PR (no ## Reviews/## Comments) -> single body element equal to the whole content', () => {
        const els = splitPullRequestArchiveMarkdown(BODY);
        expect(els).toHaveLength(1);
        expect(els[0]).toEqual({kind: 'body', ordinal: 0, content: BODY});
    });

    test('body + reviews only -> body + per-review elements; body keeps its own ## sections', () => {
        const content = `${BODY}

## Reviews

### \`@tobiu\` (APPROVED) reviewed on 2026-06-25T21:02:56Z

LGTM.

### \`@neo-gpt\` (CHANGES_REQUESTED) reviewed on 2026-06-25T22:00:00Z

One fix needed.`;
        const els = splitPullRequestArchiveMarkdown(content);
        expect(els.map(e => `${e.kind}-${e.ordinal}`)).toEqual(['body-0', 'review-1', 'review-2']);
        expect(els[0].content).toContain('## Test Evidence');
        expect(els[0].content).toContain('## Reviews');
        expect(els[0].content).not.toContain('LGTM');
        expect(els[1].content).toContain('@tobiu');
        expect(els[1].content).toContain('LGTM.');
        expect(els[1].content).not.toContain('One fix needed');
        expect(els[2].content).toContain('@neo-gpt');
        expect(els[2].content).toContain('One fix needed.');
    });

    test('both ## Comments and ## Reviews -> comments + reviews captured with independent ordinals', () => {
        const content = `${BODY}

## Comments

### \`@neo-gpt\` commented on 2026-06-25T18:54:58Z

A comment.

## Reviews

### \`@tobiu\` (APPROVED) reviewed on 2026-06-25T21:02:56Z

Approved.`;
        const els = splitPullRequestArchiveMarkdown(content);
        expect(els.map(e => `${e.kind}-${e.ordinal}`)).toEqual(['body-0', 'comment-1', 'review-1']);
        expect(els[1].content).toContain('A comment.');
        expect(els[1].content).not.toContain('Approved.');
        expect(els[2].content).toContain('Approved.');
    });

    test('a discussion element containing its own ##/### headings stays ONE element', () => {
        const content = `${BODY}

## Reviews

### \`@neo-gpt\` (COMMENTED) reviewed on 2026-06-25T22:00:00Z

## Sub-section in the review
Detail line.

### Another heading
More.`;
        const els = splitPullRequestArchiveMarkdown(content);
        expect(els.map(e => e.kind)).toEqual(['body', 'review']);
        expect(els[1].content).toContain('## Sub-section in the review');
        expect(els[1].content).toContain('### Another heading');
        expect(els[1].content).toContain('More.');
    });

    test('section heading with no delimiter entries -> single body element conserving the heading + content', () => {
        const content = `${BODY}

## Reviews

(no formal reviews recorded yet)`;
        const els = splitPullRequestArchiveMarkdown(content);
        expect(els).toHaveLength(1);
        expect(els[0].kind).toBe('body');
        // Conservation: a section heading with no backtick-author delimiter entry is NOT dropped —
        // the heading + any pre-delimiter content stays in the body.
        expect(els[0].content).toContain('## Reviews');
        expect(els[0].content).toContain('(no formal reviews recorded yet)');
        expect(els[0].content).toBe(content.trimEnd());
    });

    test('throws on non-string content', () => {
        for (const bad of [undefined, null, 42, {}, []]) {
            expect(() => splitPullRequestArchiveMarkdown(bad)).toThrow('content must be a string');
        }
    });
});
