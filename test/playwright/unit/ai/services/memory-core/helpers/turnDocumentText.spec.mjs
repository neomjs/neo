import {test, expect}            from '@playwright/test';
import Neo                       from '../../../../../../../src/Neo.mjs';
import * as core                 from '../../../../../../../src/core/_export.mjs';
import {composeTurnDocumentText} from '../../../../../../../ai/services/memory-core/helpers/turnDocumentText.mjs';

// Pure derivation (no I/O). Composes the canonical turn-document text from a turn's split fields — the
// single source of the `User Prompt: … / Agent Thought: … / Agent Response: …` representation that the
// field↔document de-dup reconstructs on read in place of a redundant stored copy.

test.describe('turnDocumentText — canonical turn-document derivation', () => {
    test('composes the exact User Prompt / Agent Thought / Agent Response format', () => {
        expect(composeTurnDocumentText({prompt: 'p', thought: 't', response: 'r'}))
            .toBe('User Prompt: p\nAgent Thought: t\nAgent Response: r')
    });

    test('is byte-identical to the inline construction it single-sources (the de-dup invariant)', () => {
        // The exact construction performed inline at the MemoryService write path. Reconstruct-on-read MUST
        // match this byte-for-byte, or any content fingerprint/hash over the document breaks.
        const prompt   = 'Fix the rotation bug',
              thought  = 'two writers share the log',
              response = 'guarded both';
        const inline = `User Prompt: ${prompt}\nAgent Thought: ${thought}\nAgent Response: ${response}`;
        expect(composeTurnDocumentText({prompt, thought, response})).toBe(inline)
    });

    test('preserves newlines and label-like text inside field values (plain join, no parsing)', () => {
        const prompt   = 'line1\nline2',
              thought  = 'has Agent Response: inside it',
              response = 'multi\nline\nresponse';
        expect(composeTurnDocumentText({prompt, thought, response}))
            .toBe('User Prompt: line1\nline2\nAgent Thought: has Agent Response: inside it\nAgent Response: multi\nline\nresponse')
    });

    test('is deterministic — identical fields yield an identical string', () => {
        const fields = {prompt: 'a', thought: 'b', response: 'c'};
        expect(composeTurnDocumentText(fields)).toBe(composeTurnDocumentText(fields))
    });

    test('coerces values exactly as the template literal does — no added defaults that diverge output', () => {
        // Matches the original construction's behavior for the same inputs; no guards that would change bytes.
        expect(composeTurnDocumentText({prompt: 1, thought: true, response: null}))
            .toBe('User Prompt: 1\nAgent Thought: true\nAgent Response: null')
    })
});
