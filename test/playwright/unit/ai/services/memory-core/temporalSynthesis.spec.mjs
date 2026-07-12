import {test, expect}                                                                  from '@playwright/test';
import {buildTemporalSynthesisPrompt, makeTemporalSynthesize, selectSynthesisInputIds} from '../../../../../../ai/services/memory-core/helpers/temporalSynthesis.mjs';

const WINDOW = {partition: '@ada', windowStartIso: '2026-07-05T00:00:00.000Z', windowEndIso: '2026-07-12T00:00:00.000Z'};

test.describe('temporalSynthesis — the §-fidelity prompt + injected-generate seam', () => {
    test('the prompt states the half-open window + partition, foregrounds prominent ids, and enumerates context facts', () => {
        const prompt = buildTemporalSynthesisPrompt({
            window : WINDOW,
            sources: [
                {id: 'session-hi', type: 'session', impact: 95, title: 'the big call'},
                {id: 'session-lo', type: 'session', impact: 10, summary: 'a routine dependency bump'},
                {id: 'adr-28',     type: 'adr', accepted: true}
            ],
            themes: [{id: 'm1', document: 'a recurring friction theme'}]
        });

        expect(prompt).toContain('[2026-07-05T00:00:00.000Z, 2026-07-12T00:00:00.000Z)');
        expect(prompt).toContain('partition "@ada"');
        // prominent (impact>=90 session + accepted ADR) are foregrounded by id
        expect(prompt).toContain('session-hi: the big call');
        expect(prompt).toContain('adr-28');
        // the low-impact session is CONTEXT — now ENUMERATED with its fact (the model sees what it was
        // about, so it cannot cite past a bare count), while still not being in the PROMINENT block.
        expect(prompt).toContain('session-lo: a routine dependency bump');
        expect(prompt).toMatch(/CONTEXT — further in-window sources/);
        expect(prompt).toContain('a recurring friction theme');
        // fidelity: cite prominent + no invention
        expect(prompt).toMatch(/Cite prominent sources by id/);
        expect(prompt).toMatch(/do not invent/)
    });

    test('an empty window renders honestly (no prominent, no themes) without crashing', () => {
        const prompt = buildTemporalSynthesisPrompt({window: WINDOW, sources: [], themes: []});

        expect(prompt).toContain('- (none)');
        expect(prompt).toContain('- (none surfaced)');
        expect(prompt).toMatch(/CONTEXT — further in-window sources/)
    });

    test('makeTemporalSynthesize passes the prompt to generate and returns {narrative, inferenceInputIds}', async () => {
        let seenPrompt = null;

        const fromString  = makeTemporalSynthesize({generate: async ({prompt}) => { seenPrompt = prompt; return 'a narrative' }}),
              fromContent = makeTemporalSynthesize({generate: async () => ({content: 'wrapped narrative'})});

        // the manifest reports the ids the prompt actually enumerated — its inference inputs
        expect(await fromString({window: WINDOW, sources: [{id: 'x', type: 'session', impact: 99}]}))
            .toEqual({narrative: 'a narrative', inferenceInputIds: ['x']});
        expect(seenPrompt).toContain('partition "@ada"');
        expect(await fromContent({window: WINDOW})).toEqual({narrative: 'wrapped narrative', inferenceInputIds: []})
    });

    test('selectSynthesisInputIds is the bounded prompt subset — the census-vs-inference boundary on a large window', () => {
        // 70 context (non-prominent) sources exceed the 60-enumeration bound; 2 prominent are always cited.
        const context   = Array.from({length: 70}, (_, i) => ({id: `ctx-${i}`, type: 'memory', impact: 10})),
              prominent = [{id: 'hot-a', type: 'session', impact: 99}, {id: 'hot-b', type: 'session', impact: 95}],
              inputIds  = selectSynthesisInputIds([...prominent, ...context]);

        // prominent (2, both cited) + the first 60 context = 62 inference inputs, NOT the full 72-source census
        expect(inputIds).toHaveLength(62);
        expect(inputIds).toEqual(expect.arrayContaining(['hot-a', 'hot-b', 'ctx-0', 'ctx-59']));
        expect(inputIds).not.toContain('ctx-60')
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
