import {test, expect}               from '@playwright/test';
import {synthesizeTemporalBirdView} from '../../../../../../ai/services/memory-core/helpers/temporalBirdViewSynthesizer.mjs';

const GEN_ISO = '2026-07-12T12:00:00.000Z',
      NOW_ISO = '2026-07-12T12:00:00.000Z',
      SOURCES = [{id: 'session-a', type: 'session'}, {id: 'session-b', type: 'session'}],
      // a retrieval that reports COMPLETE coverage (chronological spine exhausted) over 2 sources
      complete = () => ({sources: SOURCES, coverage: {totalResolved: 2}});

test.describe('temporalBirdViewSynthesizer — the fail-open, no-inference-over-incomplete-coverage orchestrator', () => {
    test('happy path: complete coverage + a narrative → full envelope, narrative present', async () => {
        const envelope = await synthesizeTemporalBirdView({
            preset     : 'weekly',
            now        : NOW_ISO,
            generatedAt: GEN_ISO,
            retrieve   : async () => complete(),
            synthesize : async () => 'Two sessions this week: a and b.'
        });

        expect(envelope.synthesisAvailable).toBe(true);
        expect(envelope.synthesis).toBe('Two sessions this week: a and b.');
        expect(envelope.coverage.totalResolved).toBe(2);
        expect(envelope.window.preset).toBe('weekly');
        expect(envelope.notAuthority).toBe(true)
    });

    test('structured synthesis result carries inference inputs + optional details through the envelope', async () => {
        const synthesisDetails = {themes: [{label: 'memory continuity', sourceIds: ['session-a']}]},
              envelope         = await synthesizeTemporalBirdView({
                  preset     : 'weekly',
                  now        : NOW_ISO,
                  generatedAt: GEN_ISO,
                  retrieve   : async () => complete(),
                  synthesize : async () => ({
                      narrative        : 'Two sessions this week: a and b.',
                      inferenceInputIds: ['session-a'],
                      synthesisDetails
                  })
              });

        expect(envelope.synthesisDetails).toEqual(synthesisDetails);
        expect(envelope.coverage.synthesisInputCount).toBe(1);
        expect(envelope.citations.find(citation => citation.id === 'session-a').inSynthesis).toBe(true);
        expect(envelope.citations.find(citation => citation.id === 'session-b').inSynthesis).toBe(false)
    });

    test('retrieval failure is fail-open → degraded envelope, and synthesize is NEVER called', async () => {
        let synthesizeCalls = 0;

        const envelope = await synthesizeTemporalBirdView({
            preset    : 'weekly',
            now       : NOW_ISO,
            retrieve  : async () => { throw new Error('memory core unreachable') },
            synthesize: async () => { synthesizeCalls++; return 'x' }
        });

        expect(envelope.synthesisAvailable).toBe(false);
        expect(envelope.coverage.degraded).toBe(true);
        expect(envelope.coverage.degradedReason).toMatch(/^retrieval-failed: memory core unreachable/);
        expect(synthesizeCalls).toBe(0)
    });

    test('incomplete coverage skips the LLM entirely — synthesize is not called, the narrative is withheld', async () => {
        let synthesizeCalls = 0;

        const envelope = await synthesizeTemporalBirdView({
            preset: 'weekly',
            now   : NOW_ISO,
            // retrieval proved 5 exist but only returned 2 (an unexhausted recency page) → incomplete
            retrieve  : async () => ({sources: SOURCES, coverage: {totalResolved: 5}}),
            synthesize: async () => { synthesizeCalls++; return 'a story over a partial read' }
        });

        expect(envelope.synthesisAvailable).toBe(false);
        expect(envelope.coverage.excluded).toBe(3);
        expect(envelope.coverage.degradedReason).toBe('incomplete-inclusion');
        expect(synthesizeCalls, 'no LLM call is paid for over incomplete coverage').toBe(0)
    });

    test('synthesis failure is fail-open → degraded with the failure reason, coverage evidence preserved', async () => {
        const envelope = await synthesizeTemporalBirdView({
            preset    : 'weekly',
            now       : NOW_ISO,
            retrieve  : async () => complete(),
            synthesize: async () => { throw new Error('provider timeout') }
        });

        expect(envelope.synthesisAvailable).toBe(false);
        expect(envelope.coverage.degradedReason).toMatch(/^synthesis-failed: provider timeout/);
        // the coverage manifest survives the synthesis failure — a Bird View still reports WHAT was found
        expect(envelope.coverage.totalResolved).toBe(2);
        expect(envelope.citations).toHaveLength(2)
    });

    test('an invalid window request PROPAGATES (a caller error, not a degraded synthesis)', async () => {
        await expect(synthesizeTemporalBirdView({
            preset    : 'fortnightly',   // unknown preset
            now       : NOW_ISO,
            retrieve  : async () => complete(),
            synthesize: async () => 'x'
        })).rejects.toThrow(/unknown grain preset/)
    });

    test('generatedAt defaults to the run clock (now) when omitted', async () => {
        const envelope = await synthesizeTemporalBirdView({
            preset    : 'weekly',
            now       : NOW_ISO,
            retrieve  : async () => complete(),
            synthesize: async () => 'story'
        });

        expect(envelope.generatedAt).toBe(NOW_ISO)
    });

    test('the injected retrieve + synthesize seams are required', async () => {
        await expect(synthesizeTemporalBirdView({preset: 'weekly', now: NOW_ISO, synthesize: async () => 'x'})).rejects.toThrow(/`retrieve`/);
        await expect(synthesizeTemporalBirdView({preset: 'weekly', now: NOW_ISO, retrieve: async () => complete()})).rejects.toThrow(/`synthesize`/)
    })
});
