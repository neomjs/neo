import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'ConceptSliceBuilderTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

import {
    buildConceptSlice,
    detectConceptSliceAxes,
    parseConceptSliceGaps,
    renderConceptSliceHandoffSection,
    renderConceptSliceSection
} from '../../../../../../ai/services/graph/conceptSliceBuilder.mjs';

function createGraphServiceFixture() {
    let wrote = false;

    return {
        didWrite: () => wrote,
        db      : {
            nodes: {
                items: [
                    {
                        id        : 'golden-path',
                        label     : 'CONCEPT',
                        properties: {
                            title        : 'Golden Path',
                            capabilityGap: JSON.stringify([
                                '[GUIDE_GAP] Golden Path guide coverage is thin.'
                            ]),
                            authorityRef: '#14422',
                            lastGapCheck: '2026-07-02T20:00:00Z'
                        }
                    },
                    {
                        id        : 'session-1',
                        label     : 'SESSION',
                        properties: {
                            title: 'Session 1'
                        }
                    },
                    {
                        id        : 'file:ai/services/graph/GoldenPathSynthesizer.mjs',
                        label     : 'FILE',
                        properties: {
                            title: 'GoldenPathSynthesizer'
                        }
                    }
                ],
                set() { wrote = true },
                add() { wrote = true }
            },
            edges: {
                items: [
                    {
                        id        : 'edge-touch',
                        source    : 'session-1',
                        target    : 'golden-path',
                        type      : 'TAGGED_CONCEPT',
                        properties: {
                            authorityRef        : '#14422',
                            extractionProvenance: 'curated',
                            sourceTier          : 'peer-trusted',
                            updatedAt           : '2026-07-02T21:00:00Z',
                            weight              : 1
                        }
                    },
                    {
                        id        : 'edge-implemented',
                        source    : 'golden-path',
                        target    : 'file:ai/services/graph/GoldenPathSynthesizer.mjs',
                        type      : 'IMPLEMENTED_BY',
                        properties: {
                            lifecycle: 'observed',
                            weight   : 0.9
                        }
                    }
                ],
                set() { wrote = true },
                add() { wrote = true }
            }
        },
        upsertNode() { wrote = true },
        linkNodes() { wrote = true }
    }
}

test.describe('ai/services/graph/conceptSliceBuilder', () => {

    test('detectConceptSliceAxes reports the four annotation axes independently', () => {
        const axes = detectConceptSliceAxes({
            authorityRef        : '#14422',
            extractionProvenance: 'curated',
            lifecycle           : 'observed',
            sourceTier          : 'peer-trusted'
        });

        expect(axes.authorityRef).toEqual({present: true, keys: ['authorityRef']});
        expect(axes.fidelity).toEqual({present: true, keys: ['sourceTier']});
        expect(axes.extractionProvenance).toEqual({present: true, keys: ['extractionProvenance']});
        expect(axes.lifecycle).toEqual({present: true, keys: ['lifecycle']});
    });

    test('parseConceptSliceGaps accepts JSON arrays and line-delimited legacy payloads', () => {
        expect(parseConceptSliceGaps(JSON.stringify(['[GUIDE_GAP] Missing guide']))).toEqual(['[GUIDE_GAP] Missing guide']);
        expect(parseConceptSliceGaps('[TEST_GAP] Missing spec\n[EXAMPLE_GAP] Missing example')).toEqual([
            '[TEST_GAP] Missing spec',
            '[EXAMPLE_GAP] Missing example'
        ]);
    });

    test('buildConceptSlice returns a read-only render tree over touched concepts, edges, and gaps', () => {
        const graphService = createGraphServiceFixture();
        const slice        = buildConceptSlice({
            capturedAt   : '2026-07-02T22:00:00Z',
            graphService,
            sessionWindow: {
                since: '2026-07-02T20:30:00Z'
            }
        });

        expect(graphService.didWrite()).toBe(false);
        expect(slice.schema).toMatchObject({
            input     : 'bounded concept neighborhood + four-axis tier/provenance annotations',
            output    : 'render tree',
            renderOnly: true
        });
        expect(slice.conceptsTouched).toHaveLength(1);
        expect(slice.conceptsTouched[0]).toMatchObject({
            conceptId : 'golden-path',
            sources   : ['session-1'],
            touchCount: 1
        });
        expect(slice.edgeDeltas.map(edge => edge.edgeId)).toContain('edge-touch');
        expect(slice.perConceptGaps).toEqual([
            expect.objectContaining({
                conceptId: 'golden-path',
                gapClass : 'GUIDE_GAP'
            })
        ]);
    });

    test('renderConceptSliceSection emits structure before narrative-style gap prose', () => {
        const slice = buildConceptSlice({
            capturedAt  : '2026-07-02T22:00:00Z',
            graphService: createGraphServiceFixture()
        });
        const md = renderConceptSliceSection(slice);

        expect(md.indexOf('### Concepts Touched')).toBeLessThan(md.indexOf('### Edge Deltas'));
        expect(md.indexOf('### Edge Deltas')).toBeLessThan(md.indexOf('### Open Gaps per Concept'));
        expect(md).toContain('Contract: input = bounded concept neighborhood + four-axis annotations; output = render tree.');
        expect(md).toContain('Golden Path guide coverage is thin.');
        expect(md).not.toContain('[GUIDE_GAP] Golden Path guide coverage is thin.');
    });

    test('renderConceptSliceHandoffSection degrades to no section when slice construction fails', () => {
        const warnings = [];
        const md       = renderConceptSliceHandoffSection({
            capturedAt  : 'not-a-date',
            graphService: createGraphServiceFixture(),
            logger      : {
                warn(message) {
                    warnings.push(message);
                }
            }
        });

        expect(md).toBe('');
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('Concept Slice section render failed');
    });
});
