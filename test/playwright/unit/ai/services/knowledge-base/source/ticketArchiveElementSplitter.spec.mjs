import {test, expect}               from '@playwright/test';
import {splitTicketArchiveMarkdown} from '../../../../../../../ai/services/knowledge-base/source/ticketArchiveElementSplitter.mjs';

// Pure splitter (no I/O) — direct import, mirrors parseAgentEnvelope.spec / detectionRetentionSla.spec.
// Boundary format V-B-A'd across the issue archive: `## Timeline` body->comments boundary +
// `### @author - <ISO>` comment delimiter (709/711 files carry Timeline; 2 are body-only).

const BODY = `---
id: 14063
title: Sample
---
# Sample Issue

## Context
Some body text.

## Related
- #14039`;

test.describe('splitTicketArchiveMarkdown', () => {
    test('no-comment ticket (no ## Timeline) -> single body element equal to the whole content', () => {
        const els = splitTicketArchiveMarkdown(BODY);
        expect(els).toHaveLength(1);
        expect(els[0]).toEqual({kind: 'body', ordinal: 0, content: BODY});
    });

    test('body + single comment -> body element + one comment element', () => {
        const content = `${BODY}

## Timeline

### @neo-gpt - 2026-06-26T02:20:08Z

First comment body.`;
        const els = splitTicketArchiveMarkdown(content);
        expect(els).toHaveLength(2);
        expect(els[0]).toMatchObject({kind: 'body', ordinal: 0});
        expect(els[0].content).toContain('## Context');
        expect(els[0].content).toContain('## Timeline');
        expect(els[0].content).not.toContain('First comment body');
        expect(els[1]).toMatchObject({kind: 'comment', ordinal: 1});
        expect(els[1].content).toContain('### @neo-gpt - 2026-06-26T02:20:08Z');
        expect(els[1].content).toContain('First comment body.');
    });

    test('multiple comments -> body + N comments in document order', () => {
        const content = `${BODY}

## Timeline

### @neo-opus-vega - 2026-06-26T02:16:08Z

Comment one.

### @neo-gpt - 2026-06-26T02:20:08Z

Comment two.`;
        const els = splitTicketArchiveMarkdown(content);
        expect(els.map(e => e.kind)).toEqual(['body', 'comment', 'comment']);
        expect(els.map(e => e.ordinal)).toEqual([0, 1, 2]);
        expect(els[1].content).toContain('Comment one.');
        expect(els[1].content).not.toContain('Comment two.');
        expect(els[2].content).toContain('@neo-gpt');
        expect(els[2].content).toContain('Comment two.');
    });

    test('comment containing its own ##/### headings stays ONE comment (split only on the author-timestamp delimiter)', () => {
        const content = `${BODY}

## Timeline

### @neo-gpt - 2026-06-26T02:20:08Z

## Intake classification
Some structured comment.

### Sub-heading inside the comment
More text.

### @neo-opus-vega - 2026-06-26T03:00:00Z

Second comment.`;
        const els = splitTicketArchiveMarkdown(content);
        expect(els.map(e => e.kind)).toEqual(['body', 'comment', 'comment']);
        expect(els[1].content).toContain('## Intake classification');
        expect(els[1].content).toContain('### Sub-heading inside the comment');
        expect(els[1].content).toContain('More text.');
        expect(els[1].content).not.toContain('Second comment.');
        expect(els[2].content).toContain('Second comment.');
    });

    test('event-only Timeline (no comment delimiter) -> single body element conserving the event rows (#14065 RC)', () => {
        const content = `${BODY}

## Timeline

- referenced in commit abc1234 on 2026-06-26T02:00:00Z
- @tobiu added the bug label`;
        const els = splitTicketArchiveMarkdown(content);
        expect(els).toHaveLength(1);
        expect(els[0].kind).toBe('body');
        // Conservation: a Timeline with only event rows (no ### @author comment) is NOT dropped —
        // the heading + event rows stay in the body.
        expect(els[0].content).toContain('## Timeline');
        expect(els[0].content).toContain('referenced in commit abc1234');
        expect(els[0].content).toContain('@tobiu added the bug label');
        expect(els[0].content).toBe(content.trimEnd());
    });

    test('throws on non-string content', () => {
        for (const bad of [undefined, null, 42, {}, []]) {
            expect(() => splitTicketArchiveMarkdown(bad)).toThrow('content must be a string');
        }
    });
});
