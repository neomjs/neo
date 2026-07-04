import {buildConvergenceSnapshotNode} from './convergenceSnapshotSchema.mjs';

/**
 * @module ai/services/graph/convergenceCompute
 * @summary Convergence-weighted Golden Path — compute (ticket-ref-ok: #14634 owning-leaf anchor; Leaf 2 of #14581).
 *
 * Weights each goal→sub-goal lattice node by how many of N imagined futures it lies on ("the narrow way
 * through the choke-points every trajectory crosses"), on the canonical-id snapshots the Leaf 1 schema
 * mints. ADDITIVE + FAIL-OPEN: the output is annotation only; on any error it degrades to an empty result,
 * never a Golden Path routing change.
 *
 * Two correctness invariants:
 *   - **OQ7 independence budget:** correlated futures inflate convergence (a node in all N futures is not
 *     cross-future-invariant if the N futures are the same future repeated). Every run carries the future
 *     set's mean pairwise dissimilarity so downstream can discount correlated agreement.
 *   - **OQ8 generator firewall (standing invariant):** every run emits an input manifest attesting it read
 *     NEITHER peer future-sets NOR prior convergence output — so convergence can never feed back into the
 *     agent future-generation context and become self-fulfilling.
 */

/**
 * @summary OQ7 independence budget — the future set's mean pairwise Jaccard DISTANCE: `0` = all futures
 * identical (fully correlated; convergence is inflated), `1` = all disjoint (maximally independent). A
 * single real future is trivially `1` (no correlation to measure). Empty futures carry NO evidence and are
 * dropped before budgeting, so `[[], []]` is not mis-read as two maximally-independent futures — an
 * all-empty set is `0` (no-confidence), not `1`.
 * @param {Array<Iterable<String>>} futurePaths N imagined futures, each an iterable of canonical node ids.
 * @returns {Number} independence budget in `[0, 1]`.
 */
export function computeIndependenceBudget(futurePaths) {
    const futures = (Array.isArray(futurePaths) ? futurePaths : [])
        .map(future => new Set(future))
        .filter(future => future.size > 0);   // empty futures carry no evidence — drop before budgeting

    if (futures.length === 0) return 0;   // no-confidence: nothing to measure
    if (futures.length < 2)   return 1;   // a single real future is trivially independent

    let distanceSum = 0,
        pairCount   = 0;

    for (let i = 0; i < futures.length; i++) {
        for (let j = i + 1; j < futures.length; j++) {
            const a            = futures[i],
                  b            = futures[j],
                  intersection = [...a].filter(id => b.has(id)).length,
                  union        = new Set([...a, ...b]).size,
                  jaccard      = union === 0 ? 0 : intersection / union;

            distanceSum += 1 - jaccard;
            pairCount++;
        }
    }

    return pairCount === 0 ? 1 : distanceSum / pairCount;
}

/**
 * @summary OQ8 generator-firewall input manifest: proof that a compute run read neither peer future-sets
 * nor prior convergence output. `firewallClean` is the single gate downstream checks before trusting the
 * run — a run that read either source is not firewall-clean and its output must not re-enter generation.
 * @param {Object}  [input]
 * @param {String}  [input.futureSource='unspecified'] Provenance label for the future set.
 * @param {Boolean} [input.readPeerFutureSets=false]   Did the run read other agents' future sets?
 * @param {Boolean} [input.readPriorConvergence=false] Did the run read prior convergence output?
 * @returns {Object} frozen manifest with a derived `firewallClean` flag.
 */
export function buildConvergenceInputManifest({futureSource = 'unspecified', readPeerFutureSets = false, readPriorConvergence = false} = {}) {
    return Object.freeze({
        futureSource,
        readPeerFutureSets  : readPeerFutureSets === true,
        readPriorConvergence: readPriorConvergence === true,
        firewallClean       : readPeerFutureSets !== true && readPriorConvergence !== true
    });
}

/**
 * @summary Computes convergence-weighted snapshots for the lattice nodes over N imagined futures.
 * Convergence weight = the count of futures a node's canonical id lies on; the OQ7 independence budget is
 * attached to every snapshot. Keyed on the Leaf 1 schema's canonical ids (via `buildConvergenceSnapshotNode`
 * — no id re-derivation). ADDITIVE + FAIL-OPEN: on any error the snapshot set is empty (never a routing
 * mutation). Generator-firewalled — the returned manifest attests isolation.
 *
 * @param {Object}                  [input]
 * @param {String[]}                [input.latticeNodeIds=[]] Raw goal/sub-goal ids to weight.
 * @param {Array<Iterable<String>>} [input.futurePaths=[]]    N imagined futures (canonical node ids).
 * @param {String}                  [input.provenance]        OQ1 id provenance, forwarded to the schema.
 * @param {Object}                  [input.manifest]          Firewall manifest inputs (see `buildConvergenceInputManifest`).
 * @param {String}                  [input.now]               ISO clock injection for deterministic tests.
 * @returns {Object} `{snapshots, independenceBudget, manifest}` — `snapshots` is `[]` on failure.
 */
export function computeConvergenceSnapshots({latticeNodeIds = [], futurePaths = [], provenance, manifest, now} = {}) {
    const firewall = buildConvergenceInputManifest(manifest || {});

    try {
        const futures            = (Array.isArray(futurePaths) ? futurePaths : []).map(future => new Set(future)),
              independenceBudget = computeIndependenceBudget(futurePaths);

        const snapshots = (Array.isArray(latticeNodeIds) ? latticeNodeIds : []).map(latticeNodeId => {
            const node = buildConvergenceSnapshotNode({latticeNodeId, provenance, now});
            if (!node) return null;

            node.properties.convergenceWeight  = futures.filter(future => future.has(node.properties.canonicalId)).length;
            node.properties.independenceBudget = independenceBudget;

            return node;
        }).filter(Boolean);

        return {snapshots, independenceBudget, manifest: firewall};
    } catch (error) {
        // Fail-open: annotation absent, never a Golden Path routing change.
        return {snapshots: [], independenceBudget: null, manifest: firewall};
    }
}
