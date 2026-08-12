/**
 * @module ai/services/shared/vector/electionGatedPromote
 * @summary Election-gated two-rename promote and un-park for collections without a service seam.
 *
 * The KB shadow-swap and the MC restore adapter carry their own election hooks; the temporal-summary
 * and graph-node collections have no such seam, so the rebuild runner performs their transition
 * renames through this helper. Every rename passes the captured-view fence immediately before it
 * runs — including the quiesce-window check for transition renames — and completion is reported to
 * the election record afterwards, with the same posture as the seams: a lost completion mark only
 * keeps acceptance blocked, it never unwinds a successful rename.
 *
 * The Chroma client enters through one injected `getCollection(name)` seam (resolves a collection
 * object exposing `modify({name})`, or `null` when absent), so the helper stays engine-agnostic and
 * unit-testable against the same fake-client shape the restore adapter's suite uses.
 *
 * A collection whose promote never ran has nothing to un-park after a rollback; the runner records
 * that collection's un-park completion directly instead of calling {@link unparkCollectionUnderElection}.
 */

import {
    assertCapturedPromoteView,
    recordPromoteCompletion,
    recordUnparkCompletion
} from './generationElectionStore.mjs';

/**
 * @summary Promotes one shadow collection to its canonical name under the election fence.
 *
 * Rename order matches the KB seam: live → parking, shadow → canonical. A failure between the two
 * renames un-parks the live collection before rethrowing, so a crash cannot leave the canonical
 * name unserved.
 *
 * @param {Object} options
 * @param {Function} options.getCollection Async `name => collection|null` client seam.
 * @param {String} options.canonicalName Reader-visible collection name.
 * @param {String} options.shadowName Fully built candidate collection.
 * @param {String} options.parkingName Rollback-authority name for the displaced live collection.
 * @param {String} options.dir Declared plane-state directory.
 * @param {String} options.collectionKey Census key this promote serves.
 * @param {Object} options.view Result of `captureVectorPromoteView` taken before the build.
 * @param {Number|Date} [options.now=Date.now()] Deterministic clock seam for the window check.
 * @returns {Promise<Object>} `{admission, parkingName, completionRecorded, completionError}`.
 * @throws {Error} When the fence refuses, or a collection precondition fails — before any rename.
 */
export async function promoteCollectionUnderElection({
    getCollection,
    canonicalName,
    shadowName,
    parkingName,
    dir,
    collectionKey,
    view,
    now = Date.now()
} = {}) {
    assertNames({canonicalName, shadowName, parkingName}, 'promoteCollectionUnderElection');

    const admission = await assertCapturedPromoteView({dir, collectionKey, view, now});
    const live      = await getCollection(canonicalName);
    const shadow    = await getCollection(shadowName);

    if (!shadow) {
        throw new Error(`promoteCollectionUnderElection: shadow collection '${shadowName}' is missing`)
    }

    if (!live) {
        throw new Error(`promoteCollectionUnderElection: canonical collection '${canonicalName}' is missing; a promote replaces a live corpus, it does not create one`)
    }

    if (await getCollection(parkingName)) {
        throw new Error(`promoteCollectionUnderElection: parking collection '${parkingName}' already exists`)
    }

    await live.modify({name: parkingName});

    let promoted = false;

    try {
        await shadow.modify({name: canonicalName});
        promoted = true
    } finally {
        if (!promoted) {
            // Crash-rollback: the canonical name must never be left unserved. Best-effort by
            // design — the throw in flight is the primary signal and must not be masked.
            try {
                await live.modify({name: canonicalName})
            } catch {}
        }
    }

    const completion = await maybeRecordCompletion({
        admission,
        expectStatus: 'committed',
        record      : () => recordPromoteCompletion({dir, collectionKey, expectedEpoch: admission.epoch, now})
    });

    return {admission, parkingName, ...completion}
}

/**
 * @summary Restores one parked collection to its canonical name after a rollback, under the fence.
 *
 * When the abandoned generation's collection currently holds the canonical name (its promote ran
 * before the rollback), it is moved aside to `abandonedName` first; a failure between the renames
 * moves it back so the canonical name stays served.
 *
 * @param {Object} options
 * @param {Function} options.getCollection Async `name => collection|null` client seam.
 * @param {String} options.canonicalName Reader-visible collection name.
 * @param {String} options.parkingName Where the restored generation is parked.
 * @param {String} [options.abandonedName] Required when the abandoned generation holds the canonical name.
 * @param {String} options.dir Declared plane-state directory.
 * @param {String} options.collectionKey Census key this un-park serves.
 * @param {Object} options.view Result of `captureVectorPromoteView` taken after the rollback.
 * @param {Number|Date} [options.now=Date.now()] Deterministic clock seam for the window check.
 * @returns {Promise<Object>} `{admission, movedAbandonedTo, completionRecorded, completionError}`.
 * @throws {Error} When the fence refuses, or a collection precondition fails — before any rename.
 */
export async function unparkCollectionUnderElection({
    getCollection,
    canonicalName,
    parkingName,
    abandonedName = null,
    dir,
    collectionKey,
    view,
    now = Date.now()
} = {}) {
    assertNames({canonicalName, parkingName}, 'unparkCollectionUnderElection');

    const admission = await assertCapturedPromoteView({dir, collectionKey, view, now});
    const parked    = await getCollection(parkingName);
    const current   = await getCollection(canonicalName);

    if (!parked) {
        throw new Error(`unparkCollectionUnderElection: parking collection '${parkingName}' is missing; nothing to restore`)
    }

    if (current) {
        if (typeof abandonedName !== 'string' || abandonedName.length === 0) {
            throw new Error(`unparkCollectionUnderElection: '${canonicalName}' is currently served by the abandoned generation; abandonedName is required to move it aside`)
        }

        if (await getCollection(abandonedName)) {
            throw new Error(`unparkCollectionUnderElection: abandoned-name collection '${abandonedName}' already exists`)
        }

        await current.modify({name: abandonedName})
    }

    let restored = false;

    try {
        await parked.modify({name: canonicalName});
        restored = true
    } finally {
        if (!restored && current) {
            try {
                await current.modify({name: canonicalName})
            } catch {}
        }
    }

    const completion = await maybeRecordCompletion({
        admission,
        expectStatus: 'rolled-back',
        record      : () => recordUnparkCompletion({dir, collectionKey, expectedEpoch: admission.epoch, now})
    });

    return {admission, movedAbandonedTo: current ? abandonedName : null, ...completion}
}

/**
 * @summary Reports transition completion to the record, never unwinding a successful rename.
 * @param {Object} options
 * @param {Object} options.admission Fence result the rename ran under.
 * @param {String} options.expectStatus Election status under which completion applies.
 * @param {Function} options.record Completion call.
 * @returns {Promise<{completionRecorded: Boolean, completionError: (String|null)}>}
 * @private
 */
async function maybeRecordCompletion({admission, expectStatus, record}) {
    if (admission.mode !== 'elected' || admission.electionStatus !== expectStatus) {
        return {completionRecorded: false, completionError: null}
    }

    try {
        await record();
        return {completionRecorded: true, completionError: null}
    } catch (error) {
        // The rename landed; a lost mark only keeps acceptance (or the next candidate) blocked
        // until repaired — fail-safe in the direction of retained rollback authority.
        return {completionRecorded: false, completionError: error.message}
    }
}

function assertNames(names, label) {
    for (const [key, value] of Object.entries(names)) {
        if (typeof value !== 'string' || value.length === 0) {
            throw new TypeError(`${label}: ${key} is required`)
        }
    }
}
