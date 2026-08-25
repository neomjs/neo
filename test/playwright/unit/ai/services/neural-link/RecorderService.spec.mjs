import {setup} from '../../../../setup.mjs';

// Action logging is OFF by default per seat, so this suite — which exercises the telemetry admission
// path — must opt IN. Set before `setup()` because the config leaf binds this env at module-load time,
// and mutating the shared config singleton at runtime is forbidden. The complementary default-OFF proof
// lives in `RecorderServiceDefaultOff.spec.mjs`, which spawns fresh child processes precisely because
// this assignment is process-wide and cannot be undone.
process.env.NEO_NL_ACTION_LOGGING = 'true';

const appName = 'RecorderServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * The archive and the telemetry channel no longer live in a host SQLite file — both travel outbound to
 * Memory Core through named operations. So this suite asserts the OUTBOUND CONTRACT (which operation is
 * called, with which payload, and what the caller sees come back) rather than rows in a table.
 *
 * Every arm injects the transport. That is not convenience: with a credential present the real client
 * waits on a live connection and this suite HANGS, and without one it fails on a missing environment
 * variable — neither of which is the behaviour under test. Measured the hard way; before the seam existed
 * both files ran past ten minutes without completing.
 */
/**
 * The shape an opaque correlation token must have. A UUID cannot encode `${agentId}_${turnId}`, so
 * asserting the shape asserts the property.
 * @type {RegExp}
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test.describe('Neo.ai.services.neural-link.RecorderService', () => {
    let RecorderService, setArchiveTransport, resetArchiveClient, calls;

    test.beforeAll(async () => {
        RecorderService = (await import('../../../../../../ai/services/neural-link/RecorderService.mjs')).default;

        ({setArchiveTransport, resetArchiveClient} =
            await import('../../../../../../ai/services/neural-link/memoryCoreArchiveClient.mjs'));

        await RecorderService.initAsync();
    });

    test.beforeEach(() => {
        calls = [];
    });

    test.afterEach(async () => {
        await resetArchiveClient();
    });

    /** Records every call and answers whatever the arm declares. */
    function stubTransport(answers = {}) {
        setArchiveTransport(async (operation, args) => {
            calls.push({operation, args});

            const answer = answers[operation];

            if (typeof answer === 'function') return answer(args);

            return answer ?? null;
        });
    }

    test('boot opens no store — both contracts are reachable on demand instead', async () => {
        // The relocation's headline property, asserted rather than assumed: there is no host-side handle
        // left whose absence could silently disable a write. `initAsync` ran in beforeAll.
        expect(RecorderService.db).toBeUndefined();
    });

    test('a logged tool invocation admits the DECIDED record set, and drops everything else', async () => {
        stubTransport({admit_nl_actions: {admitted: 1, refused: 0}});

        RecorderService.log({
            agent_id   : 'agent-123',
            session_id : 'session-456',
            sequence_id: 'agent-123_turn-9',
            timestamp  : 1_700_000_000_000,
            tool       : 'create_component',
            args       : JSON.stringify({className: 'Neo.button.Base', componentId: 'btn-1', secret: 'do-not-store'}),
            result     : JSON.stringify({huge: 'payload'}),
            success    : true,
            duration_ms: 42,
            app_name   : appName
        });

        // `log` is fire-and-forget by design — telemetry must never block the tool call that produced it —
        // so the assertion waits for the admission rather than assuming it already happened.
        await expect.poll(() => calls.length).toBe(1);

        const [{operation, args}] = calls,
              [action]            = args.actions;

        expect(operation).toBe('admit_nl_actions');

        expect(action).toEqual({
            sequenceId: expect.stringMatching(UUID),
            sessionId : 'session-456',
            timestamp : 1_700_000_000_000,
            tool      : 'create_component',
            success   : true,
            durationMs: 42,
            appName,
            targets   : {classNames: ['Neo.button.Base'], componentIds: ['btn-1']}
        });

        // THE DROPPED SET IS ASSERTED, NOT MERELY OMITTED. Omission-by-forgetting and omission-by-contract
        // look identical in a passing test, so the contract has to be the thing under test.
        expect(action).not.toHaveProperty('agent_id');
        expect(action).not.toHaveProperty('agentId');
        expect(action).not.toHaveProperty('result');
        expect(action).not.toHaveProperty('args');
        expect(action).not.toHaveProperty('reward');

        // And the raw argument that is neither a class nor a component id never crosses.
        expect(JSON.stringify(action)).not.toContain('do-not-store');

        // The host's `sequence_id` encoded `${agentId}_${turnId}` — correlation that WAS identity. It must
        // not be forwarded; Memory Core mints its own opaque token.
        expect(JSON.stringify(action)).not.toContain('agent-123');
    });

    test('the correlation token GROUPS a sequence without carrying its identity', async () => {
        // THE PROPERTY A PER-ROW TOKEN SILENTLY DESTROYS. `GapInferenceEngine` groups actions by
        // `sequenceId` and scores each group's success rate, so a token minted per row would make every
        // sequence exactly one action long — a digest that still runs, still reports, and measures
        // nothing. "Fresh and opaque" is satisfied by both shapes; only this arm tells them apart.
        stubTransport({admit_nl_actions: {admitted: 1, refused: 0}});

        const log = (sequence, timestamp) => RecorderService.log({
            agent_id   : 'agent-123',
            session_id : 'session-456',
            sequence_id: sequence,
            timestamp,
            tool       : 'set_instance_properties',
            success    : true,
            duration_ms: 5,
            app_name   : appName
        });

        log('agent-123_turn-9',  1_700_000_000_000);
        log('agent-123_turn-9',  1_700_000_000_001);
        log('agent-123_turn-10', 1_700_000_000_002);

        await expect.poll(() => calls.length).toBe(3);

        const [first, second, third] = calls.map(call => call.args.actions[0].sequenceId);

        expect(first).toMatch(UUID);
        expect(second).toBe(first);
        expect(third).not.toBe(first);

        // And the token is a SUBSTITUTE, never the host's own key — which encoded the agent id.
        expect([first, third]).not.toContain('agent-123_turn-9');
        expect(JSON.stringify(calls)).not.toContain('agent-123');
    });

    test('a bare id counts as a target only for component tools', async () => {
        // The one conditional in the allowlist that moved host-side, and the one a re-implementation
        // drops. `get_record({id})` names a RECORD; admitting it would link weak validation evidence to
        // a node the action never touched.
        stubTransport({admit_nl_actions: {admitted: 1, refused: 0}});

        RecorderService.log({
            session_id : 'session-456', timestamp: 1, tool: 'get_record', success: true,
            duration_ms: 1, app_name: appName, args: JSON.stringify({id: 'record-77'})
        });

        await expect.poll(() => calls.length).toBe(1);
        expect(calls[0].args.actions[0].targets).toEqual({classNames: [], componentIds: []});

        // POSITIVE CONTROL: the same key on a component tool IS a target, so the empty result above is
        // the condition firing rather than the projection being broken.
        RecorderService.log({
            session_id : 'session-456', timestamp: 2, tool: 'create_component', success: true,
            duration_ms: 1, app_name: appName, args: JSON.stringify({id: 'btn-9'})
        });

        await expect.poll(() => calls.length).toBe(2);
        expect(calls[1].args.actions[0].targets).toEqual({classNames: [], componentIds: ['btn-9']});
    });

    test('a failed invocation admits success false rather than dropping the row', async () => {
        stubTransport({admit_nl_actions: {admitted: 1, refused: 0}});

        RecorderService.log({
            session_id : 'session-456',
            timestamp  : 1_700_000_000_001,
            tool       : 'patch_code',
            success    : false,
            duration_ms: 7,
            app_name   : appName
        });

        await expect.poll(() => calls.length).toBe(1);

        // A failure is evidence, and the digest's consumers read `success` — dropping the row would make
        // the failure rate unmeasurable rather than zero.
        expect(calls[0].args.actions[0].success).toBe(false);
    });

    test('save, read, and replay-mark travel to their named operations and preserve the shipped shape', async () => {
        const transaction = {
            txId        : 'tx-1',
            status      : 'committed',
            committedAt : 1_700_000_000_000,
            originWriter: {agentId: 'agent-1', sessionId: 'session-1'},
            ops         : [{method: 'setConfigs', args: [{id: 'c1', text: 'hi'}]}]
        };

        stubTransport({
            save_nl_transaction         : {saved: true, archiveId: 'arch-1', sourceTxId: 'tx-1', opCount: 1},
            get_nl_transaction          : {status: 'found', archiveId: 'arch-1', ops: transaction.ops, committedAt: 1_700_000_000_000, sourceTxId: 'tx-1', originWriter: transaction.originWriter, replayCount: 0},
            mark_nl_transaction_replayed: {updated: true, replayCount: 1, lastReplayedAt: 99}
        });

        const saved = await RecorderService.saveTransactionArchive({appSessionId: 'app-1', name: ' named ', transaction});

        expect(saved).toMatchObject({saved: true, archiveId: 'arch-1', sourceTxId: 'tx-1'});
        expect(calls[0].operation).toBe('save_nl_transaction');
        expect(calls[0].args.transaction.txId).toBe('tx-1');

        const archive = await RecorderService.getTransactionArchive({archiveId: 'arch-1'});

        expect(calls[1].operation).toBe('get_nl_transaction');
        // Replay reconstructs from these three; a relocation that lost any of them would break replay
        // rather than the archive.
        expect(archive).toMatchObject({ops: transaction.ops, sourceTxId: 'tx-1', originWriter: transaction.originWriter});

        expect(archive.status).toBe('found');

        expect(await RecorderService.recordTransactionReplay({archiveId: 'arch-1'}))
            .toEqual({updated: true, replayCount: 1, lastReplayedAt: 99});
        expect(calls[2].operation).toBe('mark_nl_transaction_replayed');
    });

    test('an unreachable store is UNAVAILABLE on read, not an absent archive', async () => {
        setArchiveTransport(async () => { throw new Error('ingress unreachable') });

        const archive = await RecorderService.getTransactionArchive({archiveId: 'arch-1'}),
              mark    = await RecorderService.recordTransactionReplay({archiveId: 'arch-1'});

        // Both used to collapse into the contract's ordinary "no archive" answers — `null` and
        // `{updated: false}` — which made an out-of-reach store indistinguishable from a deleted archive
        // at every caller above.
        expect(archive.status).toBe('unavailable');
        expect(archive.reason).toContain('archive-store-unavailable');
        expect(mark).toMatchObject({updated: false, status: 'unavailable'});
        expect(mark.reason).toContain('archive-store-unavailable');

        // POSITIVE CONTROL: the same seam yields a genuine not-found, so `unavailable` above is a
        // discrimination rather than the only answer this path can produce.
        setArchiveTransport(async () => ({status: 'not-found'}));

        expect((await RecorderService.getTransactionArchive({archiveId: 'arch-1'})).status).toBe('not-found')
    });

    test('a reply carrying no payload is unavailable, never a silent absence', async () => {
        // MCP resolves with empty content for a server that answered nothing at all. Reading that as
        // not-found would report an archive gone on the strength of a reply that said nothing.
        setArchiveTransport(async () => null);

        expect(await RecorderService.getTransactionArchive({archiveId: 'arch-1'}))
            .toMatchObject({status: 'unavailable'});
        expect(await RecorderService.recordTransactionReplay({archiveId: 'arch-1'}))
            .toMatchObject({updated: false, status: 'unavailable'})
    });

    test('a non-data op is refused BEFORE the wire, naming the offending path', async () => {
        stubTransport({save_nl_transaction: {saved: true, archiveId: 'unreachable'}});

        const result = await RecorderService.saveTransactionArchive({
            transaction: {
                txId        : 'tx-2',
                status      : 'committed',
                originWriter: {agentId: 'a', sessionId: 's'},
                ops         : [{method: 'setConfigs', args: [{onClick: () => {}}]}]
            }
        });

        expect(result.saved).toBe(false);
        expect(result.reason).toContain('transaction-not-data-only');

        // The guard stays host-side on purpose: JSON transport cannot carry a function, so a container-side
        // check would only ever see a shape error with no idea which op produced it. Proving the call never
        // left is what makes "before the wire" a fact rather than a comment.
        expect(calls).toEqual([]);
    });

    test('an unreachable Memory Core FAILS the archive by name — never a silent local fallback', async () => {
        setArchiveTransport(async () => { throw new Error('ingress unreachable') });

        const result = await RecorderService.saveTransactionArchive({
            transaction: {
                txId        : 'tx-3',
                status      : 'committed',
                originWriter: {agentId: 'a', sessionId: 's'},
                ops         : [{method: 'setConfigs', args: [{id: 'c1'}]}]
            }
        });

        // The whole point of the relocation: no host-local fallback. A friendlier failure that wrote a
        // local file would re-create the two realities this work removes.
        expect(result).toMatchObject({saved: false});
        expect(result.reason).toContain('archive-store-unavailable');
    });

    test('the dormant telemetry readers are GONE, not ported', async () => {
        // `querySequences` and `pruneOlderThan` had no production caller. Porting a dead method and calling
        // retention governed is refused by this ticket's own AC, so their absence is asserted — otherwise a
        // future reader restores them believing they were an oversight.
        expect(RecorderService.querySequences).toBeUndefined();
        expect(RecorderService.pruneOlderThan).toBeUndefined();
    });
});
