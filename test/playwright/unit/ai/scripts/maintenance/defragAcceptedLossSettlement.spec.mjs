import {test, expect} from '@playwright/test';
import os             from 'os';
import fsp            from 'fs/promises';
import path           from 'path';
import {
    acceptedLossAckDir,
    buildMemoryCoreRecoveryContext,
    settleAcknowledgedPartialPromotion,
    writeDefragState
}                                  from '../../../../../../ai/scripts/maintenance/defragChromaDB.mjs';
import {createAcceptedLossAckEntry} from '../../../../../../ai/services/memory-core/helpers/acceptedLossAck.mjs';
import {appendAcceptedLossAck}      from '../../../../../../ai/services/memory-core/helpers/acceptedLossAckStore.mjs';

// The end-to-end operator workflow: a partial-promoted repair leaves a state marker; the operator
// acknowledges the terminal residue; a RERUN must settle it as accepted-loss (clear the marker -> exit 0)
// instead of aborting at the incomplete-state guard (which excludes the partial-promoted phase). An
// UNacknowledged marker must NOT settle — it falls through to the guard, which escalates it.

const config  = {embeddingProvider: 'openAiCompatible'},
      residue = [{id: 'a', reason: 'embedding-context-exceeded'}];

async function exists(p) {
    return fsp.access(p).then(() => true, () => false);
}

test.describe('settleAcknowledgedPartialPromotion — the acknowledge -> rerun settlement (#14118)', () => {
    let dir, statePath;

    test.beforeEach(async () => {
        dir       = await fsp.mkdtemp(path.join(os.tmpdir(), 'neo-defrag-settle-'));
        statePath = path.join(dir, 'defrag-state.json');
        await writeDefragState({statePath, state: {
            phase                    : 'memory-core-repair-partial-promoted',
            unrecoverableByCollection: {'mc-memory': residue}
        }});
    });

    test.afterEach(async () => {
        await fsp.rm(dir, {recursive: true, force: true});
    });

    async function acknowledge() {
        const ctx = buildMemoryCoreRecoveryContext(config),
              ack = createAcceptedLossAckEntry({residue, operatorId: '@tobiu', acknowledgedAt: 1, ...ctx});
        await appendAcceptedLossAck({entry: ack, dir: acceptedLossAckDir(statePath)});
    }

    test('an acknowledged partial-promotion marker settles: clears the marker + returns true', async () => {
        await acknowledge();

        expect(await settleAcknowledgedPartialPromotion({config, statePath})).toBe(true);
        expect(await exists(statePath)).toBe(false);   // marker cleared -> the rerun is clean -> exit 0
    });

    test('an UNacknowledged partial-promotion marker does NOT settle: returns false, marker stays (escalates at the guard)', async () => {
        expect(await settleAcknowledgedPartialPromotion({config, statePath})).toBe(false);
        expect(await exists(statePath)).toBe(true);
    });

    test('a stale ack (residue changed since the ack) does NOT settle', async () => {
        await acknowledge();
        // The live marker residue changed after the ack -> the fingerprint no longer matches.
        await writeDefragState({statePath, state: {
            phase                    : 'memory-core-repair-partial-promoted',
            unrecoverableByCollection: {'mc-memory': [...residue, {id: 'c', reason: 'document-absent'}]}
        }});

        expect(await settleAcknowledgedPartialPromotion({config, statePath})).toBe(false);
        expect(await exists(statePath)).toBe(true);
    });

    test('no marker -> returns false (a normal first run proceeds to the pipeline)', async () => {
        await fsp.rm(statePath, {force: true});
        expect(await settleAcknowledgedPartialPromotion({config, statePath})).toBe(false);
    });
});
