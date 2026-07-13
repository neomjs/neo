import {test, expect}                                      from '@playwright/test';
import {annotateCitationProminence, partitionByProminence} from '../../../../../../ai/services/memory-core/helpers/citationProminence.mjs';

test.describe('citationProminence — prominence is emphasis, never admission', () => {
    test('impact >= 90 sessions are prominent; lower-impact sessions are admitted but not foregrounded', () => {
        const annotated = annotateCitationProminence([
            {id: 'hi',  type: 'session', impact: 90},
            {id: 'higher', type: 'session', impact: 97},
            {id: 'lo',  type: 'session', impact: 42}
        ]);

        expect(annotated.find(s => s.id === 'hi').prominent).toBe(true);
        expect(annotated.find(s => s.id === 'higher').prominent).toBe(true);
        expect(annotated.find(s => s.id === 'lo').prominent).toBe(false)
    });

    test('accepted ADRs are prominent; non-accepted ADRs are not', () => {
        const annotated = annotateCitationProminence([
            {id: 'adr-28', type: 'adr', accepted: true},
            {id: 'adr-99', type: 'adr', accepted: false}
        ]);

        expect(annotated.find(s => s.id === 'adr-28').prominent).toBe(true);
        expect(annotated.find(s => s.id === 'adr-99').prominent).toBe(false)
    });

    test('a PR is prominent only through a NAMED fidelity marker — never an invented impact score', () => {
        const annotated = annotateCitationProminence([
            {id: 'pr-adr',   type: 'pull-request', acceptedAdrLink: 'ADR-0028'},
            {id: 'pr-epic',  type: 'pull-request', epicLabel: 'epic:temporal-pyramid'},
            {id: 'pr-review', type: 'pull-request', highImpactReview: true},
            {id: 'pr-bare',  type: 'pull-request'},
            // a raw numeric "impact" on a PR must NOT confer prominence (no universal PR impact score)
            {id: 'pr-score', type: 'pull-request', impact: 100}
        ]);

        expect(annotated.find(s => s.id === 'pr-adr').prominent).toBe(true);
        expect(annotated.find(s => s.id === 'pr-epic').prominent).toBe(true);
        expect(annotated.find(s => s.id === 'pr-review').prominent).toBe(true);
        expect(annotated.find(s => s.id === 'pr-bare').prominent).toBe(false);
        expect(annotated.find(s => s.id === 'pr-score').prominent).toBe(false)
    });

    test('partitionByProminence drops NOTHING — prominent + context === the full admitted manifest', () => {
        const sources = [
            {id: 'a', type: 'session', impact: 95},
            {id: 'b', type: 'session', impact: 10},
            {id: 'c', type: 'adr', accepted: true},
            {id: 'd', type: 'pull-request'}
        ];

        const {prominent, context} = partitionByProminence(sources);

        expect(prominent.map(s => s.id).sort()).toEqual(['a', 'c']);
        expect(context.map(s => s.id).sort()).toEqual(['b', 'd']);
        // admission invariant: nothing is dropped
        expect(prominent.length + context.length).toBe(sources.length)
    });

    test('order is preserved and an unknown source type is never prominent', () => {
        const annotated = annotateCitationProminence([
            {id: 'x', type: 'mystery'},
            {id: 'y', type: 'session', impact: 91}
        ]);

        expect(annotated.map(s => s.id)).toEqual(['x', 'y']);   // order preserved
        expect(annotated[0].prominent).toBe(false)
    })
});
