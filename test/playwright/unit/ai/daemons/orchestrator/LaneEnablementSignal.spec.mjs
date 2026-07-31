import {test, expect}  from '@playwright/test';
import {TASK_REGISTRY} from '../../../../../../ai/daemons/orchestrator/scheduling/registry.mjs';
import {
    AUTHORITY_CLASSES_BY_PROFILE,
    ORCHESTRATOR_AUTHORITY_PROFILE,
    partitionRegistryByAuthority
} from '../../../../../../ai/daemons/orchestrator/taskAuthority.mjs';

/**
 * Lane enablement is a DERIVATION, not seven per-lane flags — authored falsifier-first.
 *
 * The observation that opened this: a local orchestrator logged
 * `[TenantRepoSync] No tenantRepos configured; skipping.` at INFO once a minute, forever, next to
 * `[ERROR] [ProcessSupervisor]` lines whose payloads were plainly the child's own INFO. Between the
 * two, the single genuine failure in that window — Chroma unreachable, 46 summaries stuck behind it
 * — was visually indistinguishable from the noise.
 *
 * **What was NOT wrong, checked before it became a claim:** the schedule already consults
 * authority. `Orchestrator.getAuthorityScheduledRegistry()` has been filtering `TASK_REGISTRY`
 * through `isTaskOwnedByProfile` all along, and it is already wired into the polling pipeline. The
 * observed drumbeat is not an authority failure at all — the machine ran `container-plane`, which
 * OWNS `tenant-repo-sync`; the lane was correctly scheduled and had no configured work. Authority
 * and configured-work are two separate causes, and conflating them would have produced a fix for a
 * defect that does not exist.
 *
 * **What IS missing is the COMPLEMENT.** `createAuthorityReceipt()` computes a per-task
 * `{task, authorityClass, effectiveOwner, active}` map and writes it to
 * `orchestrator-authority.json` on every boot — verified against a live receipt: 29 tasks, each
 * carrying `active`. Nothing reads it back. So the daemon knows exactly which capabilities it is
 * dropping, records that to disk, and says nothing — which is how this machine sat with Chroma
 * unreachable and wake delivery dead while the orchestrator reported healthy.
 *
 * The partition under test therefore produces both halves in one pass, and the existing scheduled
 * filter delegates to it, so "run it" and "announce that I am not running it" cannot drift apart.
 * Every probe below reads that pure partition rather than a log string, so none can be satisfied
 * by tidying a message.
 */

const
    CONTAINER = ORCHESTRATOR_AUTHORITY_PROFILE.containerPlane,
    HOST_EDGE = ORCHESTRATOR_AUTHORITY_PROFILE.hostEdge,
    LEGACY    = ORCHESTRATOR_AUTHORITY_PROFILE.legacyMixed;

test.describe('#16197 — the schedule is derived from authority, not scheduled-then-skipped', () => {
    test('a host-edge registry contains ZERO lanes the role does not own', () => {
        const {scheduled, disabled} = partitionRegistryByAuthority({profile: HOST_EDGE, registry: TASK_REGISTRY});

        for (const descriptor of scheduled) {
            expect(
                AUTHORITY_CLASSES_BY_PROFILE[HOST_EDGE],
                `${descriptor.taskName} is scheduled but its class is not owned by host-edge`
            ).toContain(descriptor.authorityClass);
        }

        // `tenant-repo-sync` is container-plane work, so a host-edge role drops it. Note what this
        // does NOT prove: the observed drumbeat came from a container-plane orchestrator that owns
        // the lane, so authority never suppresses it there — that case belongs to the
        // configured-work derivation, not this one.
        expect(scheduled.map(descriptor => descriptor.taskName)).not.toContain('tenant-repo-sync');
        expect(disabled.map(descriptor => descriptor.taskName)).toContain('tenant-repo-sync');
    });

    test('POSITIVE CONTROL: the partition is not vacuous in either direction', () => {
        // Without this, "zero unowned lanes are scheduled" is satisfied by a filter that returns
        // nothing, and "the disabled set is announced" by one that disables nothing.
        const hostEdge = partitionRegistryByAuthority({profile: HOST_EDGE, registry: TASK_REGISTRY});
        const legacy   = partitionRegistryByAuthority({profile: LEGACY, registry: TASK_REGISTRY});

        expect(hostEdge.scheduled.length).toBeGreaterThan(0);
        expect(hostEdge.disabled.length).toBeGreaterThan(0);

        // `legacy-mixed` owns every class, so it is the identity case — the compatibility profile
        // must not silently lose lanes to this derivation.
        expect(legacy.disabled).toEqual([]);
        expect(legacy.scheduled.length).toBe(TASK_REGISTRY.length);
    });

    test('the partition is total and disjoint for every legal profile', () => {
        for (const profile of Object.values(ORCHESTRATOR_AUTHORITY_PROFILE)) {
            const {scheduled, disabled} = partitionRegistryByAuthority({profile, registry: TASK_REGISTRY});
            const names                 = [...scheduled, ...disabled].map(descriptor => descriptor.taskName).sort();

            // Total: no lane vanishes. Disjoint: no lane is both scheduled and announced-disabled.
            // A lane that fell out of both halves would be un-run AND un-announced — the exact
            // silent capability gap this ticket exists to end.
            expect(names, `${profile} must partition the whole registry`)
                .toEqual(TASK_REGISTRY.map(descriptor => descriptor.taskName).sort());
            expect(new Set(names).size).toBe(names.length);
        }
    });

    test('the container plane keeps every lane the host edge drops, and vice versa', () => {
        // The two target profiles must COVER the registry between them: a lane neither role owns
        // is work nothing runs, which is a gap in the topology rather than in this derivation, and
        // it should surface here rather than as missing data weeks later.
        const
            containerNames = new Set(partitionRegistryByAuthority({profile: CONTAINER, registry: TASK_REGISTRY})
                .scheduled.map(descriptor => descriptor.taskName)),
            hostEdgeNames  = new Set(partitionRegistryByAuthority({profile: HOST_EDGE, registry: TASK_REGISTRY})
                .scheduled.map(descriptor => descriptor.taskName));

        const orphaned = TASK_REGISTRY
            .map(descriptor => descriptor.taskName)
            .filter(name => !containerNames.has(name) && !hostEdgeNames.has(name));

        expect(orphaned, 'these scheduled lanes are owned by neither target role').toEqual([]);
    });

    test('the derivation reads the SAME classification the authority receipt writes', () => {
        // The receipt already computes `active` per task and writes it to
        // `orchestrator-authority.json` every boot; the whole point of this change is that the
        // schedule consumes that answer instead of contradicting it. Asserting both against
        // `AUTHORITY_CLASSES_BY_PROFILE` is what keeps them one decision rather than two that agree
        // today.
        const {scheduled, disabled} = partitionRegistryByAuthority({profile: HOST_EDGE, registry: TASK_REGISTRY});

        for (const descriptor of disabled) {
            expect(
                AUTHORITY_CLASSES_BY_PROFILE[HOST_EDGE].includes(descriptor.authorityClass),
                `${descriptor.taskName} is announced disabled but host-edge owns its class`
            ).toBe(false);
        }

        expect(scheduled.length + disabled.length).toBe(TASK_REGISTRY.length);
    });

    test('an unknown profile refuses rather than partitioning into silence', () => {
        // Fail-closed: an unrecognised role must not resolve to "owns nothing", which would read
        // as a healthy daemon that quietly runs no lanes at all.
        expect(() => partitionRegistryByAuthority({profile: 'typo-role', registry: TASK_REGISTRY}))
            .toThrow(/Unknown authority profile/);
    });
});
