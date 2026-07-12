import {test, expect}                                         from '@playwright/test';
import {buildTemporalSynthesisPrompt, makeTemporalSynthesize} from '../../../../../../ai/services/memory-core/helpers/temporalSynthesis.mjs';

const WINDOW = {partition: '@ada', windowStartIso: '2026-07-05T00:00:00.000Z', windowEndIso: '2026-07-12T00:00:00.000Z'};

test.describe('temporalSynthesis — the §-fidelity prompt + injected-generate seam', () => {
    test('the prompt states the half-open window + partition, foregrounds prominent ids, and bounds context to a count', () => {
        const prompt = buildTemporalSynthesisPrompt({
            window : WINDOW,
            sources: [
                {id: 'session-hi', type: 'session', impact: 95, title: 'the big call'},
                {id: 'session-lo', type: 'session', impact: 10},
                {id: 'adr-28',     type: 'adr', accepted: true}
            ],
            themes: [{id: 'm1', document: 'a recurring friction theme'}]
        });

        expect(prompt).toContain('[2026-07-05T00:00:00.000Z, 2026-07-12T00:00:00.000Z)');
        expect(prompt).toContain('partition "@ada"');
        // prominent (impact>=90 session + accepted ADR) are foregrounded by id
        expect(prompt).toContain('session-hi: the big call');
        expect(prompt).toContain('adr-28');
        // the low-impact session is CONTEXT (a count), not foregrounded by id
        expect(prompt).not.toContain('session-lo');
        expect(prompt).toContain('CONTEXT: 1 further admitted source');
        expect(prompt).toContain('a recurring friction theme');
        // fidelity: cite prominent + no invention
        expect(prompt).toMatch(/Cite prominent sources by id/);
        expect(prompt).toMatch(/do not invent/)
    });

    test('an empty window renders honestly (no prominent, no themes) without crashing', () => {
        const prompt = buildTemporalSynthesisPrompt({window: WINDOW, sources: [], themes: []});

        expect(prompt).toContain('- (none)');
        expect(prompt).toContain('- (none surfaced)');
        expect(prompt).toContain('CONTEXT: 0 further admitted source')
    });

    test('makeTemporalSynthesize passes the prompt to generate and returns the narrative (string or {content})', async () => {
        let seenPrompt = null;

        const fromString  = makeTemporalSynthesize({generate: async ({prompt}) => { seenPrompt = prompt; return 'a narrative' }}),
              fromContent = makeTemporalSynthesize({generate: async () => ({content: 'wrapped narrative'})});

        expect(await fromString({window: WINDOW, sources: [{id: 'x', type: 'session', impact: 99}]})).toBe('a narrative');
        expect(seenPrompt).toContain('partition "@ada"');
        expect(await fromContent({window: WINDOW})).toBe('wrapped narrative')
    });

    test('a generation that yields no narrative throws — the orchestrator will degrade the envelope', async () => {
        const empty   = makeTemporalSynthesize({generate: async () => ''}),
              nullish = makeTemporalSynthesize({generate: async () => ({content: null})});

        await expect(empty({window: WINDOW})).rejects.toThrow(/no narrative/);
        await expect(nullish({window: WINDOW})).rejects.toThrow(/no narrative/)
    });

    test('the injected generate is required', () => {
        expect(() => makeTemporalSynthesize({})).toThrow(/generate/)
    })
});
