import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import Neo            from '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/_export.mjs';
import {Orchestrator}             from '../../../../../../ai/daemons/orchestrator/Orchestrator.mjs';
import {ProcessSupervisorService} from '../../../../../../ai/daemons/orchestrator/services/ProcessSupervisorService.mjs';
import {TASK_REGISTRY}            from '../../../../../../ai/daemons/orchestrator/scheduling/registry.mjs';
import {
    AUTHORITY_CLASSES_BY_PROFILE,
    ORCHESTRATOR_AUTHORITY_PROFILE,
    getTaskAuthorityClass,
    partitionRegistryByAuthority,
    resolveAuthorityClassOwner
} from '../../../../../../ai/daemons/orchestrator/taskAuthority.mjs';
import {buildHostEdgeEnv} from '../../../../../../ai/deploy/hostEdgeProfile.mjs';

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

test.describe('#16197 — the dropped capabilities are ANNOUNCED, not just written to a receipt', () => {
    /**
     * @summary A prototype-only Orchestrator with the resolved role injected and the log captured —
     * the sibling pattern in `Orchestrator.spec.mjs`, which never constructs the singleton.
     * The REAL methods run; only the two seams they read are supplied.
     * @param {String} profile Resolved authority profile.
     * @returns {Object} Orchestrator-shaped instance carrying a `logs` array.
     */
    function announcerFor(profile) {
        const
            orchestrator = Object.create(Orchestrator.prototype),
            logs         = [];

        orchestrator.authorityProfile = profile;
        orchestrator.logs             = logs;
        orchestrator.writeLog         = (level, message) => logs.push({level, message});

        return orchestrator;
    }

    test('a host-edge boot names every lane it drops AND the role that owns it', () => {
        const announcer = announcerFor(HOST_EDGE);
        const message   = announcer.buildDisabledLaneAnnouncement();

        expect(message).toContain('container-plane owns');

        // Naming the lanes is the point — a count alone ("not running 14 lanes") tells an operator
        // nothing they can act on.
        const {disabled} = partitionRegistryByAuthority({profile: HOST_EDGE, registry: TASK_REGISTRY});

        for (const {taskName} of disabled) {
            expect(message, `${taskName} is dropped but unnamed in the announcement`).toContain(taskName);
        }
    });

    test('the announcement makes NO claim that the owning role is live', () => {
        // The bound is the honest part. A graphless host edge cannot probe the container plane it
        // is forbidden to open, so any "replacement is running" wording here would be a guess
        // dressed as a check. The line must say what it does not know.
        const announcer = announcerFor(HOST_EDGE);
        const message   = announcer.buildDisabledLaneAnnouncement();

        expect(message).toContain('does not verify that the owning role is live');
        expect(message).not.toMatch(/replacement is (running|live|healthy)/i);
    });

    test('it is emitted ONCE per boot, at WARN — it must not become the next drumbeat', () => {
        const announcer = announcerFor(HOST_EDGE);

        announcer.announceDisabledLanes();

        expect(announcer.logs).toHaveLength(1);
        expect(announcer.logs[0].level).toBe('WARN');
    });

    test('the owning role is DERIVED, so a third role cannot be silently mis-attributed', () => {
        // The reviewer's challenge, made executable. A `shared-primitive → container-plane` literal
        // in presentation logic is correct only while the topology has exactly two roles: it would
        // keep producing a confident answer after a third role made it wrong, and it would do so
        // from a place nobody audits when changing the topology.
        //
        // Injecting a matrix where a THIRD role also owns `shared-primitive` must make the
        // derivation throw. A literal passes this unchanged, which is exactly why it fails here.
        const ambiguous = {
            ...AUTHORITY_CLASSES_BY_PROFILE,
            'edge-two': Object.freeze(['shared-primitive'])
        };

        expect(() => resolveAuthorityClassOwner({
            authorityClass           : 'shared-primitive',
            authorityClassesByProfile: ambiguous,
            profiles                 : ['container-plane', 'edge-two']
        })).toThrow(/double ownership/);

        // …and an unowned class is a gap, not a default.
        expect(() => resolveAuthorityClassOwner({authorityClass: 'no-such-class'}))
            .toThrow(/ownership gap/);

        // The real topology still resolves the answer the literal used to hardcode.
        expect(resolveAuthorityClassOwner({authorityClass: 'shared-primitive'})).toBe(CONTAINER);
        expect(resolveAuthorityClassOwner({authorityClass: 'container-plane'})).toBe(CONTAINER);
        expect(resolveAuthorityClassOwner({authorityClass: 'host-edge'})).toBe(HOST_EDGE);
    });

    test('a role that owns everything says nothing at all', () => {
        // `legacy-mixed` drops no lane, so there is no gap to announce. An unconditional line would
        // train operators to skip it, which is how the real one stops being read.
        const announcer = announcerFor(LEGACY);

        expect(announcer.buildDisabledLaneAnnouncement()).toBeNull();

        announcer.announceDisabledLanes();
        expect(announcer.logs).toEqual([]);
    });

    test('the idleness drumbeat is no longer INFO', () => {
        // The measured symptom: this line fires on the 60s sweep cadence forever wherever no tenant
        // repos are configured, and it sat directly above the only genuine failure in the window.
        const source = readFileSync(
            new URL('../../../../../../ai/daemons/orchestrator/services/TenantRepoSyncService.mjs', import.meta.url),
            'utf8'
        );

        expect(source).not.toContain("writeLog?.('INFO', `[TenantRepoSync] No tenantRepos configured");
        expect(source).toContain("writeLog?.('DEBUG', `[TenantRepoSync] No tenantRepos configured");
    });
});

test.describe("#16197 — a child's own level survives the supervisor, timestamp and all", () => {
    /**
     * Lines captured VERBATIM from a live orchestrator boot, not invented for the probe. All three
     * shapes are real and all three lost their level: `getChildLogLevel` anchored `[INFO]` to the
     * start of the line, and every child emits a timestamp — sometimes a PID — ahead of it. So the
     * classifier fell through to its ERROR fail-safe on the entire benign startup sequence, and the
     * one genuine failure in that window (`Failed to connect to chromadb`) was rendered identically
     * to it.
     *
     * That is the actual mechanism behind the observed `[ERROR] [ProcessSupervisor] … [INFO]
     * [SessionService] …` pairing. The routing-by-stream reading in the ticket was close but not
     * the cause: the supervisor DOES read the child's level, it just could not find it.
     * @type {ReadonlyArray<{expected: String, line: String}>}
     */
    const OBSERVED_CHILD_LINES = Object.freeze([
        {expected: 'INFO',  line: '2026-07-31T19:23:40.798Z [INFO] [SessionService] Initialized new fallback session: d50f3b1e'},
        {expected: 'INFO',  line: '[2026-07-31T19:23:40.836Z] [INFO] [RecorderService] Action logging disabled.'},
        {expected: 'INFO',  line: '[2026-07-31T19:23:41.335Z] [PID:27004] [INFO] [Orchestrator] Started. authorityProfile=host-edge'},
        {expected: 'INFO',  line: '[INFO] [Plain] a child that leads with its level still works'},
        {expected: 'WARN',  line: '[2026-07-31T19:23:41.335Z] [WARN] [Chroma] slow response'},
        // The fail-safe, and it must stay: an unprefixed child failure is never downgraded.
        {expected: 'ERROR', line: 'Failed to connect to chromadb'},
        {expected: 'ERROR', line: '[2026-07-31T19:23:41.335Z] [ERROR] [Summarize] exited with code 1'}
    ]);

    test('every observed child shape classifies at the level the CHILD declared', () => {
        const supervisor = Object.create(ProcessSupervisorService.prototype);

        for (const {expected, line} of OBSERVED_CHILD_LINES) {
            expect(supervisor.getChildLogLevel(line), `misclassified: ${line}`).toBe(expected);
        }
    });

    test('a message that merely CONTAINS a level token is still an error', () => {
        // The bound on the fix. Relaxing the anchor to "find [INFO] anywhere" would let a genuine
        // failure whose payload quotes a level silently downgrade — trading one lost signal for a
        // worse one. Only a leading timestamp/PID may precede the level.
        const supervisor = Object.create(ProcessSupervisorService.prototype);

        expect(supervisor.getChildLogLevel('Traceback: unexpected [INFO] marker in payload')).toBe('ERROR');
        expect(supervisor.getChildLogLevel('gibberish [2026-07-31T19:23:41.335Z] [INFO] late')).toBe('ERROR');
    });

    test('the re-logged line drops the redundant timestamp and level, and KEEPS the PID', () => {
        const
            supervisor = Object.create(ProcessSupervisorService.prototype),
            logs       = [];

        // `defineProperty`, not assignment: `writeLog` is a reactive config on the real class, and
        // a prototype-only instance has no `#configs` for its setter to reach. An own data property
        // shadows the accessor so the method under test runs untouched.
        Object.defineProperty(supervisor, 'writeLog', {value: (level, message) => logs.push({level, message})});

        supervisor.writeChildStderr('[2026-07-31T19:23:41.335Z] [PID:27004] [INFO] [Orchestrator] Started.\n');

        expect(logs).toHaveLength(1);
        expect(logs[0].level).toBe('INFO');
        // The outer logger stamps its own timestamp and level, so repeating the child's is noise —
        // but the PID identifies WHICH child, which the outer logger cannot know.
        expect(logs[0].message).toBe('[ProcessSupervisor] [PID:27004] [Orchestrator] Started.');
    });
});

/**
 * The corpus-producing lanes must be owned by the role that can actually run them.
 *
 * The failure this pins is not a wrong class — it is TWO roles both declining the same lane, which
 * no single-role check can see. The container plane deferred `kbSync` to `host-edge`; the host-edge
 * posture fragment declared it a lane "this topology does not elect for the host edge". Neither
 * statement is wrong on its own, `auditAuthorityTopology` passed throughout (it audits class
 * ownership, and enablement is a different axis), and the Knowledge Base ran to zero documents with
 * no producer.
 *
 * So the assertions below are deliberately two-sided: owned-and-active on one role is only half the
 * property. The other half is that the role which declines it names a DIFFERENT owner — a lane whose
 * decliner names itself as owner is the shape that cost the corpus.
 */
test.describe('corpus lanes are owned by the role that can run them (#16554)', () => {
    const CORPUS_LANES = ['kbSync', 'temporal-summary'];

    test('container-plane owns and activates them; host-edge declines them to container-plane', () => {
        const registry = CORPUS_LANES.map(taskName => ({
            taskName,
            authorityClass: getTaskAuthorityClass(taskName)
        }));

        const onPlane = partitionRegistryByAuthority({
            profile : ORCHESTRATOR_AUTHORITY_PROFILE.containerPlane,
            registry
        });

        expect(onPlane.scheduled.map(d => d.taskName).sort()).toEqual([...CORPUS_LANES].sort());
        expect(onPlane.disabled).toHaveLength(0);

        const onEdge = partitionRegistryByAuthority({
            profile : ORCHESTRATOR_AUTHORITY_PROFILE.hostEdge,
            registry
        });

        expect(onEdge.scheduled).toHaveLength(0);

        // Length-asserted BEFORE the loop, or the loop below is vacuous: a `disabled: []` would
        // delete the assertion while the suite stayed green — which is this PR's own defect class
        // (a check that passes because it never ran) reproduced inside its own guard.
        expect(onEdge.disabled).toHaveLength(CORPUS_LANES.length);

        // The load-bearing half. host-edge declining is fine ONLY while the owner it names is a
        // different, live role — if this ever resolves back to `host-edge`, the lane is declined by
        // its own declared owner and nothing runs it.
        for (const descriptor of onEdge.disabled) {
            expect(resolveAuthorityClassOwner({authorityClass: descriptor.authorityClass}))
                .toBe(ORCHESTRATOR_AUTHORITY_PROFILE.containerPlane);
        }
    });

    test('the host-edge closure keeps the corpus lanes disabled — ownership moved, capability did not', () => {
        const posture = buildHostEdgeEnv({stateDir: '/tmp/neo-host-edge-spec'});

        // This asserted `toBeUndefined()` first, on the reasoning that naming a container-plane lane
        // in a host-edge closure re-creates the two-authors-one-fact split. That was wrong, and
        // `ParityPlaneVolumeScoping` — which pins this same key set as *"the graphless closure, the
        // load-bearing half of 'the host edge cannot open the Docker plane'"* — is what caught it.
        //
        // The refutation is already in the key set: `CHROMA_DAEMON` and `EMBED_DAEMON` are
        // container-plane too and have always been listed. So the closure never meant "lanes
        // host-edge owns but does not elect" — it means "lanes a graphless process must not start",
        // which is a CAPABILITY claim and survives any reclassification.
        //
        // The original defect was never that the closure named these lanes. It was that the
        // CLASSIFICATION pointed them at host-edge while the closure disabled them. Fixing the
        // classification fixed it; removing them here was a second change that broke a different
        // invariant, and it would have handed a future reclassification a silent path to starting
        // a graph lane on a graphless process.
        expect(posture.NEO_ORCHESTRATOR_KB_SYNC_ENABLED).toBe('false');
        expect(posture.NEO_ORCHESTRATOR_TEMPORAL_SUMMARY_ENABLED).toBe('false');

        // POSITIVE CONTROL: the fragment is a real closure and not a blanket 'false' map — the one
        // elected lane is still on, so the assertions above distinguish disabled from absent.
        expect(posture.NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED).toBe('false');
        expect(posture.NEO_ORCHESTRATOR_LMS_ENABLED).toBe('true');
    });

    test('the production compose does NOT restate the enablement — the leaf group carries it', () => {
        const compose = readFileSync(
            new URL('../../../../../../ai/deploy/docker-compose.yml', import.meta.url),
            'utf8'
        );

        // Owning a lane and starting it are separate facts, and pinning the second one in compose was
        // tried and rejected: `mcpHealthcheck.spec.mjs` refuses a production compose that sets
        // `NEO_ORCHESTRATOR_KB_SYNC_ENABLED`, on the grounds that a deployment restating an AiConfig
        // default silently freezes today's value. Moving the leaf to `cloudOnly` is what makes the
        // default correct for the role that owns the lane, so compose inherits it and stays silent.
        expect(compose).not.toContain('NEO_ORCHESTRATOR_KB_SYNC_ENABLED');
        expect(compose).not.toContain('NEO_ORCHESTRATOR_TEMPORAL_SUMMARY_ENABLED');

        // POSITIVE CONTROL: this really is the orchestrator's compose surface, so the two absences
        // above are a deliberate silence rather than a mistyped path matching nothing.
        expect(compose).toContain('NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE=container-plane');
    });
});
