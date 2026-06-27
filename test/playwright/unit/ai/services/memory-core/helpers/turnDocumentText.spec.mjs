import {test, expect}                                        from '@playwright/test';
import Neo                                                   from '../../../../../../../src/Neo.mjs';
import * as core                                             from '../../../../../../../src/core/_export.mjs';
import {composeTurnDocumentText, resolveTurnDocumentForRead} from '../../../../../../../ai/services/memory-core/helpers/turnDocumentText.mjs';

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

test.describe('resolveTurnDocumentForRead — read-side stored-or-reconstruct (#14193 slice-3)', () => {
    test('prefers the stored document when present (byte-exact, no reconstruction)', () => {
        const stored = 'User Prompt: stored\nAgent Thought: x\nAgent Response: y';
        // stored wins; the metadata is NOT used to reconstruct when a document exists (behavior-preserving)
        expect(resolveTurnDocumentForRead({documents: [stored], metadata: {type: 'agent-interaction', prompt: 'OTHER'}}))
            .toBe(stored)
    });

    test('reconstructs a turn from split metadata when the document is dropped (byte-identical to compose)', () => {
        expect(resolveTurnDocumentForRead({
            documents: [null],
            metadata : {type: 'agent-interaction', prompt: 'p', thought: 't', response: 'r'}
        })).toBe(composeTurnDocumentText({prompt: 'p', thought: 't', response: 'r'}))
    });

    test('reconstructs identically across dropped-doc shapes ([null] / [] / undefined)', () => {
        const meta     = {type: 'agent-interaction', prompt: 'p', thought: 't', response: 'r'},
              expected = composeTurnDocumentText({prompt: 'p', thought: 't', response: 'r'});
        expect(resolveTurnDocumentForRead({documents: [null],     metadata: meta})).toBe(expected);
        expect(resolveTurnDocumentForRead({documents: [],         metadata: meta})).toBe(expected);
        expect(resolveTurnDocumentForRead({documents: undefined,  metadata: meta})).toBe(expected)
    });

    test('NEVER reconstructs a non-turn (summary) — returns its stored document, else null', () => {
        const summaryDoc = 'a distinct summary shape';
        expect(resolveTurnDocumentForRead({documents: [summaryDoc], metadata: {type: 'session-summary'}})).toBe(summaryDoc);
        // a summary with a dropped document → null (NOT reconstructed via the turn template — distinct shape)
        expect(resolveTurnDocumentForRead({documents: [null], metadata: {type: 'session-summary', prompt: 'x'}})).toBe(null)
    });

    test('returns null when neither a stored document nor turn metadata is available (total, never throws)', () => {
        expect(resolveTurnDocumentForRead({documents: [null], metadata: null})).toBe(null);
        expect(resolveTurnDocumentForRead({})).toBe(null);
        expect(resolveTurnDocumentForRead()).toBe(null)
    })
});
