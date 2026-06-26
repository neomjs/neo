import {test, expect}                   from '@playwright/test';
import {splitDiscussionArchiveMarkdown} from '../../../../../../../ai/services/knowledge-base/source/discussionArchiveElementSplitter.mjs';

// Pure splitter (no I/O) — direct import, mirrors ticket/PR splitter specs.
// Discussion format V-B-A'd: converged-model body until the first backtick-author "commented on <ISO>"
// delimiter (same as PR comments); conservation = split only on the delimiter, nothing dropped.

const BODY = `---
id: 13594
title: Sample discussion
---
# Sample discussion

## Converged Model
The agreed shape.

## Decision Record
- decided X`;

test.describe('splitDiscussionArchiveMarkdown', () => {
    test('no-comment discussion -> single body element equal to the whole content', () => {
        const els = splitDiscussionArchiveMarkdown(BODY);
        expect(els).toHaveLength(1);
        expect(els[0]).toEqual({kind: 'body', ordinal: 0, content: BODY});
    });

    test('body + comments -> body + per-comment elements; body keeps its converged-model sections', () => {
        const content = `${BODY}

## Comments

### \`@neo-gpt\` commented on 2026-06-20T05:13:58Z

First reply.

### \`@neo-opus-ada\` commented on 2026-06-20T05:22:13Z

Second reply.`;
        const els = splitDiscussionArchiveMarkdown(content);
        expect(els.map(e => `${e.kind}-${e.ordinal}`)).toEqual(['body-0', 'comment-1', 'comment-2']);
        expect(els[0].content).toContain('## Converged Model');
        expect(els[0].content).toContain('## Comments');
        expect(els[0].content).not.toContain('First reply');
        expect(els[1].content).toContain('@neo-gpt');
        expect(els[1].content).toContain('First reply.');
        expect(els[1].content).not.toContain('Second reply.');
        expect(els[2].content).toContain('@neo-opus-ada');
        expect(els[2].content).toContain('Second reply.');
    });

    test('a comment containing its own ##/### headings stays ONE comment', () => {
        const content = `${BODY}

## Comments

### \`@neo-gpt\` commented on 2026-06-20T05:13:58Z

## A heading inside the comment
Detail.

### Another sub-heading
More.

### \`@neo-opus-vega\` commented on 2026-06-20T06:00:00Z

Next reply.`;
        const els = splitDiscussionArchiveMarkdown(content);
        expect(els.map(e => e.kind)).toEqual(['body', 'comment', 'comment']);
        expect(els[1].content).toContain('## A heading inside the comment');
        expect(els[1].content).toContain('### Another sub-heading');
        expect(els[1].content).toContain('More.');
        expect(els[1].content).not.toContain('Next reply.');
        expect(els[2].content).toContain('Next reply.');
    });

    test('section content with no comment delimiter -> single body element conserving everything', () => {
        const content = `${BODY}

## Unresolved Dissent
- @x disagrees on Y`;
        const els = splitDiscussionArchiveMarkdown(content);
        expect(els).toHaveLength(1);
        expect(els[0].kind).toBe('body');
        // Conservation: section content with no backtick-author delimiter is NOT dropped.
        expect(els[0].content).toContain('## Unresolved Dissent');
        expect(els[0].content).toContain('@x disagrees on Y');
        expect(els[0].content).toBe(content.trimEnd());
    });

    test('throws on non-string content', () => {
        for (const bad of [undefined, null, 42, {}, []]) {
            expect(() => splitDiscussionArchiveMarkdown(bad)).toThrow('content must be a string');
        }
    });
});
