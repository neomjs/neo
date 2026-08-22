import {setup} from '../../../../setup.mjs'

const appName = 'FleetPrLaneActivityAdapterTest'

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
})

import {test, expect} from '@playwright/test'
import Neo            from '../../../../../../src/Neo.mjs'
import * as core      from '../../../../../../src/core/_export.mjs'

import {
    createFleetPrLaneActivitySnapshot,
    createIssueActivityEvents,
    createPrActivityEvents,
    createStallActivityEvents
} from '../../../../../../ai/services/fleet/fleetPrLaneActivityAdapter.mjs'
import {FLEET_COCKPIT_SOURCES} from '../../../../../../ai/services/fleet/fleetCockpitStatus.mjs'

test.describe('fleetPrLaneActivityAdapter - PR/lane activity mapping', () => {
    test('maps PR facts without exposing the PR body', () => {
        const [event] = createPrActivityEvents([{
            number        : 14625,
            title         : 'feat(ai): Neural Link dock tools (#14587)',
            body          : 'Parked-on: #14587 [blocked] - ghp_secret body text must not reach the cockpit',
            state         : 'OPEN',
            url           : 'https://github.com/neomjs/neo/pull/14625',
            author        : {login: 'neo-fable-clio'},
            createdAt     : '2026-07-04T03:00:00Z',
            updatedAt     : '2026-07-04T03:05:00Z',
            reviewDecision: 'APPROVED',
            reviews       : [{author: {login: 'neo-opus-grace'}, state: 'APPROVED', submittedAt: '2026-07-04T03:04:00Z'}]
        }])

        expect(event).toMatchObject({
            eventId   : `${FLEET_COCKPIT_SOURCES.githubPr}:14625`,
            type      : 'pr-activity',
            source    : FLEET_COCKPIT_SOURCES.githubPr,
            agentId   : 'neo-fable-clio',
            occurredAt: '2026-07-04T03:05:00.000Z',
            payload   : {
                kind          : 'pull-request',
                number        : 14625,
                relatedPrs    : [14625],
                relatedTickets: [14587],
                humanGateState: {
                    approved        : true,
                    changedRequested: false
                },
                deferDisposition: {
                    state         : 'deferred',
                    anchorArtifact: '#14587'
                }
            }
        })

        const serialized = JSON.stringify(event)

        expect(serialized).not.toContain('body text must not reach')
        expect(serialized).not.toContain('ghp_secret')
    })

    test('maps issue and lane-claim facts while omitting comment bodies', () => {
        const events = createIssueActivityEvents([{
            number   : 14573,
            title    : 'Fleet cockpit PR and lane activity adapter',
            state    : 'OPEN',
            url      : 'https://github.com/neomjs/neo/issues/14573',
            labels   : [{name: 'enhancement'}, {name: 'ai'}],
            assignees: [{login: 'neo-gpt'}],
            updatedAt: '2026-07-04T03:10:00Z',
            comments : {
                nodes: [{
                    id       : 'IC_lane',
                    author   : {login: 'neo-gpt'},
                    createdAt: '2026-07-04T03:12:00Z',
                    body     : '[lane-claim] taking #14573 — ghp_secret must not leak'
                }]
            }
        }])

        expect(events).toHaveLength(2)
        expect(events[0]).toMatchObject({
            eventId: `${FLEET_COCKPIT_SOURCES.githubIssue}:14573`,
            type   : 'issue-activity',
            source : FLEET_COCKPIT_SOURCES.githubIssue,
            agentId: 'neo-gpt',
            payload: {
                kind          : 'issue',
                number        : 14573,
                labels        : ['enhancement', 'ai'],
                assignees     : ['neo-gpt'],
                relatedTickets: []
            }
        })
        expect(events[1]).toMatchObject({
            eventId: `${FLEET_COCKPIT_SOURCES.commentLane}:IC_lane`,
            type   : 'lane-claim',
            source : FLEET_COCKPIT_SOURCES.commentLane,
            agentId: 'neo-gpt',
            payload: {
                kind          : 'lane-claim',
                issueNumber   : 14573,
                commentId     : 'IC_lane',
                relatedTickets: [14573]
            }
        })

        const serialized = JSON.stringify(events)

        expect(serialized).not.toContain('ghp_secret')
        expect(serialized).not.toContain('[lane-claim]')
    })

    test('maps work-graph stall findings as bounded cockpit events', () => {
        const [event] = createStallActivityEvents([{
            observedAt        : '2026-07-04T03:08:00Z',
            findingClass      : 'DECISION_STARVED',
            grade             : 'verified-stall',
            motionPredicate   : 'PR merges or receives changes requested',
            evidenceRefs      : ['PR #14585', 'approvedAt:2026-07-04T03:00:00Z'],
            verificationSource: 'GitHub PR list reviews',
            waitingSince      : '2026-07-04T03:00:00Z',
            sourceFidelity    : 'verified',
            subject           : {type: 'PR', number: 14585, owner: 'human-merge-gate', title: 'ADR 0033', url: 'https://github.com/neomjs/neo/pull/14585'}
        }])

        expect(event).toMatchObject({
            eventId   : `${FLEET_COCKPIT_SOURCES.graphStall}:DECISION_STARVED:14585`,
            type      : 'work-stall',
            source    : FLEET_COCKPIT_SOURCES.graphStall,
            agentId   : 'human-merge-gate',
            confidence: 'observed',
            payload   : {
                kind        : 'work-stall',
                findingClass: 'DECISION_STARVED',
                subject     : {
                    type  : 'PR',
                    number: 14585
                }
            }
        })
    })

    test('returns degraded capability when GitHub or graph reads fail', () => {
        const snapshot = createFleetPrLaneActivitySnapshot({
            error     : new Error('GitHub 502 token=secret should stay bounded'),
            capturedAt: '2026-07-04T03:15:00Z'
        })

        expect(snapshot.capability).toMatchObject({
            source    : FLEET_COCKPIT_SOURCES.activity,
            state     : 'degraded',
            confidence: 'none'
        })
        expect(snapshot.events).toHaveLength(1)
        expect(snapshot.events[0]).toMatchObject({
            eventId   : 'pr-lane:source-degraded',
            type      : 'source-degraded',
            source    : FLEET_COCKPIT_SOURCES.activity,
            confidence: 'none'
        })
        expect(JSON.stringify(snapshot)).not.toContain('token=secret')
        expect(snapshot.counts).toEqual([])
    })

    test('sorts newest first and bounds event count', () => {
        const snapshot = createFleetPrLaneActivitySnapshot({
            capturedAt: '2026-07-04T03:20:00Z',
            limit     : 2,
            prs       : [
                {number: 1, title: 'old', author: {login: 'neo-gpt'}, updatedAt: '2026-07-04T03:01:00Z'},
                {number: 2, title: 'new', author: {login: 'neo-gpt'}, updatedAt: '2026-07-04T03:03:00Z'}
            ],
            issues: [{
                number   : 3,
                title    : 'middle',
                assignees: ['neo-gpt'],
                updatedAt: '2026-07-04T03:02:00Z'
            }]
        })

        expect(snapshot.capability).toMatchObject({
            source    : FLEET_COCKPIT_SOURCES.activity,
            state     : 'wired',
            confidence: 'observed'
        })
        expect(snapshot.events.map(event => event.payload.number || event.payload.issueNumber)).toEqual([2, 3])
        expect(snapshot.counts).toEqual([])
    })

    test('omits PR, issue, lane and stall rows whose producer cannot name stable identity', () => {
        expect(createPrActivityEvents([{title: 'numberless'}])).toEqual([]);
        expect(createIssueActivityEvents([{title: 'numberless', comments: {nodes: [{body: '[lane-claim]', id: null}]}}])).toEqual([]);
        expect(createStallActivityEvents([{findingClass: 'x', subject: {title: 'no stable id'}}])).toEqual([])
    });

    // ---- human-gate truth at the consumer boundary (Cycle-2 RA3: draft + formal-disposition) ----

    test('draft state is preserved truthfully — unknown stays null, never fabricated false', () => {
        const [unknown] = createPrActivityEvents([{number: 1, author: {login: 'a'}, updatedAt: '2026-07-04T03:00:00Z'}])
        const [drafted] = createPrActivityEvents([{number: 2, author: {login: 'a'}, updatedAt: '2026-07-04T03:00:00Z', isDraft: true}])
        const [ready]   = createPrActivityEvents([{number: 3, author: {login: 'a'}, updatedAt: '2026-07-04T03:00:00Z', isDraft: false}])

        // synced records carry no draft field → unknown must stay null in the cockpit payload, not false
        expect(unknown.payload.isDraft).toBeNull()
        expect(drafted.payload.isDraft).toBe(true)
        expect(ready.payload.isDraft).toBe(false)
    })

    test('a later COMMENTED review never supersedes a formal disposition (human-gate truth)', () => {
        const [crThenComment] = createPrActivityEvents([{
            number   : 1,
            author   : {login: 'a'},
            updatedAt: '2026-07-04T03:00:00Z',
            reviews  : [
                {author: {login: 'rev'}, state: 'CHANGES_REQUESTED', submittedAt: '2026-07-04T01:00:00Z'},
                {author: {login: 'rev'}, state: 'COMMENTED',         submittedAt: '2026-07-04T02:00:00Z'}
            ]
        }])
        expect(crThenComment.payload.humanGateState.changedRequested).toBe(true)

        const [approveThenComment] = createPrActivityEvents([{
            number   : 2,
            author   : {login: 'a'},
            updatedAt: '2026-07-04T03:00:00Z',
            reviews  : [
                {author: {login: 'rev'}, state: 'APPROVED',  submittedAt: '2026-07-04T01:00:00Z'},
                {author: {login: 'rev'}, state: 'COMMENTED', submittedAt: '2026-07-04T02:00:00Z'}
            ]
        }])
        expect(approveThenComment.payload.humanGateState.approved).toBe(true)
    })

    test('DISMISSED clears a formal disposition — a dismissed APPROVED is no longer approved', () => {
        const [approveThenDismiss] = createPrActivityEvents([{
            number   : 1,
            author   : {login: 'a'},
            updatedAt: '2026-07-04T03:00:00Z',
            reviews  : [
                {author: {login: 'rev'}, state: 'APPROVED',  submittedAt: '2026-07-04T01:00:00Z'},
                {author: {login: 'rev'}, state: 'DISMISSED', submittedAt: '2026-07-04T02:00:00Z'}
            ]
        }])
        expect(approveThenDismiss.payload.humanGateState.approved).not.toBe(true)
        expect(approveThenDismiss.payload.humanGateState.changedRequested).toBe(false)
    })
})

/**
 * The stall ranking timestamp rides the finding's STABLE temporal fact, never the scan clock —
 * the findings builder re-stamps its observation fields every snapshot, and ranking by those
 * re-floats every unchanged stall to the top of the merged feed on every poll.
 */
test.describe('createStallActivityEvents — stable rank time', () => {
    const waitingSince = '2026-08-01T10:00:00.000Z'

    test('an unchanged stall keeps its rank across snapshots: occurredAt is waitingSince, not the re-stamped observation', () => {
        const base = {
            findingClass: 'ownership-gap',
            waitingSince,
            subject     : {owner: '@grace', number: 16310, title: 'Nothing arms a wake route at boot'}
        }

        const [first]  = createStallActivityEvents([{...base, observedAt: '2026-08-02T16:00:00.000Z'}], {capturedAt: '2026-08-02T16:00:00.000Z'}),
              [second] = createStallActivityEvents([{...base, observedAt: '2026-08-02T17:00:00.000Z'}], {capturedAt: '2026-08-02T17:00:00.000Z'})

        expect(first.occurredAt).toBe(waitingSince)
        expect(second.occurredAt).toBe(waitingSince)
        expect(first.payload.rankAnchor).toBe('finding')

        // The claim-vs-rank separation, pinned: the RANK ignores the re-stamped observation time,
        // while the PAYLOAD carries it — a consumer can always see when the stall was last seen.
        expect(first.payload.observedAt).toBe('2026-08-02T16:00:00.000Z')
        expect(second.payload.observedAt).toBe('2026-08-02T17:00:00.000Z')
    })

    test('a fresh real event outranks a stale stall under the composer sort key', () => {
        const [stall] = createStallActivityEvents([{
            findingClass: 'ownership-gap',
            waitingSince,
            subject     : {owner: '@grace', number: 16310}
        }], {capturedAt: '2026-08-02T17:00:00.000Z'})

        expect('2026-08-02T16:59:00.000Z'.localeCompare(stall.occurredAt)).toBeGreaterThan(0)
    })

    test('a finding with no temporal fact degrades to capture time WITH the named marker — never silently', () => {
        const capturedAt = '2026-08-02T17:00:00.000Z',
              [event]    = createStallActivityEvents([{findingClass: 'x', subject: {owner: '@a', id: 'stall-x'}}], {capturedAt})

        expect(event.occurredAt).toBe(capturedAt)
        expect(event.payload.rankAnchor).toBe('capture-time-degraded')
    })
})
