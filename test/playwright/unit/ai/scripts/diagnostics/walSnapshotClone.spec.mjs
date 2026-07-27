import {test, expect} from '@playwright/test';
import {
    fingerprintCorpus,
    planSnapshotClone
} from '../../../../../../ai/scripts/diagnostics/walSnapshotClone.mjs';

// AC1: "snapshot-clone produces an overlay planeId with pre-clone fingerprints recorded; overlay
// cannot resolve the durable root (inheriting the shared plane-coherence invariant)."
//
// The overlay invariant is DELEGATED to `planeConfig.assertPlaneCoherence`, so these tests assert the
// delegation actually binds — a wrapper that forgot to call it would pass every happy-path test.
// `realpathFn` is injected so the durable-root collision is provable without touching a real plane.

const segment = (name, bytes, mtimeMs) => ({name, bytes, mtimeMs});

const CORPUS = [
    segment('wal-2026-07-26.jsonl', 1000, 1_700_000_000_000),
    segment('messages/message-wal-2026-07-26.jsonl', 2000, 1_700_000_001_000)
];

/** Identity realpath — the overlay and canonical roots stay distinct unless a test aliases them. */
const identityRealpath = value => value;

const plan = (overrides = {}) => planSnapshotClone({
    overlayPlaneId   : 'neo-local-pilot',
    overlayDataRoot  : '/planes/pilot',
    canonicalDataRoot: '/planes/canonical',
    segments         : CORPUS,
    realpathFn       : identityRealpath,
    ...overrides
});

test.describe('fingerprintCorpus — deterministic, order-independent, drift-sensitive', () => {
    test('same corpus in different enumeration order yields the SAME digest', () => {
        // Without the sort, filesystem iteration order would read as corpus drift.
        const a = fingerprintCorpus(CORPUS),
              b = fingerprintCorpus([...CORPUS].reverse());

        expect(a.ok).toBe(true);
        expect(a.digest).toBe(b.digest);
        expect(a.segmentCount).toBe(2);
        expect(a.totalBytes).toBe(3000);
    })

    test('⭐ a changed byte length changes the digest — otherwise it detects nothing', () => {
        const before = fingerprintCorpus(CORPUS),
              after  = fingerprintCorpus([segment('wal-2026-07-26.jsonl', 1001, 1_700_000_000_000), CORPUS[1]]);

        expect(after.digest).not.toBe(before.digest);
    })

    test('a changed mtime changes the digest', () => {
        const before = fingerprintCorpus(CORPUS),
              after  = fingerprintCorpus([segment('wal-2026-07-26.jsonl', 1000, 1_700_000_009_999), CORPUS[1]]);

        expect(after.digest).not.toBe(before.digest);
    })

    test('an added segment changes the digest', () => {
        expect(fingerprintCorpus([...CORPUS, segment('wal-new.jsonl', 5, 1)]).digest)
            .not.toBe(fingerprintCorpus(CORPUS).digest);
    })

    test('refuses partial segment metadata rather than hashing around it', () => {
        // A fingerprint over missing fields would compare unequal corpora as equal — the failure
        // direction that makes a guard useless.
        expect(fingerprintCorpus([{name: 'a', bytes: 1}]).reason).toContain('index 0');
        expect(fingerprintCorpus([{name: 'a', bytes: 1}]).reason).toContain('partial metadata');
        expect(fingerprintCorpus('nope').reason).toContain('must be an array');
    })
});

test.describe('planSnapshotClone — the durable-root invariant is delegated AND binding', () => {
    test('a distinct, opaque overlay plans cleanly and carries its pre-clone fingerprint', () => {
        const result = plan();

        expect(result.ok).toBe(true);
        expect(result.overlayPlaneId).toBe('neo-local-pilot');
        expect(result.preCloneFingerprint).toMatchObject({segmentCount: 2, totalBytes: 3000});
        expect(result.preCloneFingerprint.digest).toMatch(/^[0-9a-f]{64}$/);
    })

    test('⭐ an OMITTED canonicalDataRoot refuses — the isolation clause would silently be skipped', () => {
        // Fail-open closed. `assertPlaneCoherence` guards its overlay-isolation clause with
        // `canonicalDataRoot &&`, so omitting the comparator skips the very check this planner exists to
        // enforce — the clone would report `ok:true` with isolation never verified. Optional upstream for
        // general callers, mandatory at this boundary.
        const result = planSnapshotClone({
            overlayPlaneId : 'neo-local-pilot',
            overlayDataRoot: '/planes/pilot',
            segments       : CORPUS,
            realpathFn     : identityRealpath
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('canonicalDataRoot must be an absolute path');
        expect(result.reason).toContain('isolation');
        expect(result).not.toHaveProperty('preCloneFingerprint');
    })

    test('a RELATIVE canonicalDataRoot refuses — a relative comparator cannot prove separation', () => {
        expect(plan({canonicalDataRoot: 'planes/canonical'}).reason).toContain('absolute path');
        expect(plan({canonicalDataRoot: null}).reason).toContain('absolute path');
    })

    test('⭐ an overlay that RESOLVES TO THE DURABLE ROOT is refused, by the shared predicate', () => {
        // The hazard itself: an overlay mistaken for canonical would mutate the durable plane.
        // Aliasing realpath makes the pilot root resolve onto the canonical one, exactly as a symlink
        // or bind-mount misconfiguration would.
        const result = plan({realpathFn: () => '/planes/canonical'});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('planeConfig.assertPlaneCoherence');
        expect(result).not.toHaveProperty('preCloneFingerprint');
    })

    test('⭐ a PATH-SHAPED overlay id is refused — identity must not pre-decide placement', () => {
        const result = plan({overlayPlaneId: '../planes/pilot'});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('planeConfig.assertPlaneCoherence');
        expect(result.reason).toMatch(/opaque/i);
    })

    test('⭐ reusing the CANONICAL plane id is refused HERE, because the shared predicate cannot', () => {
        // This control originally expected `assertPlaneCoherence` to reject it. It does not, and it is
        // RIGHT not to: clause 3 only inspects a NON-canonical planeId, because something declaring
        // itself canonical is not an overlay — that is how the canonical plane declares its own root.
        // Impersonation and being-canonical are the same statement at that layer. The clone planner is
        // the layer that knows it is planning an overlay, so the constraint lives here.
        const result = plan({overlayPlaneId: 'neo-local-canonical'});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('canonical plane identity');
        expect(result.reason).toContain('two planes claiming to be canonical');
        // And it explains why the shared predicate stayed silent, so the next reader does not file a
        // bug against planeConfig.
        expect(result.reason).toContain('only');
        expect(result).not.toHaveProperty('preCloneFingerprint');
    })

    test('the canonical-identity refusal honours an INJECTED canonicalPlaneId, not just the default', () => {
        // Otherwise a deployment that overrides the canonical identity would slip past this clause.
        const result = plan({overlayPlaneId: 'tenant-prime', canonicalPlaneId: 'tenant-prime'});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('canonical plane identity');
    })

    test('a relative overlay root is refused', () => {
        expect(plan({overlayDataRoot: 'planes/pilot'}).reason).toContain('planeConfig.assertPlaneCoherence');
    })

    test('⭐ refuses the clone when the fingerprint cannot be taken — no unrecorded snapshots', () => {
        // A snapshot whose starting state was never recorded cannot support a later promotion or
        // demotion disposition, so an unfingerprintable corpus blocks the clone rather than warning.
        const result = plan({segments: [{name: 'broken'}]});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('pre-clone fingerprint failed');
        expect(result.reason).toContain('cannot support a promotion or demotion disposition');
    })

    test('the refusal is a RESULT, never a throw — a boot-path caller cannot be surprised', () => {
        expect(() => plan({overlayPlaneId: '../bad'})).not.toThrow();
        expect(() => plan({overlayDataRoot: 'relative'})).not.toThrow();
    })
});
