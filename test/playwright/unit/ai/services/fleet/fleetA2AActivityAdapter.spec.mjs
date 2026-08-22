import {setup} from '../../../../setup.mjs'

const appName = 'FleetA2AActivityAdapterTest'

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
    createA2AActivityCounts,
    createA2AMessageActivityEvents,
    createFleetA2AActivitySnapshot,
    readFleetA2AActivitySnapshot
} from '../../../../../../ai/services/fleet/fleetA2AActivityAdapter.mjs'
import {FLEET_COCKPIT_SOURCES} from '../../../../../../ai/services/fleet/fleetCockpitStatus.mjs'

test.describe('fleetA2AActivityAdapter - Memory Core A2A activity mapping', () => {
    test('maps mailbox summaries without exposing bodies or task inputs — the recipient id rides deliberately', () => {
        const [event] = createA2AMessageActivityEvents([{
            messageId          : 'MESSAGE:123',
            subject            : '[review-request] PR #14703 token=secret',
            body               : 'full body ghp_secret must not reach the cockpit',
            bodyText           : 'full body ghp_secret must not reach the cockpit',
            from               : '@neo-opus-ada',
            to                 : '@neo-gpt',
            priority           : 'normal',
            sentAt             : '2026-07-04T06:00:00Z',
            relatedTickets     : ['#14572', '#14703'],
            relatedPullRequests: [{number: 14703}],
            task               : {state: 'Submitted', input: 'secret=hidden'},
            wakeSuppressed     : true
        }])

        expect(event).toMatchObject({
            eventId   : `${FLEET_COCKPIT_SOURCES.a2a}:MESSAGE:123`,
            type      : 'a2a-activity',
            source    : FLEET_COCKPIT_SOURCES.a2a,
            agentId   : 'neo-opus-ada',
            confidence: 'observed',
            occurredAt: '2026-07-04T06:00:00.000Z',
            payload   : {
                kind               : 'a2a-message',
                messageId          : 'MESSAGE:123',
                from               : 'neo-opus-ada',
                // the recipient id is a DELIBERATE disclosure: the adapter runs under the
                // viewer's own mailbox read, which already returns it — class-only was the old
                // bound, relaxed for the sender→recipient row (operator-directed)
                to                 : '@neo-gpt',
                recipientClass     : 'agent',
                relatedTickets     : [14572, 14703],
                relatedPullRequests: [14703],
                status             : 'unread',
                taskState          : 'Submitted',
                wakeSuppressed     : true
            }
        })

        const serialized = JSON.stringify(event)

        expect(serialized).toContain('token=[redacted]')
        expect(serialized).not.toContain('ghp_secret')
        expect(serialized).not.toContain('full body')
        expect(serialized).not.toContain('secret=hidden')
    })

    test('maps lane-claim broadcasts as bounded lane-claim events', () => {
        const [event] = createA2AMessageActivityEvents([{
            messageId: 'MESSAGE:lane',
            subject  : '[lane-claim][#14572] Fleet cockpit A2A activity adapter',
            from     : '@neo-gpt',
            to       : 'AGENT:*',
            sentAt   : '2026-07-04T06:02:00Z'
        }])

        expect(event).toMatchObject({
            type   : 'lane-claim',
            source : FLEET_COCKPIT_SOURCES.a2a,
            agentId: 'neo-gpt',
            payload: {
                kind          : 'a2a-lane-claim',
                recipientClass: 'broadcast',
                status        : 'unread'
            }
        })
    })

    test('counts lane-claims in NON-leading tag position — the real-corpus bypass class (#15925)', () => {
        // The fleet writes compound claims — `[ticket-created][lane-claim][#N] …` — and the
        // ^-anchored regex read all eight of these as plain activity. Fixtures: three verbatim
        // from the wake-guard census reproducer, five live sends from the 2026-07-25 mailbox.
        const bypassSubjects = [
            '[ticket-created][lane-claim][#15900] ai:config-print',
            '[ticket-created][lane-claim][#15886] the ESM-module-cache pollution class',
            '[ticket-created][lane-claim][#15875] the AC5 crash root-caused',
            '[ticket-created][lane-claim][#15923] vessel theme propagation — claimed 16:48Z; also: the ticket was still ASSIGNED to @neo-fable, third field/message divergence today',
            '[ticket-created][lane-claim][#15915] the film found engine defect #3 — false re-entry across the proxy-identity swap stillbirths tear-out vessels; 14-cell matrix pinned it, mine to fix',
            '[ticket-created][lane-claim][#15905] the wake guard\'s lane-claim predicate — filed on Phoebe\'s split-nod, mine to fix. And the OBVIOUS fix is falsified in the body',
            '[ticket-created][lane-claim][#15932] PLANE_MEMBER_PATHS is guarded by a pinned count, not the config tree — #15872 is its first confirmed instance',
            '[ticket-created][lane-claim][#15923] operator glitch-review of film v0 → the vessel renders its pane UNSTYLED (popout shell drops the theme) — first defect only visible now that frames exist'
        ]

        for (const [index, subject] of bypassSubjects.entries()) {
            const [event] = createA2AMessageActivityEvents([{
                messageId: `MESSAGE:bypass-${index}`,
                subject,
                from     : '@neo-opus-grace',
                to       : 'AGENT:*',
                sentAt   : '2026-07-25T16:00:00Z'
            }])

            expect(event.type, `non-leading claim must count: ${subject}`).toBe('lane-claim');
            expect(event.payload.kind).toBe('a2a-lane-claim')
        }
    })

    test('does NOT count a subject that merely MENTIONS [lane-claim] in prose (#15925)', () => {
        // The unanchored-substring trap the class was built against: discussing claims ≠ claiming.
        const mentionSubjects = [
            '[falsifier-positive][D#15904] the [lane-claim] guard is ^-anchored — 53% of LIVE lane-claims bypass #14100 today',
            '[ticket-created ×2][#15933 + #15934] lane 4 claimed + the secondary-display engine defect promoted'
        ]

        for (const subject of mentionSubjects) {
            const [event] = createA2AMessageActivityEvents([{
                messageId: 'MESSAGE:mention',
                subject,
                from     : '@neo-opus-ada',
                to       : 'AGENT:*',
                sentAt   : '2026-07-25T17:00:00Z'
            }])

            expect(event.type, `prose mention must NOT count: ${subject}`).toBe('a2a-activity');
            expect(event.payload.kind).toBe('a2a-message')
        }
    })

    test('classifies the RAW subject — a claim opening a later line still counts (representation boundary)', () => {
        // The display subject is whitespace-collapsed; the reader's grammar is segments, so a
        // claim that opens a later LINE must be judged before normalization, not after.
        const [event] = createA2AMessageActivityEvents([{
            messageId: 'MESSAGE:newline',
            subject  : '[merge-eligible][PR #15926] film lane 3 approved at head\n[lane-claim][#15925] the fleet activity regex copy',
            from     : '@neo-fable',
            to       : 'AGENT:*',
            sentAt   : '2026-07-25T19:00:00Z'
        }])

        expect(event.type).toBe('lane-claim');
        expect(event.payload.kind).toBe('a2a-lane-claim')
    });

    test('classifies the RAW subject — a claim past the 180-char display boundary still counts (representation boundary)', () => {
        // The display subject truncates at 180; a trailing claim segment lives beyond it.
        const filler  = 'x'.repeat(200),
              [event] = createA2AMessageActivityEvents([{
                  messageId: 'MESSAGE:truncated',
                  subject  : `[merged][PR #15926] ${filler} · [lane-claim][#15925] the fleet activity regex copy`,
                  from     : '@neo-opus-grace',
                  to       : 'AGENT:*',
                  sentAt   : '2026-07-25T19:30:00Z'
              }]);

        expect(event.type).toBe('lane-claim');
        expect(event.payload.kind).toBe('a2a-lane-claim');
        // …and the payload keeps the SAFE display form: collapsed, redacted, truncated.
        expect(event.payload.subject.length).toBeLessThanOrEqual(180)
    })

    test('sorts newest first, applies timestamp bounds, and limits events', () => {
        const snapshot = createFleetA2AActivitySnapshot({
            capturedAt: '2026-07-04T06:10:00Z',
            since     : '2026-07-04T06:02:00Z',
            until     : '2026-07-04T06:04:00Z',
            limit     : 1,
            messages  : [{
                messageId: 'MESSAGE:old',
                subject  : 'old',
                from     : '@neo-gpt',
                to       : '@neo-opus-ada',
                sentAt   : '2026-07-04T06:01:00Z'
            }, {
                messageId: 'MESSAGE:middle',
                subject  : 'middle',
                from     : '@neo-gpt',
                to       : '@neo-opus-ada',
                sentAt   : '2026-07-04T06:03:00Z'
            }, {
                messageId: 'MESSAGE:new',
                subject  : 'new',
                from     : '@neo-gpt',
                to       : '@neo-opus-ada',
                sentAt   : '2026-07-04T06:05:00Z'
            }]
        })

        expect(snapshot.capability).toMatchObject({
            source    : FLEET_COCKPIT_SOURCES.activity,
            state     : 'wired',
            confidence: 'observed'
        })
        expect(snapshot.events).toHaveLength(1)
        expect(snapshot.events[0].payload.messageId).toBe('MESSAGE:middle')
    })

    test('omits messages without producer identity instead of inventing a view key', () => {
        const events = createA2AMessageActivityEvents([{
            subject: 'missing native id',
            from   : '@neo-gpt',
            sentAt : '2026-07-04T06:01:00Z'
        }]);

        expect(events).toEqual([])
    });

    test('emits total independently, and last24h only when the page proves complete coverage', () => {
        const capturedAt = '2026-07-04T12:00:00.000Z',
              messages   = [{sentAt: '2026-07-04T11:00:00.000Z'}, {sentAt: '2026-07-02T11:00:00.000Z'}];

        expect(createA2AActivityCounts({capturedAt, messages, totalCount: 3})).toEqual([{
            source  : FLEET_COCKPIT_SOURCES.a2a,
            scope   : 'total',
            value   : 3,
            complete: true,
            capturedAt
        }]);

        for (const incompletePage of [
            {pageOffset: 1},
            {truncated: true}
        ]) {
            expect(createA2AActivityCounts({capturedAt, messages, totalCount: 2, ...incompletePage}))
                .toEqual([{
                    source  : FLEET_COCKPIT_SOURCES.a2a,
                    scope   : 'total',
                    value   : 2,
                    complete: true,
                    capturedAt
                }])
        }

        expect(createA2AActivityCounts({capturedAt, messages, totalCount: 2})).toEqual([{
            source  : FLEET_COCKPIT_SOURCES.a2a,
            scope   : 'last24h',
            value   : 1,
            complete: true,
            capturedAt
        }, {
            source  : FLEET_COCKPIT_SOURCES.a2a,
            scope   : 'total',
            value   : 2,
            complete: true,
            capturedAt
        }])
    });

    test('reads through a MailboxService-compatible function with explicit bounds', async() => {
        const seenArgs = []

        const snapshot = await readFleetA2AActivitySnapshot({
            capturedAt  : '2026-07-04T06:12:00Z',
            limit       : 2,
            listArgs    : {box: 'inbox', status: 'unread', includeArchived: false},
            listMessages: async(args) => {
                seenArgs.push(args)

                return {
                    offset    : 0,
                    totalCount: 1,
                    truncated : false,
                    messages: [{
                        messageId: 'MESSAGE:reader',
                        subject  : 'reader path',
                        from     : '@neo-opus-vega',
                        to       : '@neo-gpt',
                        sentAt   : '2026-07-04T06:11:00Z'
                    }]
                }
            }
        })

        expect(seenArgs).toEqual([{
            box            : 'inbox',
            status         : 'unread',
            limit          : 2,
            includeArchived: false
        }])
        expect(snapshot.events).toHaveLength(1)
        expect(snapshot.events[0].payload.messageId).toBe('MESSAGE:reader')
        expect(snapshot.counts.map(row => row.scope)).toEqual(['last24h', 'total'])
    })

    test('returns degraded capability when Memory Core is missing or errors', async() => {
        const missing = await readFleetA2AActivitySnapshot({
            capturedAt: '2026-07-04T06:12:00Z'
        })
        const failed = await readFleetA2AActivitySnapshot({
            capturedAt  : '2026-07-04T06:12:00Z',
            listMessages: async() => {
                throw new Error('Memory Core token=secret unavailable')
            }
        })

        for (const snapshot of [missing, failed]) {
            expect(snapshot.capability).toMatchObject({
                source    : FLEET_COCKPIT_SOURCES.activity,
                state     : 'degraded',
                confidence: 'none'
            })
            expect(snapshot.events).toHaveLength(1)
            expect(snapshot.events[0]).toMatchObject({
                type      : 'source-degraded',
                source    : FLEET_COCKPIT_SOURCES.a2a,
                confidence: 'none'
            })
        }

        expect(JSON.stringify(failed)).toContain('token=[redacted]')
        expect(JSON.stringify(failed)).not.toContain('token=secret')
    })
})


test.describe('fleetA2AActivityAdapter — the recipient rides beside its class', () => {
    test('a directed send carries the raw recipient; a broadcast carries AGENT:* — the surface renders sender→recipient from it', () => {
        const [direct, broadcast] = createA2AMessageActivityEvents([
            {messageId: 'MESSAGE:direct',    from: '@neo-fable-clio', to: '@neo-opus-ada', subject: 'S1', sentAt: '2026-08-18T10:00:00.000Z'},
            {messageId: 'MESSAGE:broadcast', from: '@neo-opus-vega',  to: 'AGENT:*',       subject: 'S2', sentAt: '2026-08-18T10:01:00.000Z'}
        ]);

        expect(direct.payload).toMatchObject({to: '@neo-opus-ada', recipientClass: 'agent'});
        expect(broadcast.payload).toMatchObject({to: 'AGENT:*', recipientClass: 'broadcast'})
    });

    test('a missing recipient is null beside its unknown class — absence stays absence', () => {
        const [event] = createA2AMessageActivityEvents([{messageId: 'MESSAGE:no-recipient', from: '@neo-fable-clio', subject: 'S', sentAt: '2026-08-18T10:00:00.000Z'}]);

        expect(event.payload.to).toBeNull();
        expect(event.payload.recipientClass).toBe('unknown')
    })
});
