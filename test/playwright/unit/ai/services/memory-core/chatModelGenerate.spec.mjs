import {test, expect}          from '@playwright/test';
import {makeChatModelGenerate} from '../../../../../../ai/services/memory-core/helpers/chatModelGenerate.mjs';

// a stub chat model mirroring the buildChatModel contract: generateContent(prompt, opts) -> {response:{text()}}
const stubModel = (text, capture) => ({
    generateContent: async (prompt, opts) => {
        capture?.({prompt, opts});
        return {response: {text: () => text}}
    }
});

test.describe('chatModelGenerate — the buildChatModel -> generate seam (fails loud for synthesis)', () => {
    test('builds the model, passes the prompt + opts to generateContent, returns the extracted text', async () => {
        let seen = null;

        const generate = makeChatModelGenerate({buildModel: () => stubModel('a bird view narrative', c => { seen = c }), timeoutMs: 5000}),
              text     = await generate({prompt: 'summarize the window'});

        expect(text).toBe('a bird view narrative');
        expect(seen.prompt).toBe('summarize the window');
        expect(seen.opts).toMatchObject({timeoutMs: 5000, operationLabel: 'temporal bird view synthesis', priority: 'interactive'})
    });

    test('a null model (no configured provider) throws — synthesis degrades rather than emitting empty prose', async () => {
        const generate = makeChatModelGenerate({buildModel: () => null});

        await expect(generate({prompt: 'x'})).rejects.toThrow(/no chat model provider is configured/)
    });

    test('an empty/whitespace-less completion throws (no text extracted)', async () => {
        const emptyString = makeChatModelGenerate({buildModel: () => stubModel('')}),
              nullText    = makeChatModelGenerate({buildModel: () => ({generateContent: async () => ({response: {text: () => null}})})});

        await expect(emptyString({prompt: 'x'})).rejects.toThrow(/returned no text/);
        await expect(nullText({prompt: 'x'})).rejects.toThrow(/returned no text/)
    });

    test('a response missing the text() accessor throws rather than returning undefined', async () => {
        const generate = makeChatModelGenerate({buildModel: () => ({generateContent: async () => ({response: {}})})});

        await expect(generate({prompt: 'x'})).rejects.toThrow(/returned no text/)
    });

    test('the injected buildModel is required', () => {
        expect(() => makeChatModelGenerate({})).toThrow(/buildModel/)
    })
});
