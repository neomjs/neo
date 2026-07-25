import {test, expect} from '@playwright/test'
import {
    COLLISION_PREVENTION_TAGS,
    collisionPreventionTag
} from '../../../../../../ai/services/shared/a2aCollisionTags.mjs'

/**
 * @summary Contract suite for the shared collision-tag reader — the structural rules both consumers
 * (the wake guard, fleet activity) depend on: declared concepts beat prose, a tag counts only inside
 * a segment-opening bracket run, and the class vocabulary lives in exactly one Set.
 */
test.describe('a2aCollisionTags — the structural reader', () => {
    test('taggedConcepts wins over prose and needs no subject at all', () => {
        expect(collisionPreventionTag({subject: 'anything at all', taggedConcepts: ['lane-claim']}))
            .toBe('lane-claim');
        expect(collisionPreventionTag({subject: '', taggedConcepts: ['  Review-Claim  ']}))
            .toBe('review-claim');
        expect(collisionPreventionTag({subject: 'the [lane-claim] guard in prose', taggedConcepts: ['unrelated']}))
            .toBeNull()
    });

    test('a tag counts inside a segment-opening bracket run, leading or not', () => {
        expect(collisionPreventionTag({subject: '[lane-claim][#15919] T1 wake-side'}))
            .toBe('lane-claim');
        expect(collisionPreventionTag({subject: '[ticket-created][lane-claim][#15900] ai:config-print'}))
            .toBe('lane-claim');
        expect(collisionPreventionTag({subject: '[merged][PR #15926] film lane 3 landed · [lane-claim][#15925] regex copy'}))
            .toBe('lane-claim')
    });

    test('prose mentions never count — the IS-vs-MENTIONS boundary', () => {
        expect(collisionPreventionTag({subject: '[falsifier-positive][D#15904] the [lane-claim] guard is ^-anchored'}))
            .toBeNull();
        expect(collisionPreventionTag({subject: 'a subject discussing [lane-claim] mid-sentence'}))
            .toBeNull();
        expect(collisionPreventionTag({subject: '[ticket-created ×2][#15933 + #15934] lane 4 claimed'}))
            .toBeNull()
    });

    test('the class vocabulary is the owned Set, all four members reachable', () => {
        expect(COLLISION_PREVENTION_TAGS.size).toBe(4);

        for (const tag of COLLISION_PREVENTION_TAGS) {
            expect(collisionPreventionTag({subject: `[${tag}][#1] x`})).toBe(tag)
        }

        expect(collisionPreventionTag({subject: '[not-a-tag][#1] x'})).toBeNull();
        expect(collisionPreventionTag({})).toBeNull()
    });
});
