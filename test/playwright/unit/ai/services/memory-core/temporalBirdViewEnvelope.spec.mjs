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

    test('citations carry per-source type/id/ref for drill-down', () => {
        const envelope = buildTemporalBirdViewEnvelope({window: WINDOW, sources: SOURCES, coverage: {totalResolved: 2}, generatedAt: GEN_ISO});

        expect(envelope.citations).toEqual([
            {type: 'pull-request', id: 'pr-100', ref: 'merged'},
            {type: 'session',      id: 'session-abc'}
        ])
    });

    test('sourceManifestHash is deterministic AND order-independent (same set → same hash)', () => {
        const a = buildTemporalBirdViewEnvelope({window: WINDOW, sources: [{id: 'x'}, {id: 'y'}], coverage: {totalResolved: 2}, generatedAt: GEN_ISO}),
              b = buildTemporalBirdViewEnvelope({window: WINDOW, sources: [{id: 'y'}, {id: 'x'}], coverage: {totalResolved: 2}, generatedAt: GEN_ISO}),
              c = buildTemporalBirdViewEnvelope({window: WINDOW, sources: [{id: 'x'}, {id: 'z'}], coverage: {totalResolved: 2}, generatedAt: GEN_ISO});

        expect(a.sourceManifestHash).toBe(b.sourceManifestHash);
        expect(a.sourceManifestHash).not.toBe(c.sourceManifestHash);
        expect(a.sourceManifestHash).toMatch(/^[0-9a-f]{8}$/)
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
