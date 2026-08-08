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
import fs             from 'fs-extra'
import path           from 'path'
import Neo            from '../../../../../../src/Neo.mjs'
import * as core      from '../../../../../../src/core/_export.mjs'
import                          '../../../../../../src/manager/Instance.mjs'
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs'

import * as adapterModule from '../../../../../../ai/services/fleet/fleetMailboxMirrorAdapter.mjs'
import {
    createFleetMailboxMirrorSnapshot,
    DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT,
    MAX_FLEET_MAILBOX_MIRROR_LIMIT,
    readFleetMailboxMirror
} from '../../../../../../ai/services/fleet/fleetMailboxMirrorAdapter.mjs'
import {FLEET_COCKPIT_SOURCES} from '../../../../../../ai/services/fleet/fleetCockpitStatus.mjs'

const CAPTURED_AT = '2026-07-16T12:00:00.000Z'

// The production wiring's binding accessor, used verbatim by the real-producer suite below.
const boundIdentity = () => RequestContextService.getAgentIdentityNodeId()

// A viewer binding for the mapper suite: these specs assert projection/refusal shape, so they state
// the bound identity directly rather than standing up a request context.
const boundAs = identity => () => identity

/**
 * The S1 Brain half: viewer-admitted, read-only per-agent mailbox mirror. Admission enforcement is
 * the MailboxService primitive's own CAN_READ_INBOX_OF gate — these specs pin the adapter's honest
 * projection of grant, denial, and degradation, plus the structural boundaries (no mutation verbs,
 * no archive exposure) the graduated record marks MUST-NOT.
 */
test.describe('fleetMailboxMirrorAdapter — viewer-admitted per-agent mailbox mirror', () => {
    test('grants: projects summaries into frozen, body-free rows with the bound viewer as the audit fact', async () => {
        const calls    = []
        const snapshot = await readFleetMailboxMirror({
            capturedAt          : CAPTURED_AT,
            resolveBoundIdentity: boundAs('@tobiu'),
            subjectAgentId      : '@neo-opus-vega',
            listMessages        : async args => {
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
        expect(snapshot.page).toEqual({limit: DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT, offset: 0, count: 1, hasMore: false})

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

    test('admission fail-closed: THIS subject CAN_READ_INBOX_OF throw maps to an explicit denial, never empty-success', async () => {
        const snapshot = await readFleetMailboxMirror({
            capturedAt          : CAPTURED_AT,
            resolveBoundIdentity: boundAs('@neo-observer'),
            subjectAgentId      : '@neo-opus-vega',
            listMessages        : async () => {
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

    test('denial is subject-specific: an unrelated authorization failure is NOT this subject admission decision', async () => {
        // A bare `Unauthorized` (expired token, a different scope, another target) must degrade as
        // unavailable. Reporting it as `denied` would tell the operator "no CAN_READ_INBOX_OF grant"
        // about a subject whose admission was never actually evaluated.
        const generic = await readFleetMailboxMirror({
            capturedAt          : CAPTURED_AT,
            resolveBoundIdentity: boundAs('@tobiu'),
            subjectAgentId      : '@neo-opus-vega',
            listMessages        : async () => { throw new Error('Unauthorized: token expired') }
        })
        expect(generic.admission.state).toBe('unavailable')

        const otherScope = await readFleetMailboxMirror({
            capturedAt          : CAPTURED_AT,
            resolveBoundIdentity: boundAs('@tobiu'),
            subjectAgentId      : '@neo-opus-vega',
            listMessages        : async () => {
                throw new Error('Unauthorized: no CAN_READ_MEMORIES_OF permission for @neo-opus-vega')
            }
        })
        expect(otherScope.admission.state).toBe('unavailable')

        // ...and a denial naming a DIFFERENT subject is not this subject's denial either
        const otherSubject = await readFleetMailboxMirror({
            capturedAt          : CAPTURED_AT,
            resolveBoundIdentity: boundAs('@tobiu'),
            subjectAgentId      : '@neo-opus-vega',
            listMessages        : async () => {
                throw new Error('Unauthorized: no CAN_READ_INBOX_OF permission for @neo-gpt')
            }
        })
        expect(otherSubject.admission.state).toBe('unavailable')
    })

    test('namespace pseudo-targets are inadmissible: AGENT:* never reaches the read, never reports granted', async () => {
        // MailboxService.listMessages skips CAN_READ_INBOX_OF for the broadcast sentinel and
        // PermissionService.hasPermission returns true for it structurally. Forwarding one would
        // hand the cockpit a `granted` snapshot for a target nothing ever admission-checked.
        for (const pseudoTarget of ['AGENT:*', 'AGENT:opus/vega', 'role:maintainer', 'human:tobiu', '@ns:x', '@', '']) {
            const calls    = []
            const snapshot = await readFleetMailboxMirror({
                capturedAt          : CAPTURED_AT,
                resolveBoundIdentity: boundAs('@tobiu'),
                subjectAgentId      : pseudoTarget,
                listMessages        : async args => { calls.push(args); return {messages: []} }
            })

            expect(snapshot.admission.state).not.toBe('granted')
            expect(snapshot.admission.subjectAgentId).toBe(null)
            expect(snapshot.capability.reason).toContain('direct subjectAgentId')
            // fail-closed BEFORE the read: no pseudo-target query is ever issued
            expect(calls).toHaveLength(0)
        }
    })

    test('the audit viewer is the BOUND identity: an unbound read makes no admission claim', async () => {
        const calls    = []
        const snapshot = await readFleetMailboxMirror({
            capturedAt          : CAPTURED_AT,
            resolveBoundIdentity: boundAs(null),
            subjectAgentId      : '@neo-opus-vega',
            listMessages        : async args => { calls.push(args); return {messages: []} }
        })

        expect(snapshot.admission.state).toBe('unavailable')
        expect(snapshot.admission.viewerIdentity).toBe(null)
        expect(snapshot.capability.reason).toContain('bound request identity')
        expect(calls).toHaveLength(0)

        // no accessor at all is the same refusal — never a caller-labelled grant
        const noResolver = await readFleetMailboxMirror({
            capturedAt    : CAPTURED_AT,
            subjectAgentId: '@neo-opus-vega',
            viewerIdentity: '@tobiu',
            listMessages  : async () => ({messages: []})
        })
        expect(noResolver.admission.state).toBe('unavailable')
        expect(noResolver.admission.viewerIdentity).toBe(null)
    })

    test('viewer-mismatch: an asserted identity that is not the bound one refuses the read', async () => {
        const calls    = []
        const snapshot = await readFleetMailboxMirror({
            capturedAt          : CAPTURED_AT,
            resolveBoundIdentity: boundAs('@neo-opus-ada'),
            viewerIdentity      : '@tobiu',
            subjectAgentId      : '@neo-opus-vega',
            listMessages        : async args => { calls.push(args); return {messages: [{messageId: 'MESSAGE:x'}]} }
        })

        // rows here would be Ada's bound read, attributed to @tobiu — refuse rather than mislabel
        expect(snapshot.admission.state).toBe('unavailable')
        expect(snapshot.admission.viewerIdentity).toBe('@neo-opus-ada')
        expect(snapshot.capability.reason).toContain('does not match the bound request identity')
        expect(snapshot.rows).toEqual([])
        expect(calls).toHaveLength(0)

        // a matching assertion passes through (bare and @-form are the same identity)
        const agreed = await readFleetMailboxMirror({
            capturedAt          : CAPTURED_AT,
            resolveBoundIdentity: boundAs('@tobiu'),
            viewerIdentity      : 'tobiu',
            subjectAgentId      : '@neo-opus-vega',
            listMessages        : async () => ({messages: []})
        })
        expect(agreed.admission.state).toBe('granted')
        expect(agreed.admission.viewerIdentity).toBe('@tobiu')
    })

    test('non-admission source failures degrade honestly as unavailable (distinct from denial)', async () => {
        const snapshot = await readFleetMailboxMirror({
            capturedAt          : CAPTURED_AT,
            resolveBoundIdentity: boundAs('@tobiu'),
            subjectAgentId      : '@neo-opus-vega',
            listMessages        : async () => { throw new Error('database not initialized') }
        })

        expect(snapshot.admission.state).toBe('unavailable')
        expect(snapshot.capability.state).toBe('degraded')
        expect(snapshot.rows).toEqual([])
    })

    test('missing read path never fabricates: honest degradation with a named reason', async () => {
        const noPath = await readFleetMailboxMirror({
            capturedAt          : CAPTURED_AT,
            resolveBoundIdentity: boundAs('@tobiu'),
            subjectAgentId      : '@neo-opus-vega'
        })
        expect(noPath.capability.state).toBe('degraded')
        expect(noPath.capability.reason).toContain('read path unavailable')
        expect(noPath.rows).toEqual([])
    })

    test('hasMore is the PRODUCER answering, never the consumer guessing from a full page', async () => {
        const message = index => ({messageId: `MESSAGE:${index}`, subject: `m${index}`, sentAt: '2026-07-16T11:00:00.000Z'})

        const read = async ({limit}) => ({messages: Array.from({length: Math.min(limit, 3)}, (_, i) => message(i))})

        // limit 2, three available: the probe (limit+1 = 3) finds a third row → more follows, and
        // the snapshot still returns only the 2 asked for
        const more = await readFleetMailboxMirror({
            capturedAt: CAPTURED_AT, resolveBoundIdentity: boundAs('@tobiu'), subjectAgentId: '@neo-gpt',
            limit     : 2, listMessages: read
        })
        expect(more.rows).toHaveLength(2);
        expect(more.page).toMatchObject({limit: 2, count: 2, hasMore: true});

        // THE FALSIFIER: an EXACTLY-FULL final page. `count === limit` here too, so a consumer
        // inferring the boundary from the count would offer Next, the next read would answer with an
        // empty window at a positive offset, and the pane would render a global "no messages" while
        // hiding the strip — trapping the operator with no way back. The probe finds no fourth row.
        const exact = await readFleetMailboxMirror({
            capturedAt: CAPTURED_AT, resolveBoundIdentity: boundAs('@tobiu'), subjectAgentId: '@neo-gpt',
            limit     : 3, listMessages: read
        })
        expect(exact.rows).toHaveLength(3);
        expect(exact.page, 'a full page that IS the last page must say so').toMatchObject({limit: 3, count: 3, hasMore: false})
    })

    test('pagination bounds: limit clamps to [1, MAX], offset clamps to >= 0, bounds echo on the snapshot', async () => {
        const calls = []
        const read  = async args => { calls.push(args); return {messages: []} }

        const paged = bounds => readFleetMailboxMirror({
            capturedAt          : CAPTURED_AT,
            resolveBoundIdentity: boundAs('@tobiu'),
            subjectAgentId      : '@neo-gpt',
            listMessages        : read,
            ...bounds
        })

        // the READ probes one row past the page (to learn hasMore honestly); the SNAPSHOT still
        // echoes — and returns — the clamped page bound. The two numbers differ by exactly one, on
        // purpose: `limit` is what the caller gets, `limit + 1` is what the question costs.
        const over = await paged({limit: 9999, offset: -5})
        expect(calls[0].limit).toBe(MAX_FLEET_MAILBOX_MIRROR_LIMIT + 1)
        expect(calls[0].offset).toBe(0)
        expect(over.page).toEqual({limit: MAX_FLEET_MAILBOX_MIRROR_LIMIT, offset: 0, count: 0, hasMore: false})

        await paged({limit: 0, offset: 25.7})
        expect(calls[1].limit).toBe(2)   // clamped 1 + the probe row
        expect(calls[1].offset).toBe(25)

        await paged({limit: 'not-a-number'})
        expect(calls[2].limit).toBe(DEFAULT_FLEET_MAILBOX_MIRROR_LIMIT + 1)   // default + the probe row
    })

    test('active-inbox default is STRUCTURAL: the adapter never forwards an includeArchived key', async () => {
        const calls = []
        await readFleetMailboxMirror({
            capturedAt          : CAPTURED_AT,
            resolveBoundIdentity: boundAs('@tobiu'),
            subjectAgentId      : '@neo-gpt',
            listMessages        : async args => { calls.push(args); return {messages: []} }
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

    test('self-read maps through unchanged: the audit fact still records both sides', async () => {
        const calls    = []
        const snapshot = await readFleetMailboxMirror({
            capturedAt          : CAPTURED_AT,
            resolveBoundIdentity: boundAs('neo-opus-vega'),
            subjectAgentId      : 'neo-opus-vega',
            listMessages        : async args => { calls.push(args); return {messages: []} }
        })

        // viewer === subject: the adapter adds no special casing — the primitive's own
        // self-read path (no grant required) governs; the audit fact still records both.
        expect(snapshot.admission.viewerIdentity).toBe('@neo-opus-vega')
        expect(snapshot.admission.subjectAgentId).toBe('@neo-opus-vega')
        expect(calls[0].to).toBe('@neo-opus-vega')
    })

    test('redaction matrix: no supported credential family crosses into a Body-facing subject or reason', () => {
        const cases = [
            {name: 'github pat',        secret: 'ghp_abc123SECRET',       text: 'rotate token: ghp_abc123SECRET now'},
            {name: 'gitlab pat',        secret: 'glpat-zzz999LEAK',       text: 'CI uses glpat-zzz999LEAK for the mirror'},
            {name: 'bearer header',     secret: 'super-secret',           text: 'retry with Authorization: Bearer super-secret'},
            {name: 'bare bearer',       secret: 'eyJhbGciOiJIUzI1NiJ9',   text: 'sent Bearer eyJhbGciOiJIUzI1NiJ9 upstream'},
            {name: 'assignment form',   secret: 'hunter2',               text: 'password=hunter2 rejected'},
            {name: 'authorization key', secret: 'ghs_serviceLEAK',        text: 'authorization: ghs_serviceLEAK denied'}
        ]

        cases.forEach(({name, secret, text}) => {
            const viaSubject = createFleetMailboxMirrorSnapshot({
                capturedAt: CAPTURED_AT,
                viewer    : '@tobiu',
                subject   : '@neo-gpt',
                messages  : [{messageId: 'MESSAGE:x', subject: text, sentAt: CAPTURED_AT}]
            })
            expect(viaSubject.rows[0].subject, `${name} must not cross via subject`).not.toContain(secret)

            const viaReason = createFleetMailboxMirrorSnapshot({
                capturedAt: CAPTURED_AT,
                viewer    : '@tobiu',
                subject   : '@neo-gpt',
                error     : new Error(`Unauthorized: no CAN_READ_INBOX_OF permission for @neo-gpt (${text})`)
            })
            expect(viaReason.admission.state).toBe('denied')
            expect(viaReason.admission.reason, `${name} must not cross via reason`).not.toContain(secret)
        })
    })
})

/**
 * RA-1's producer-contract witness. The suite above proves the MAPPER; a synthetic
 * MailboxService-shaped callback can hand it any field, including one production never emits —
 * which is exactly how `partOfThread` shipped green while always projecting null. These specs drive
 * the adapter through the REAL MailboxService read path under a REAL RequestContextService binding,
 * so the row's thread fact is the graph's, not the fixture's.
 */
test.describe('fleetMailboxMirrorAdapter — real MailboxService producer contract', () => {
    test.describe.configure({mode: 'serial'})

    let GraphService, LifecycleService, MailboxService, PermissionService, mirrorAiConfig, originalAutoSave

    test.beforeAll(async () => {

        mirrorAiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default

        // Dynamic imports: the services mount the SQLite DB at module scope.
        GraphService      = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default
        MailboxService    = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default
        PermissionService = (await import('../../../../../../ai/services/memory-core/PermissionService.mjs')).default
        LifecycleService  = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync()
        } else {
            await LifecycleService.ready()
        }
        originalAutoSave         = GraphService.db.autoSave
        GraphService.db.autoSave = true
    })

    test.afterAll(async () => {
        const {cleanupChromaManager} = await import('../memory-core/util.mjs')
        await cleanupChromaManager()
        GraphService.db.autoSave = originalAutoSave

    })

    test.beforeEach(async () => {
        MailboxService.clearRelatedPullRequestStateCache()
        if (GraphService.db) {
            GraphService.db.nodes.clear()
            GraphService.db.edges.clear()
            GraphService.db.vicinityLoadedNodes.clear()

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear()
                GraphService.db.storage.db.exec('DELETE FROM GraphLog')
            }
        }

        GraphService.upsertNode({id: '@subject-agent',  type: 'AgentIdentity', name: 'Subject',  properties: {accountType: 'agent'}})
        GraphService.upsertNode({id: '@viewer-agent',   type: 'AgentIdentity', name: 'Viewer',   properties: {accountType: 'agent'}})
        GraphService.upsertNode({id: '@outsider-agent', type: 'AgentIdentity', name: 'Outsider', properties: {accountType: 'agent'}})
        GraphService.upsertNode({id: '@sender-agent',   type: 'AgentIdentity', name: 'Sender',   properties: {accountType: 'agent'}})
        GraphService.upsertNode({id: 'AGENT:*',         type: 'BroadcastSentinel', name: 'Broadcast', properties: {}})
        GraphService.upsertNode({id: 'THREAD:15269',    type: 'THREAD', name: 'Mirror thread', properties: {}})
    })

    /**
     * @summary Seed one threaded + one unthreaded message into the subject's real inbox.
     */
    async function seedInbox() {
        await RequestContextService.run({agentIdentityNodeId: '@sender-agent'}, async () => {
            await MailboxService.addMessage({
                to          : '@subject-agent',
                subject     : '[repair-lane] one accepted head needed',
                body        : 'FULL BODY MUST NOT LEAK',
                priority    : 'high',
                partOfThread: 'THREAD:15269'
            })
            await MailboxService.addMessage({to: '@subject-agent', subject: 'unthreaded note', body: 'body'})
        })
    }

    test('granted: the row thread fact comes from the REAL listMessages summary, not a fixture', async () => {
        await seedInbox()

        await RequestContextService.run({agentIdentityNodeId: '@subject-agent'}, async () => {
            await PermissionService.grantPermission({to: '@viewer-agent', scope: 'CAN_READ_INBOX_OF'})
        })

        const snapshot = await RequestContextService.run({agentIdentityNodeId: '@viewer-agent'}, async () =>
            readFleetMailboxMirror({
                capturedAt          : CAPTURED_AT,
                subjectAgentId      : '@subject-agent',
                resolveBoundIdentity: boundIdentity,
                listMessages        : args => MailboxService.listMessages(args)
            })
        )

        expect(snapshot.admission.state).toBe('granted')
        // the audit viewer is the request binding the read actually ran under
        expect(snapshot.admission.viewerIdentity).toBe('@viewer-agent')
        expect(snapshot.admission.subjectAgentId).toBe('@subject-agent')

        const threaded = snapshot.rows.find(row => row.subject === '[repair-lane] one accepted head needed')
        const loose    = snapshot.rows.find(row => row.subject === 'unthreaded note')

        // THE producer contract: this thread id survived MailboxService.listMessages' own summary.
        expect(threaded.partOfThread).toBe('THREAD:15269')
        expect(threaded.from).toBe('@sender-agent')
        expect(threaded.priority).toBe('high')
        expect(loose.partOfThread).toBe(null)

        // still body-free through the real path
        expect(Object.keys(threaded)).not.toContain('body')
        expect(JSON.stringify(snapshot)).not.toContain('FULL BODY MUST NOT LEAK')
    })

    test('denied: a viewer without the grant gets the primitive real fail-closed throw as denial', async () => {
        await seedInbox()

        const snapshot = await RequestContextService.run({agentIdentityNodeId: '@outsider-agent'}, async () =>
            readFleetMailboxMirror({
                capturedAt          : CAPTURED_AT,
                subjectAgentId      : '@subject-agent',
                resolveBoundIdentity: boundIdentity,
                listMessages        : args => MailboxService.listMessages(args)
            })
        )

        expect(snapshot.admission.state).toBe('denied')
        expect(snapshot.admission.viewerIdentity).toBe('@outsider-agent')
        expect(snapshot.admission.reason).toContain('CAN_READ_INBOX_OF')
        expect(snapshot.rows).toEqual([])
        expect(snapshot.capability.state).toBe('degraded')
    })

    test('the AGENT:* bypass is unreachable: the sentinel never returns a granted mirror', async () => {
        await seedInbox()

        // MailboxService.listMessages skips CAN_READ_INBOX_OF when target === 'AGENT:*', and
        // PermissionService.hasPermission returns true for it — this asserts the adapter refuses
        // BEFORE that bypass can hand an ungranted outsider a `granted` snapshot.
        const snapshot = await RequestContextService.run({agentIdentityNodeId: '@outsider-agent'}, async () =>
            readFleetMailboxMirror({
                capturedAt          : CAPTURED_AT,
                subjectAgentId      : 'AGENT:*',
                resolveBoundIdentity: boundIdentity,
                listMessages        : args => MailboxService.listMessages(args)
            })
        )

        expect(snapshot.admission.state).not.toBe('granted')
        expect(snapshot.rows).toEqual([])
    })
})
