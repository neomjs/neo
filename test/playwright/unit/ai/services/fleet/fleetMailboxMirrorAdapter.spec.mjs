import {setup} from '../../../../setup.mjs'

const appName = 'FleetMailboxMirrorAdapterTest'

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

import * as adapterModule from '../../../../../../ai/services/fleet/fleetMailboxMirrorAdapter.mjs'
import {
    createFleetMailboxMirrorSnapshot,
    DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT,
    MAX_FLEET_MAILBOX_MIRROR_LIMIT,
    readFleetMailboxMirror
} from '../../../../../../ai/services/fleet/fleetMailboxMirrorAdapter.mjs'
import {FLEET_COCKPIT_SOURCES} from '../../../../../../src/ai/fleet/fleetCockpitStatus.mjs'

const CAPTURED_AT = '2026-07-16T12:00:00.000Z'

/**
 * The S1 Brain half: viewer-admitted, read-only per-agent mailbox mirror. Admission enforcement is
 * the MailboxService primitive's own CAN_READ_INBOX_OF gate — these specs pin the adapter's honest
 * projection of grant, denial, and degradation, plus the structural boundaries (no mutation verbs,
 * no archive exposure) the graduated record marks MUST-NOT.
 */
test.describe('fleetMailboxMirrorAdapter — viewer-admitted per-agent mailbox mirror', () => {
    test('grants: projects summaries into frozen, body-free rows with thread metadata + audit fact', async () => {
        const calls    = []
        const snapshot = await readFleetMailboxMirror({
            capturedAt    : CAPTURED_AT,
            viewerIdentity: 'tobiu',
            subjectAgentId: '@neo-opus-vega',
            listMessages  : async args => {
                calls.push(args)
                return {messages: [{
                    messageId     : 'MESSAGE:abc',
                    subject       : '[review-queue] both heads unchanged',
                    from          : '@neo-gpt-emmy',
                    to            : '@neo-opus-vega',
                    priority      : 'high',
                    partOfThread  : 'THREAD:15238',
                    relatedTickets: ['#15238', '#15233'],
                    sentAt        : '2026-07-16T11:00:00.000Z',
                    readAt        : null,
                    body          : 'FULL BODY MUST NOT LEAK',
                    task          : {state: 'Submitted'}
                }]}
            }
        })

        expect(snapshot.admission).toEqual({
            state         : 'granted',
            viewerIdentity: '@tobiu',
            subjectAgentId: '@neo-opus-vega',
            checkedAt     : CAPTURED_AT,
            reason        : null
        })
        expect(snapshot.capability.state).toBe('wired')
        expect(snapshot.capability.source).toBe(FLEET_COCKPIT_SOURCES.a2a)
        expect(snapshot.page).toEqual({limit: DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT, offset: 0, count: 1})

        const [row] = snapshot.rows
        expect(row.subject).toBe('[review-queue] both heads unchanged')
        expect(row.from).toBe('@neo-gpt-emmy')
        expect(row.recipientClass).toBe('agent')
        expect(row.partOfThread).toBe('THREAD:15238')
        expect(row.relatedTickets).toEqual([15233, 15238])
        expect(row.status).toBe('unread')
        expect(row.taskState).toBe('Submitted')
        expect(row.sentAt).toBe('2026-07-16T11:00:00.000Z')
        // body-free by construction: no row key carries message content
        expect(Object.keys(row)).not.toContain('body')

        // immutable rows — timestamped facts, not live views
        expect(Object.isFrozen(snapshot)).toBe(true)
        expect(Object.isFrozen(snapshot.rows)).toBe(true)
        expect(Object.isFrozen(row)).toBe(true)
        expect(() => { row.subject = 'mutated' }).toThrow()

        // the read call is the subject's inbox through the viewer-bound path
        expect(calls).toHaveLength(1)
        expect(calls[0].to).toBe('@neo-opus-vega')
        expect(calls[0].box).toBe('inbox')
    })

    test('admission fail-closed: the primitive CAN_READ_INBOX_OF throw maps to an explicit denial, never empty-success', async () => {
        const snapshot = await readFleetMailboxMirror({
            capturedAt    : CAPTURED_AT,
            viewerIdentity: '@neo-observer',
            subjectAgentId: '@neo-opus-vega',
            listMessages  : async () => {
                throw new Error('Unauthorized: no CAN_READ_INBOX_OF permission for @neo-opus-vega')
            }
        })

        expect(snapshot.admission.state).toBe('denied')
        expect(snapshot.admission.viewerIdentity).toBe('@neo-observer')
        expect(snapshot.admission.subjectAgentId).toBe('@neo-opus-vega')
        expect(snapshot.admission.reason).toContain('CAN_READ_INBOX_OF')
        expect(snapshot.admission.checkedAt).toBe(CAPTURED_AT)
        expect(snapshot.capability.state).toBe('degraded')
        expect(snapshot.rows).toEqual([])
        expect(snapshot.page.count).toBe(0)
    })

    test('non-admission source failures degrade honestly as unavailable (distinct from denial)', async () => {
        const snapshot = await readFleetMailboxMirror({
            capturedAt    : CAPTURED_AT,
            viewerIdentity: '@tobiu',
            subjectAgentId: '@neo-opus-vega',
            listMessages  : async () => { throw new Error('database not initialized') }
        })

        expect(snapshot.admission.state).toBe('unavailable')
        expect(snapshot.capability.state).toBe('degraded')
        expect(snapshot.rows).toEqual([])
    })

    test('missing read path / missing identities never fabricate: honest degradation with named reason', async () => {
        const noPath = await readFleetMailboxMirror({
            capturedAt    : CAPTURED_AT,
            viewerIdentity: '@tobiu',
            subjectAgentId: '@neo-opus-vega'
        })
        expect(noPath.capability.state).toBe('degraded')
        expect(noPath.capability.reason).toContain('read path unavailable')
        expect(noPath.rows).toEqual([])

        const noSubject = await readFleetMailboxMirror({
            capturedAt    : CAPTURED_AT,
            viewerIdentity: '@tobiu',
            listMessages  : async () => ({messages: []})
        })
        expect(noSubject.capability.state).toBe('degraded')
        expect(noSubject.capability.reason).toContain('viewerIdentity and subjectAgentId')
        expect(noSubject.admission.state).toBe('unavailable')
    })

    test('pagination bounds: limit clamps to [1, MAX], offset clamps to >= 0, bounds echo on the snapshot', async () => {
        const calls = []
        const read  = async args => { calls.push(args); return {messages: []} }

        const over = await readFleetMailboxMirror({
            capturedAt: CAPTURED_AT, viewerIdentity: '@tobiu', subjectAgentId: '@neo-gpt',
            limit     : 9999, offset: -5, listMessages: read
        })
        expect(calls[0].limit).toBe(MAX_FLEET_MAILBOX_MIRROR_LIMIT)
        expect(calls[0].offset).toBe(0)
        expect(over.page).toEqual({limit: MAX_FLEET_MAILBOX_MIRROR_LIMIT, offset: 0, count: 0})

        await readFleetMailboxMirror({
            capturedAt: CAPTURED_AT, viewerIdentity: '@tobiu', subjectAgentId: '@neo-gpt',
            limit     : 0, offset: 25.7, listMessages: read
        })
        expect(calls[1].limit).toBe(1)
        expect(calls[1].offset).toBe(25)

        await readFleetMailboxMirror({
            capturedAt: CAPTURED_AT, viewerIdentity: '@tobiu', subjectAgentId: '@neo-gpt',
            limit     : 'not-a-number', listMessages: read
        })
        expect(calls[2].limit).toBe(DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT)
    })

    test('active-inbox default is STRUCTURAL: the adapter never forwards an includeArchived key', async () => {
        const calls = []
        await readFleetMailboxMirror({
            capturedAt    : CAPTURED_AT,
            viewerIdentity: '@tobiu',
            subjectAgentId: '@neo-gpt',
            listMessages  : async args => { calls.push(args); return {messages: []} }
        })

        // the service default (exclude archived) always governs — the key is absent by construction
        expect(Object.keys(calls[0])).toEqual(['box', 'status', 'to', 'limit', 'offset'])
        expect(Object.hasOwn(calls[0], 'includeArchived')).toBe(false)
    })

    test('the surface is structurally read-only: no markRead / archive / mutation verb is exported', () => {
        const exportNames = Object.keys(adapterModule)

        expect(exportNames.sort()).toEqual([
            'DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT',
            'MAX_FLEET_MAILBOX_MIRROR_LIMIT',
            'createFleetMailboxMirrorSnapshot',
            'readFleetMailboxMirror'
        ])
        exportNames.forEach(name => {
            expect(/mark|archive|delete|send|write|mutate/i.test(name)).toBe(false)
        })
    })

    test('canonical identity mapping: bare logins normalize to @-form on the audit fact; self-read maps through unchanged', async () => {
        const calls    = []
        const snapshot = await readFleetMailboxMirror({
            capturedAt    : CAPTURED_AT,
            viewerIdentity: 'neo-opus-vega',
            subjectAgentId: 'neo-opus-vega',
            listMessages  : async args => { calls.push(args); return {messages: []} }
        })

        // viewer === subject: the adapter adds no special casing — the primitive's own
        // self-read path (no grant required) governs; the audit fact still records both.
        expect(snapshot.admission.viewerIdentity).toBe('@neo-opus-vega')
        expect(snapshot.admission.subjectAgentId).toBe('@neo-opus-vega')
        expect(calls[0].to).toBe('@neo-opus-vega')
    })

    test('pure half: createFleetMailboxMirrorSnapshot redacts secret-bearing subjects and reasons', () => {
        const snapshot = createFleetMailboxMirrorSnapshot({
            capturedAt: CAPTURED_AT,
            viewer    : '@tobiu',
            subject   : '@neo-gpt',
            messages  : [{messageId: 'MESSAGE:x', subject: 'rotate token: ghp_abc123SECRET now', sentAt: CAPTURED_AT}]
        })
        expect(snapshot.rows[0].subject).not.toContain('ghp_abc123SECRET')

        const denied = createFleetMailboxMirrorSnapshot({
            capturedAt: CAPTURED_AT,
            viewer    : '@tobiu',
            subject   : '@neo-gpt',
            error     : new Error('Unauthorized: no CAN_READ_INBOX_OF permission for @neo-gpt (token: ghp_zzz999LEAK)')
        })
        expect(denied.admission.state).toBe('denied')
        expect(denied.admission.reason).not.toContain('ghp_zzz999LEAK')
    })
})
