import {test, expect}                  from '@playwright/test';
import {buildTemporalBirdViewEnvelope} from '../../../../../../ai/services/memory-core/helpers/temporalBirdViewEnvelope.mjs';

const GEN_ISO = '2026-07-12T12:00:00.000Z',
      // a minimal resolved-window stand-in (the resolver's shape is covered by its own spec)
      WINDOW  = {preset: 'weekly', tier: 'L3', windowStart: 1, windowEnd: 2, windowSemantics: {interval: 'half-open'}},
      SOURCES = [
          {id: 'pr-100',      type: 'pull-request', ref: 'merged'},
          {id: 'session-abc', type: 'session'}
      ];

test.describe('temporalBirdViewEnvelope — the non-authoritative coverage/citation discipline layer', () => {
    test('complete coverage + a narrative → synthesisAvailable, narrative present, notAuthority stamped', () => {
        const envelope = buildTemporalBirdViewEnvelope({
            window     : WINDOW,
            sources    : SOURCES,
            narrative  : 'Two items resolved: a merged PR and a session.',
            coverage   : {totalResolved: 2},
            generatedAt: GEN_ISO
        });

        expect(envelope.synthesisAvailable).toBe(true);
        expect(envelope.synthesis).toBe('Two items resolved: a merged PR and a session.');
        expect(envelope.synthesisUnavailableReason).toBeNull();
        expect(envelope.coverage).toMatchObject({totalResolved: 2, included: 2, excluded: 0, truncated: false, degraded: false});
        expect(envelope.notAuthority).toBe(true);
        expect(envelope.generatedAt).toBe(GEN_ISO)
    });

    test('exposes per-type counts + sessionId drill-down so a caller can pivot from the census into the source', () => {
        const envelope = buildTemporalBirdViewEnvelope({
            window : WINDOW,
            sources: [
                {id: 'mem-1',       type: 'memory',  sessionId: 'sess-1'},
                {id: 'mem-2',       type: 'memory',  sessionId: 'sess-2'},
                {id: 'session-abc', type: 'session', sessionId: 'sess-abc'}
            ],
            narrative  : 'stuff happened',
            coverage   : {totalResolved: 3},
            generatedAt: GEN_ISO
        });

        expect(envelope.coverage.sourceTypeCounts).toEqual({memory: 2, session: 1});
        expect(envelope.citations.find(c => c.id === 'mem-1')).toMatchObject({type: 'memory', sessionId: 'sess-1'})
    });

    test('census-vs-inference: an inferenceInputIds manifest marks each citation inSynthesis + reports the input count', () => {
        const envelope = buildTemporalBirdViewEnvelope({
            window : WINDOW,
            sources: [
                {id: 'in-1',  type: 'memory'},
                {id: 'in-2',  type: 'memory'},
                {id: 'census-only', type: 'memory'}   // resolved into coverage but NOT enumerated in the synthesis
            ],
            narrative        : 'built from the two inference inputs',
            coverage         : {totalResolved: 3},
            inferenceInputIds: ['in-1', 'in-2'],
            generatedAt      : GEN_ISO
        });

        // census stays 3; the narrative was built from 2 — a caller can tell inference inputs from the census
        expect(envelope.coverage.totalResolved).toBe(3);
        expect(envelope.coverage.synthesisInputCount).toBe(2);
        expect(envelope.citations.find(c => c.id === 'in-1').inSynthesis).toBe(true);
        expect(envelope.citations.find(c => c.id === 'census-only').inSynthesis).toBe(false)
    });

    test('no inferenceInputIds manifest → citations stay unmarked (no false inSynthesis claim)', () => {
        const envelope = buildTemporalBirdViewEnvelope({window: WINDOW, sources: SOURCES, coverage: {totalResolved: 2}, generatedAt: GEN_ISO});

        expect(envelope.coverage.synthesisInputCount).toBeUndefined();
        expect(envelope.citations.every(c => !('inSynthesis' in c))).toBe(true)
    });

    test('citations carry per-source type/id/ref for drill-down', () => {
        const envelope = buildTemporalBirdViewEnvelope({window: WINDOW, sources: SOURCES, coverage: {totalResolved: 2}, generatedAt: GEN_ISO});

        expect(envelope.citations).toEqual([
            {type: 'pull-request', id: 'pr-100', ref: 'merged'},
            {type: 'session',      id: 'session-abc'}
        ])
    });

    test('citation allowlist preserves explicit revision + structured drillDown, but not arbitrary source fields', () => {
        const envelope = buildTemporalBirdViewEnvelope({
            window : WINDOW,
            sources: [{
                id       : 'pr-100',
                type     : 'pull-request',
                revision : 'head-abc',
                drillDown: {
                    operation: 'get_conversation',
                    arguments: {pr_number: 100},
                    body     : 'must not leak from the descriptor'
                },
                body     : 'must not leak into a citation'
            }],
            coverage   : {totalResolved: 1},
            generatedAt: GEN_ISO
        });

        expect(envelope.citations).toEqual([{
            type     : 'pull-request',
            id       : 'pr-100',
            revision : 'head-abc',
            drillDown: {operation: 'get_conversation', arguments: {pr_number: 100}}
        }]);
        expect(envelope.citations[0].body).toBeUndefined()
    });

    test('citation projection rejects object revisions and malformed drill-down payloads', () => {
        const cyclic = {};
        cyclic.self  = cyclic;

        const envelope = buildTemporalBirdViewEnvelope({
            window : WINDOW,
            sources: [{
                id       : 'pr-101',
                revision : {secret: 'not a scalar'},
                drillDown: {operation: 'get_conversation', arguments: cyclic, secret: 'not projected'}
            }],
            coverage   : {totalResolved: 1},
            generatedAt: GEN_ISO
        });

        expect(envelope.citations).toEqual([{type: 'unknown', id: 'pr-101'}])
    });

    test('sourceManifestHash is deterministic AND order-independent (same set → same hash)', () => {
        const a = buildTemporalBirdViewEnvelope({window: WINDOW, sources: [{id: 'x'}, {id: 'y'}], coverage: {totalResolved: 2}, generatedAt: GEN_ISO}),
              b = buildTemporalBirdViewEnvelope({window: WINDOW, sources: [{id: 'y'}, {id: 'x'}], coverage: {totalResolved: 2}, generatedAt: GEN_ISO}),
              c = buildTemporalBirdViewEnvelope({window: WINDOW, sources: [{id: 'x'}, {id: 'z'}], coverage: {totalResolved: 2}, generatedAt: GEN_ISO});

        expect(a.sourceManifestHash).toBe(b.sourceManifestHash);
        expect(a.sourceManifestHash).not.toBe(c.sourceManifestHash);
        expect(a.sourceManifestHash).toMatch(/^[0-9a-f]{8}$/)
    });

    test('sourceManifestHash changes when the same source id has a different explicit content revision', () => {
        const first = buildTemporalBirdViewEnvelope({
                  window: WINDOW, sources: [{id: 'pr-100', revision: 'head-a'}], coverage: {totalResolved: 1}, generatedAt: GEN_ISO
              }),
              second = buildTemporalBirdViewEnvelope({
                  window: WINDOW, sources: [{id: 'pr-100', revision: 'head-b'}], coverage: {totalResolved: 1}, generatedAt: GEN_ISO
              }),
              legacy = buildTemporalBirdViewEnvelope({
                  window: WINDOW, sources: [{id: 'pr-100'}], coverage: {totalResolved: 1}, generatedAt: GEN_ISO
              });

        expect(first.sourceManifestHash).not.toBe(second.sourceManifestHash);
        expect(first.sourceManifestHash).not.toBe(legacy.sourceManifestHash)
    });

    test('sourceManifestHash frames member boundaries unambiguously', () => {
        const one = buildTemporalBirdViewEnvelope({
                  window     : WINDOW,
                  sources    : [{id: 'a', revision: 'x\nb\0revision:y'}],
                  coverage   : {totalResolved: 1},
                  generatedAt: GEN_ISO
              }),
              two = buildTemporalBirdViewEnvelope({
                  window     : WINDOW,
                  sources    : [{id: 'a', revision: 'x'}, {id: 'b', revision: 'y'}],
                  coverage   : {totalResolved: 2},
                  generatedAt: GEN_ISO
              });

        expect(one.sourceManifestHash).not.toBe(two.sourceManifestHash)
    });

    test('source-specific coverage evidence survives while canonical completeness fields are recomputed', () => {
        const childEvidence = {open: 0, resolved: 3},
              corpus        = {queried: 'github-resolved-prs'},
              envelope      = buildTemporalBirdViewEnvelope({
                  window  : WINDOW,
                  sources : SOURCES,
                  coverage: {
                      totalResolved   : 2,
                      included        : 99,
                      excluded        : 99,
                      degraded        : false,
                      sourceTypeCounts: {spoofed: 99},
                      childEvidence,
                      corpus
                  },
                  generatedAt: GEN_ISO
              });

        expect(envelope.coverage.childEvidence).toEqual(childEvidence);
        expect(envelope.coverage.corpus).toEqual(corpus);
        expect(envelope.coverage).toMatchObject({
            totalResolved   : 2,
            included        : 2,
            excluded        : 0,
            degraded        : false,
            sourceTypeCounts: {'pull-request': 1, session: 1}
        })
    });

    test('structured synthesis details are emitted only for an available synthesis', () => {
        const synthesisDetails = {themes: [{label: 'review convergence', sourceIds: ['pr-100']}]},
              complete         = buildTemporalBirdViewEnvelope({
                  window: WINDOW, sources: SOURCES, narrative: 'complete', coverage: {totalResolved: 2},
                  synthesisDetails, generatedAt: GEN_ISO
              }),
              degraded         = buildTemporalBirdViewEnvelope({
                  window: WINDOW, sources: SOURCES, narrative: 'partial', coverage: {totalResolved: 2, truncated: true},
                  synthesisDetails, generatedAt: GEN_ISO
              });

        expect(complete.synthesisDetails).toEqual(synthesisDetails);
        expect(degraded.synthesisAvailable).toBe(false);
        expect(degraded.synthesisDetails).toBeUndefined()
    });

    test.describe('completeness is proven, never assumed — the narrative is withheld on every gap', () => {
        const withGap = coverage => buildTemporalBirdViewEnvelope({
            window     : WINDOW,
            sources    : [{id: 'pr-100'}],
            narrative  : 'a confident story the caller should NOT get over a partial read',
            coverage,
            generatedAt: GEN_ISO
        });

        test('unknown totalResolved → coverage-unknown, no narrative (completeness unprovable)', () => {
            const envelope = withGap({});   // no totalResolved

            expect(envelope.synthesisAvailable).toBe(false);
            expect(envelope.synthesis).toBeNull();
            expect(envelope.coverage.degraded).toBe(true);
            expect(envelope.coverage.degradedReason).toBe('coverage-unknown')
        });

        test('truncated retrieval → source-truncated, no narrative', () => {
            const envelope = withGap({totalResolved: 1, truncated: true});

            expect(envelope.synthesisAvailable).toBe(false);
            expect(envelope.coverage.degradedReason).toBe('source-truncated')
        });

        test('an excluded remainder (included < totalResolved) → incomplete-inclusion, no narrative', () => {
            const envelope = withGap({totalResolved: 5});   // included 1 < 5

            expect(envelope.synthesisAvailable).toBe(false);
            expect(envelope.coverage.excluded).toBe(4);
            expect(envelope.coverage.degradedReason).toBe('incomplete-inclusion')
        });

        test('an explicit degraded flag → flagged-degraded, no narrative even when counts line up', () => {
            const envelope = withGap({totalResolved: 1, degraded: true});

            expect(envelope.synthesisAvailable).toBe(false);
            expect(envelope.coverage.degradedReason).toBe('flagged-degraded')
        });

        test('a caller-supplied degradedReason is preserved verbatim', () => {
            const envelope = withGap({totalResolved: 1, degraded: true, degradedReason: 'lm-studio-unreachable'});

            expect(envelope.coverage.degradedReason).toBe('lm-studio-unreachable')
        })
    });

    test('complete coverage but NO narrative → synthesisAvailable false with the no-narrative reason (not a coverage gap)', () => {
        const envelope = buildTemporalBirdViewEnvelope({window: WINDOW, sources: SOURCES, coverage: {totalResolved: 2}, generatedAt: GEN_ISO});

        expect(envelope.synthesisAvailable).toBe(false);
        expect(envelope.synthesisUnavailableReason).toBe('no-narrative');
        expect(envelope.coverage.degraded).toBe(false)
    });

    test('fails loud: a missing generatedAt and a missing window each throw', () => {
        expect(() => buildTemporalBirdViewEnvelope({window: WINDOW, sources: SOURCES})).toThrow(/generatedAt/);
        expect(() => buildTemporalBirdViewEnvelope({sources: SOURCES, generatedAt: GEN_ISO})).toThrow(/window/)
    })
});
