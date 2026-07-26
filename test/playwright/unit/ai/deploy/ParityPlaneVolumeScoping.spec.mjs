import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

/**
 * Guards the parity profile's volume-scoping invariant.
 *
 * The parity stack isolates itself from the durable plane by running under its own Compose
 * project, and Compose namespaces MANAGED volumes by project — `<project>_<key>`. That
 * namespacing is the whole mechanism preventing two parity stacks from mutating one plane:
 * two projects get two volumes, mechanically, with nothing to remember.
 *
 * WHY this spec exists rather than a sentence in the compose file. Two entirely legal
 * one-line Compose edits silently un-scope a volume and restore that failure:
 *
 *   volumes:
 *     parity-chroma: {name: shared}      <- renders `shared` under EVERY project
 *     parity-chroma: {external: true}    <- resolves unscoped, outside Compose's management
 *
 * Neither reads as a plane decision at the call site — someone adding `external: true` to
 * reuse an existing volume is doing an ordinary thing. Verified against Compose v5.1.4: a
 * managed volume renders `neo-local-parity_parity-chroma` and `team-plane_parity-chroma`
 * under their respective projects, while an explicit `name:` renders the same string under
 * both. So the property the isolation rests on is invisible at the point someone would break
 * it, and nothing else in the tree checks it.
 *
 * That is the shape of guard this repository has already had to retire once: a decision whose
 * correctness depends on a property nothing asserts. A shared or externally-managed parity
 * volume is a RE-ELECTION of the placement decision, not an implementation detail.
 *
 * WHY the assertion is static rather than a `docker compose config` run: no agent sandbox has
 * a reachable Docker daemon, and the keys are what un-scope the volume — reading them from the
 * source is a complete test of the invariant, not a proxy for one.
 */

const
    repoRoot    = path.resolve(process.cwd()),
    composePath = path.join(repoRoot, 'ai/deploy/docker-compose.dev.yml'),
    compose     = yamlLoad(fs.readFileSync(composePath, 'utf8'));

/*
 * The service sets below are DERIVED from the compose file, never listed. A hardcoded roster
 * silently excludes whatever is added next: against the earlier
 * `['kb-server','mc-server','orchestrator']` form, a phantom fourth plane service was added to this
 * profile and every assertion still passed — the probe could not see the service class it exists to
 * protect, because the roster decided membership instead of the artifact.
 *
 * Each derivation is chosen to be INDEPENDENT of the property its test asserts. That independence
 * is the whole point and it is easy to lose: deriving "the services that have a healthcheck" would
 * let a service leave the domain by losing the very healthcheck the test asserts on — the domain
 * absorbing its own counterexample, which passes green and looks like a derivation.
 */

/** Services built from our Dockerfile as an MCP server — marked by `TARGET_SERVER`, orthogonal to healthchecks. */
const mcpServices = Object.entries(compose.services ?? {})
    .filter(([, service]) => service?.build?.args?.TARGET_SERVER)
    .map(([name]) => name);

/** Services binding the plane via the shared `<<: *plane-env` anchor — orthogonal to what they mount. */
const planeEnvServices = Object.entries(compose.services ?? {})
    .filter(([, service]) => Object.keys(service?.environment ?? {}).includes('<<'))
    .map(([name]) => name);

/** Services mounting the plane root — orthogonal to how they bind their environment. */
const planeMountServices = Object.entries(compose.services ?? {})
    .filter(([, service]) => (service?.volumes ?? []).some(mount =>
        (typeof mount === 'string' ? mount : `${mount.source}:${mount.target}`)
            .endsWith(`:${compose['x-plane-env']?.NEO_PLANE_DATA_ROOT}`)))
    .map(([name]) => name);

test.describe('parity profile — volume scoping is the isolation mechanism', () => {
    test('every declared volume is Compose-MANAGED: no explicit name, no external', () => {
        const volumes = compose.volumes ?? {};

        // The profile must actually declare volumes — an empty map would make every assertion
        // below vacuously true, which is the failure mode a "no bad keys" test invites.
        expect(Object.keys(volumes).length).toBeGreaterThan(0);

        for (const [key, body] of Object.entries(volumes)) {
            const declared = body ?? {};

            expect(declared.name, `volume "${key}" declares an explicit name — that renders identically under every project, so two parity stacks would share one volume and mutate one plane`).toBeUndefined();

            expect(declared.external, `volume "${key}" is external — Compose does not namespace it, so project isolation does not apply`).toBeFalsy();
        }
    });

    test('the chroma service mounts the managed volume, not a host bind', () => {
        const mounts = compose.services?.chroma?.volumes ?? [];

        expect(mounts.length).toBeGreaterThan(0);

        // A host bind is path-addressed, so the project name does not scope it and two stacks
        // pointed at one path collide silently. The elected mount style is the named volume.
        for (const mount of mounts) {
            const source = typeof mount === 'string' ? mount.split(':')[0] : mount.source;

            expect(source, `chroma mount "${source}" is a host path — binds are not project-scoped`).not.toMatch(/^[.\/~]/);
            expect(Object.keys(compose.volumes ?? {}), `chroma mounts "${source}", which is not a declared volume`).toContain(source);
        }
    });

    test('both MCP servers verify SERVED identity, not connectivity', () => {
        // The AC's distinction, and it is field-proven rather than theoretical: the provisional
        // 8100 slot collided with a host ssh listener, so a port probe reported a healthy stack
        // while nothing of ours was running there. A connectivity check cannot tell which process
        // answered; only asking the process to name its plane can.
        // Domain: services carrying `build.args.TARGET_SERVER`. A service that DROPS its healthcheck
        // stays in this domain and fails here — which is exactly what deriving "services that have a
        // healthcheck" would have destroyed.
        expect(mcpServices.length, 'no MCP service derived from the compose file — an empty domain passes every assertion below').toBeGreaterThan(0);

        for (const service of mcpServices) {
            const probe = compose.services?.[service]?.healthcheck?.test;

            expect(probe, `${service} has no healthcheck — an unprobed server is worse than a connectivity-probed one`).toBeTruthy();
            expect(probe.join(' '), `${service} probes connectivity without asserting which plane answered`).toContain('--expected-plane-id');
            expect(probe.join(' '), `${service} does not pin the data root, so a matching id with foreign storage would pass`).toContain('--expected-plane-data-root');
        }
    });

    test('the PLANE ROOT rides a named volume in every service, not the repo bind', () => {
        // The original assertion covered only Chroma — the one service whose mount I converted —
        // so it passed while the rest of the plane (WAL dirs, daemon state, sqlite) sat under the
        // `../..:/app` bind. A bind is PATH-ADDRESSED: two parity projects resolve it to the same
        // host directory, which is precisely the duplicate-stacks-on-one-plane failure the
        // named-volume election was chosen to prevent. Asserting the service I changed instead of
        // the property the election decided is how a partial fix looks complete.
        const planeRoot = compose['x-plane-env'].NEO_PLANE_DATA_ROOT;

        // Domain: services binding the plane through the shared anchor. Independent of what they
        // MOUNT, which is the property asserted below — so a plane consumer that forgets the volume
        // stays in the domain and fails.
        expect(planeEnvServices.length, 'no plane-env service derived — an empty domain passes every assertion below').toBeGreaterThan(0);

        for (const service of planeEnvServices) {
            const mounts = compose.services[service].volumes.map(mount =>
                typeof mount === 'string' ? mount : `${mount.source}:${mount.target}`);

            const planeMount = mounts.find(mount => mount.endsWith(`:${planeRoot}`));

            expect(planeMount, `${service} does not mount ${planeRoot} at all — it inherits the repo bind`).toBeTruthy();

            const source = planeMount.split(':')[0];

            expect(source, `${service} mounts the plane root from a host path — binds are not project-scoped`).not.toMatch(/^[.\/~]/);
            expect(Object.keys(compose.volumes), `${service} mounts "${source}", which is not a declared volume`).toContain(source)
        }
    });

    test('the orchestrator rides the SAME plane — a stack without its writer is not a plane', () => {
        // The orchestrator is the third Tier-1 consumer and the only one that writes on a timer:
        // backups, dream artifacts, golden-path handoffs, recovery ledgers. A profile without it
        // could claim plane-completeness only because the writer was absent.
        const orchestrator = compose.services?.orchestrator;

        expect(orchestrator, 'the parity profile has no orchestrator — plane completeness would be true only by omission').toBeTruthy();
        expect(orchestrator.build?.args?.SERVICE_ENTRYPOINT).toBe('ai/daemons/orchestrator/daemon.mjs');

        // Every plane consumer binds via the SHARED ANCHOR (`<<: *plane-env`), never a restated
        // map. Asserting the resolved VALUE would be the weaker test: a copy-pasted block resolves
        // to the same string and passes, while being exactly the second-source defect this profile
        // exists to remove. js-yaml leaves the `<<` merge key literal, which is what makes the
        // structural check available at all.
        // Domain: services MOUNTING the plane root — deliberately the mirror of the test above,
        // which derives from anchor-membership and asserts the mount. Cross-derived so neither is
        // vacuous, and together they pin the biconditional: the set that merges the anchor and the
        // set that mounts the plane are the same set. A service in one and not the other fails one
        // of the two, which a single roster could never express.
        expect(planeMountServices.length, 'no plane-mounting service derived — an empty domain passes every assertion below').toBeGreaterThan(0);

        for (const service of planeMountServices) {
            expect(Object.keys(compose.services[service].environment), `${service} restates the plane binding instead of merging the shared anchor`)
                .toContain('<<');
        }

        // ...and the anchor is the single place the root is declared.
        expect(compose['x-plane-env'].NEO_PLANE_DATA_ROOT).toBe('/app/.neo-ai-data-parity');
        expect(compose['x-plane-env'].NEO_NL_LOG_PATH)
            .toBe(`${compose['x-plane-env'].NEO_PLANE_DATA_ROOT}/logs`);

        // Runtime access scoped to THIS project, so a parity orchestrator can never address the
        // native stack's containers. Both sites alias the same `&plane-id` scalar, so this asserts
        // they resolve identically — a restated literal here would be a second source that agrees
        // today and drifts the first time the project derivation changes.
        expect(orchestrator.environment.NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT)
            .toBe(compose['x-plane-env'].NEO_PLANE_ID);
    });

    test('project identity and plane identity are ONE yaml scalar, not two expressions', () => {
        // The anchor/alias pair cannot drift: `*plane-id` IS the node `&plane-id` defines, so
        // there is no second value to keep in step. Asserting on the parsed tree proves the
        // alias resolved — a broken anchor is a parse error, and a copied expression would
        // pass an equality check while remaining two values.
        const source = fs.readFileSync(composePath, 'utf8');

        expect(source).toMatch(/^name:\s*&plane-id\s/m);
        expect(source).toMatch(/NEO_PLANE_ID:\s*\*plane-id\s*$/m);

        // COMPOSE_PROJECT_NAME is Compose's OWN variable, so Compose validates it instead of
        // silently canonicalizing it. A custom variable takes the normalize path and would need
        // a grammar guard — a copy of Compose's rule, wrong the day Compose changes it.
        expect(source).toMatch(/&plane-id\s+"\$\{COMPOSE_PROJECT_NAME:-/);
    });
});
