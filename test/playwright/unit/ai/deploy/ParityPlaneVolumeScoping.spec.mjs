import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';
import {buildHostEdgeEnv} from '../../../../../ai/deploy/hostEdgeProfile.mjs';

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
    repoRoot               = path.resolve(process.cwd()),
    baseComposePath        = path.join(repoRoot, 'ai/deploy/docker-compose.yml'),
    localOverlayPath       = path.join(repoRoot, 'ai/deploy/docker-compose.local-agent-os.yml'),
    localHostEdgePlistPath = path.join(repoRoot, 'ai/deploy/com.neomjs.agent-os-host-edge.plist'),
    localWakePlistPath     = path.join(repoRoot, 'ai/deploy/com.neomjs.agent-os-wake.plist'),
    localRunbookPath       = path.join(repoRoot, 'ai/scripts/lifecycle/local-agent-os/README.md'),
    composePath            = path.join(repoRoot, 'ai/deploy/docker-compose.dev.yml'),
    parityOverlayPath      = path.join(repoRoot, 'ai/deploy/docker-compose.parity-ci.yml'),
    testComposePath        = path.join(repoRoot, 'ai/deploy/docker-compose.test.yml'),
    parityConfigPath       = path.join(repoRoot, 'test/playwright/playwright.config.integration-parity.mjs'),
    paritySpecPath         = path.join(repoRoot, 'test/playwright/integration-parity/ParityTopology.integration.spec.mjs'),
    parityServerPath       = path.join(repoRoot, 'test/playwright/integration-parity/fixtures/parityComposeWebServer.mjs'),
    parityProbePath        = path.join(repoRoot, 'test/playwright/integration-parity/fixtures/parityProbe.mjs'),
    baseCompose            = yamlLoad(fs.readFileSync(baseComposePath, 'utf8')),
    compose                = yamlLoad(fs.readFileSync(composePath, 'utf8')),
    parityOverlay          = yamlLoad(fs.readFileSync(parityOverlayPath, 'utf8')),
    testCompose            = yamlLoad(fs.readFileSync(testComposePath, 'utf8'));

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

/** Base-profile MCP servers, derived independently of the deployment-state mount asserted below. */
const baseMcpServices = Object.entries(baseCompose.services ?? {})
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

    test('both MCP servers share one rosterless provider-PAT declaration', () => {
        const
            providerAuth = compose['x-provider-auth-env'],
            source       = fs.readFileSync(composePath, 'utf8');

        expect(mcpServices.length, 'no MCP service derived from TARGET_SERVER — auth assertions would be vacuous').toBeGreaterThan(0);
        expect(providerAuth).toMatchObject({NEO_AUTH_MODE: 'github-pat'});
        expect(providerAuth).not.toHaveProperty('NEO_AUTH_TRUST_PROXY_IDENTITY');
        expect(providerAuth).not.toHaveProperty('NEO_AUTH_PIN_FIRST_PROVIDER_SUBJECT');
        expect(providerAuth).not.toHaveProperty('NEO_AUTH_AUTO_PROVISION_IDENTITY_SOURCES');
        expect(providerAuth).not.toHaveProperty('NEO_AUTH_ALLOWED_USERS');
        expect(providerAuth).not.toHaveProperty('NEO_MCP_LISTEN_HOST');

        // Both consumers resolve one anchored FILE reference. The credential itself lives in one
        // environment-backed Docker secret and therefore never appears in rendered config.
        expect(providerAuth.NEO_AUTH_PROVIDER_BOOTSTRAP_PAT_FILE)
            .toBe(providerAuth.NEO_MCP_HEALTHCHECK_TOKEN_FILE);
        expect(providerAuth.NEO_AUTH_PROVIDER_BOOTSTRAP_PAT_FILE).toBe('/run/secrets/mcp-auth-token');
        expect(compose.secrets?.['mcp-auth-token']).toEqual({environment: 'NEO_MCP_HEALTHCHECK_TOKEN'});
        expect(source).toMatch(/NEO_AUTH_PROVIDER_BOOTSTRAP_PAT_FILE:\s*&provider-bootstrap-pat-file\s+\/run\/secrets\/mcp-auth-token/);
        expect(source).toMatch(/NEO_MCP_HEALTHCHECK_TOKEN_FILE:\s*\*provider-bootstrap-pat-file\s*$/m);
        expect(source).not.toMatch(/^\s+NEO_AUTH_PROVIDER_BOOTSTRAP_PAT:/m);
        expect(source).not.toMatch(/^\s+NEO_MCP_HEALTHCHECK_TOKEN:/m);
        expect(source).not.toMatch(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+/);

        for (const service of mcpServices) {
            const merges = compose.services[service].environment?.['<<'];

            expect(Array.isArray(merges), `${service} does not merge the shared plane + provider-auth maps`).toBe(true);
            expect(merges, `${service} restates or omits the provider-auth declaration`).toContain(providerAuth);
            expect(compose.services[service].environment.NEO_MCP_LISTEN_HOST, `${service} binds its in-container listener to loopback`).toBeUndefined();
            expect(compose.services[service].secrets).toContain('mcp-auth-token')
        }

        const
            orchestratorEnvironment = JSON.stringify(compose.services?.orchestrator?.environment ?? {}),
            orchestratorSecrets     = compose.services?.orchestrator?.secrets ?? [];

        expect(orchestratorEnvironment).not.toContain('NEO_AUTH_PROVIDER_BOOTSTRAP_PAT');
        expect(orchestratorEnvironment).not.toContain('NEO_MCP_HEALTHCHECK_TOKEN');
        expect(orchestratorSecrets).not.toContain('mcp-auth-token')
    });

    test('canonical MCP host publication is literal IPv4 loopback', () => {
        const expectedPortByTarget = {
            'knowledge-base': '127.0.0.1:3100:3000',
            'memory-core'   : '127.0.0.1:3101:3001'
        };

        expect(mcpServices.length, 'no MCP service derived from TARGET_SERVER — port assertions would be vacuous').toBeGreaterThan(0);

        for (const service of mcpServices) {
            const
                target       = compose.services[service].build.args.TARGET_SERVER,
                expectedPort = expectedPortByTarget[target];

            expect(expectedPort, `${service} has an unexpected TARGET_SERVER "${target}"`).toBeTruthy();
            expect(compose.services[service].ports).toContain(expectedPort)
        }
    });

    test('the elected engine band is loopback-only and no provisional slots remain', () => {
        const source = fs.readFileSync(composePath, 'utf8');

        expect(compose.services?.chroma?.ports).toEqual(['127.0.0.1:8100:8000']);
        expect(source).not.toContain('ELECTION-SLOT')
    });

    test('the CI overlay replaces provider auth with one mounted local-bearer fixture', () => {
        const
            auth          = parityOverlay['x-parity-auth-env'],
            overlaySource = fs.readFileSync(parityOverlayPath, 'utf8'),
            configSource  = fs.readFileSync(parityConfigPath, 'utf8'),
            serverSource  = fs.readFileSync(parityServerPath, 'utf8'),
            specSource    = fs.readFileSync(paritySpecPath, 'utf8'),
            probeSource   = fs.readFileSync(parityProbePath, 'utf8'),
            fixtureMatch  = configSource.match(/parityAuthToken\s*=\s*'([A-Za-z0-9_-]+)'/),
            fixture       = fixtureMatch?.[1];

        expect(auth).toEqual({
            NEO_AUTH_MODE                           : 'local-bearer',
            NEO_AUTH_PIN_FIRST_PROVIDER_SUBJECT     : 'false',
            NEO_AUTH_AUTO_PROVISION_IDENTITY_SOURCES: '',
            NEO_AUTH_PROVIDER_BOOTSTRAP_PAT_FILE    : '',
            NEO_AUTH_LOCAL_BEARER_TOKEN             : '${NEO_MCP_HEALTHCHECK_TOKEN:?parity auth fixture required}',
            NEO_MCP_LISTEN_HOST                     : '127.0.0.1'
        });
        expect(parityOverlay.networks?.['neo-parity-network']?.internal).toBe(true);

        expect(fixture, 'the Playwright config does not declare the canonical parity auth fixture').toBeTruthy();
        expect(fixture).toHaveLength(43);
        expect(Buffer.from(fixture, 'base64url')).toHaveLength(32);
        expect(Buffer.from(fixture, 'base64url').toString('base64url')).toBe(fixture);
        expect(configSource.match(new RegExp(fixture, 'g'))).toHaveLength(1);
        expect(configSource).toMatch(/process\.env\.NEO_MCP_HEALTHCHECK_TOKEN\s*=\s*parityAuthToken/);
        expect(configSource).toMatch(/NEO_MCP_HEALTHCHECK_TOKEN:\s*parityAuthToken/);
        expect(serverSource.match(/env\s+: process\.env/g)).toHaveLength(2);
        expect(specSource).toMatch(/\{cwd: repoRoot, encoding: 'utf8', env: process\.env,/);
        expect(probeSource).toMatch(/bearerTokenFile\s+=\s+process\.env\.NEO_MCP_HEALTHCHECK_TOKEN_FILE/);
        expect(probeSource).toMatch(/readFileSync\(bearerTokenFile, 'utf8'\)\.trim\(\)/);
        expect(probeSource.match(/\bbearerToken,/g)).toHaveLength(2);

        expect(overlaySource).not.toContain(fixture);
        expect(overlaySource.match(/NEO_AUTH_LOCAL_BEARER_TOKEN:/g)).toHaveLength(1);
        expect(overlaySource).not.toMatch(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+/);
        expect(parityOverlay.services?.['kb-server']?.environment).toMatchObject({
            NEO_KB_ASK_PROVIDER: 'openAiCompatible',
            NEO_KB_ASK_MODEL   : 'google/gemma-4-26b-a4b',
            NEO_KB_ASK_API_KEY : 'neo-parity-ci-key',
            NEO_KB_ASK_BASE_URL: 'http://embedding-server:11434'
        });
        expect(compose['x-provider-auth-env'].NEO_MCP_HEALTHCHECK_TOKEN_FILE)
            .toBe('/run/secrets/mcp-auth-token');

        for (const service of mcpServices) {
            const
                overlayEnvironment = parityOverlay.services?.[service]?.environment,
                merges             = overlayEnvironment?.['<<'];

            expect(merges, `${service} does not merge the shared CI auth override`).toBe(auth);
            expect(compose.services[service].secrets).toContain('mcp-auth-token')
        }

        const orchestratorEnvironment = JSON.stringify(parityOverlay.services?.orchestrator?.environment ?? {});

        expect(orchestratorEnvironment).not.toContain('NEO_AUTH_');
        expect(orchestratorEnvironment).not.toContain('NEO_MCP_HEALTHCHECK_TOKEN')
    });

    test('parity served-identity probes accept consumed maintenance degradation', () => {
        const
            serverSource      = fs.readFileSync(parityServerPath, 'utf8'),
            specSource        = fs.readFileSync(paritySpecPath, 'utf8'),
            commandPattern    = /'ai\/scripts\/diagnostics\/mcpHealthcheck\.mjs',([\s\S]*?)\]\);/g,
            expectedStatusArg = "'--expected-status', 'healthy,degraded'";

        for (const [label, source, expectedCount] of [
            ['parity readiness fixture', serverSource, 1],
            ['parity topology spec', specSource, 3]
        ]) {
            const commands = [...source.matchAll(commandPattern)].map(match => match[1]);

            expect(commands, `${label} must retain every served-identity probe`).toHaveLength(expectedCount);

            for (const command of commands) {
                expect(command, `${label} must treat degraded as alive while preserving identity checks`)
                    .toContain(expectedStatusArg);
            }
        }
    });

    test('the CI overlay inherits placement and cannot override profile-pinned plane leaves', () => {
        const source = fs.readFileSync(parityOverlayPath, 'utf8');

        expect(parityOverlay).not.toHaveProperty('x-plane-env');
        expect(source).not.toContain('NEO_PLANE_DATA_ROOT');
        expect(source).not.toContain('NEO_TENANT_REPO_MIRROR_ROOT');

        for (const service of planeEnvServices) {
            const overlayEnvironment = parityOverlay.services?.[service]?.environment ?? {};

            expect(overlayEnvironment).not.toHaveProperty('NEO_PLANE_DATA_ROOT');
            expect(overlayEnvironment).not.toHaveProperty('NEO_TENANT_REPO_MIRROR_ROOT')
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

    test('the relocated parity anchor places every declared Tier-1 plane member', async () => {
        await import('../../../../../src/Neo.mjs');
        await import('../../../../../src/core/_export.mjs');

        const {default: ConfigBase, PLANE_MEMBER_PATHS} = await import('../../../../../ai/configBase.mjs');
        const
            descriptors   = ConfigBase.config.data,
            canonicalRoot = descriptors.plane.dataRoot.default,
            planeEnv      = compose['x-plane-env'],
            relocatedRoot = planeEnv.NEO_PLANE_DATA_ROOT;

        for (const memberPath of PLANE_MEMBER_PATHS) {
            const descriptor = memberPath.split('.').reduce((value, key) => value[key], descriptors);
            const relative   = path.relative(canonicalRoot, descriptor.default);

            expect(relative, `${memberPath} escapes the canonical plane anchor`).not.toMatch(/^\.\.(?:[/\\]|$)/);
            expect(planeEnv[descriptor.env], `${memberPath} (${descriptor.env}) is absent from x-plane-env`)
                .toBe(path.join(relocatedRoot, relative))
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
        expect(compose['x-plane-env'].NEO_KB_EMBEDDING_RESUME_STATE_DIR)
            .toBe(`${compose['x-plane-env'].NEO_PLANE_DATA_ROOT}/kb-sync`);
        expect(compose['x-plane-env'].NEO_NL_LOG_PATH)
            .toBe(`${compose['x-plane-env'].NEO_PLANE_DATA_ROOT}/logs`);

        // Runtime access scoped to THIS project, so a parity orchestrator can never address the
        // native stack's containers. Both sites alias the same `&plane-id` scalar, so this asserts
        // they resolve identically — a restated literal here would be a second source that agrees
        // today and drifts the first time the project derivation changes.
        expect(orchestrator.environment.NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT)
            .toBe(compose['x-plane-env'].NEO_PLANE_ID);
    });

    test('the relocated dev profile places tenant mirrors and inherits container authority', () => {
        const
            planeEnvironment = compose['x-plane-env'],
            planeRoot        = planeEnvironment.NEO_PLANE_DATA_ROOT,
            orchestrator     = compose.services?.orchestrator,
            configSource     = fs.readFileSync(path.join(repoRoot, 'ai/configBase.mjs'), 'utf8');

        expect(planeEnvironment.NEO_TENANT_REPO_MIRROR_ROOT).toBe(planeRoot);
        expect(orchestrator.environment['<<']).toBe(planeEnvironment);

        // Inverted: the parity orchestrator DECLARES its authority instead of inheriting
        // it. The leaf carries no default — a role is declared, never inherited — so an omitted
        // line here is a refused launch rather than a second silent claim on container authority.
        expect(orchestrator.environment.NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE).toBe('container-plane');
        expect(configSource)
            .toContain("authorityProfile: leaf('', 'NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE'")
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

test.describe('data-plane profile election — base and integration-fixture dispositions', () => {
    test('canonical local hard cut keeps Docker data durable and the host edge graphless', () => {
        const
            overlaySource         = fs.readFileSync(localOverlayPath, 'utf8'),
            hostEdgePlistSource   = fs.readFileSync(localHostEdgePlistPath, 'utf8'),
            plistSource           = fs.readFileSync(localWakePlistPath, 'utf8'),
            deploymentStateTarget = '/app/.neo-ai-data/deployment-state',
            deploymentStateVolume = 'shared-deployment-state-data';

        expect(overlaySource).not.toContain('NEO_LOCAL_AGENT_OS_DATA_ROOT');
        expect(overlaySource).toMatch(/^name:\s*&local-project\s/m);
        expect(overlaySource).toContain(
            'NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT: *local-project'
        );
        expect(overlaySource).toMatch(
            /NEO_ORCHESTRATOR_RUNTIME_ACCESS_ALLOWED_SERVICES:\s*&local-runtime-services\s+chroma,kb-server,mc-server,fleet-server,orchestrator/
        );
        expect(overlaySource).toContain(
            'NEO_DEPLOYMENT_STATE_BRIDGE_ALLOWED_SERVICES: *local-runtime-services'
        );
        expect(overlaySource).not.toContain('source: ../../.neo-ai-data');
        expect(overlaySource).not.toContain('source: ../../.neo-ai-data/chroma/unified');
        expect(overlaySource).not.toContain('NEO_AI_ORCHESTRATOR_DIR');
        expect(overlaySource).toContain('NEO_AUTH_MODE: github-pat');
        expect(overlaySource).not.toContain('NEO_AUTH_AUTO_PROVISION_IDENTITY_SOURCES');
        expect(overlaySource).toContain('NEO_AUTH_PIN_FIRST_PROVIDER_SUBJECT: "false"');
        expect(overlaySource).not.toContain('NEO_AUTH_PROVIDER_BOOTSTRAP_PAT');
        expect(overlaySource).toContain('NEO_MCP_HEALTHCHECK_TOKEN_FILE: /run/secrets/mcp-auth-token');
        // Checkout-INDEPENDENT: a relative `file:` resolves inside whichever checkout renders the
        // overlay, which made the sanctioned rebuild runnable from exactly one clone. Asserting the
        // interpolated form is what makes a revert to the relative path redden here.
        expect(overlaySource).toContain('file: ${NEO_MCP_AUTH_TOKEN_FILE:-${HOME}/.neo-ai/secrets/mcp-auth-token}');
        expect(overlaySource, 'the checkout-relative secret path must not return')
            .not.toContain('file: ../../.neo-ai-secrets/mcp-auth-token');
        expect(overlaySource).not.toContain('environment: GH_TOKEN');
        expect(overlaySource).toContain(
            'NEO_OPENAI_COMPATIBLE_HOST: ${NEO_LOCAL_AGENT_OS_PROVIDER_HOST:-http://host.docker.internal:1234}'
        );
        expect(overlaySource).toContain(
            'NEO_OPENAI_COMPATIBLE_MODEL: ${NEO_LOCAL_AGENT_OS_MODEL:-google/gemma-4-26b-a4b}'
        );
        expect(overlaySource).toContain(
            'NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL: ${NEO_LOCAL_AGENT_OS_EMBEDDING_MODEL:-text-embedding-qwen3-embedding-8b}'
        );
        expect(overlaySource.match(/restart: unless-stopped/g)).toHaveLength(6);
        expect(overlaySource).not.toMatch(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+/);

        expect(baseCompose.volumes).toHaveProperty(deploymentStateVolume);

        expect(baseMcpServices.length, 'base Compose has no MCP consumers for the deployment-state bridge').toBeGreaterThan(0);

        for (const service of baseMcpServices) {
            expect(baseCompose.services[service].volumes)
                .toContain(`${deploymentStateVolume}:${deploymentStateTarget}:ro`)
        }

        expect(baseCompose.services.orchestrator.volumes)
            .toContain(`${deploymentStateVolume}:${deploymentStateTarget}`);

        expect(plistSource).toContain('<string>ai/daemons/wake/receiver.mjs</string>');
        expect(plistSource).toContain('<string>--manifest</string>');
        expect(plistSource).toContain('<string>--state-dir</string>');
        expect(plistSource).toContain('<string>--host</string>');
        expect(plistSource).toContain('<string>--port</string>');
        expect(plistSource).not.toContain('ai/daemons/wake/daemon.mjs');
        expect(plistSource).not.toContain('ai/daemons/orchestrator/daemon.mjs');
        expect(plistSource).not.toContain('.neo-ai-data');
        expect(plistSource).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
        expect(plistSource).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);

        // The host-edge POSTURE moved out of this macOS artifact and into
        // `ai/deploy/hostEdgeProfile.mjs`, so the plist supervises the portable entrypoint instead
        // of carrying the configuration. The hard-cut guarantee this test names — the host edge is
        // graphless — is unchanged; it is asserted at the posture's new address. What stays below
        // is what the plist still legitimately owns: THIS machine's state root and local provider
        // pinning, plus its supervision keys.
        expect(hostEdgePlistSource)
            .toContain('<string>ai/daemons/orchestrator/hostEdge.mjs</string>');
        expect(hostEdgePlistSource).toMatch(
            /<key>NEO_AI_ORCHESTRATOR_DIR<\/key>\s*<string>__HOST_EDGE_STATE_DIR__<\/string>/
        );

        const hostEdgePosture = buildHostEdgeEnv({stateDir: '/probe/host-edge'});

        expect(hostEdgePosture.NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE).toBe('host-edge');
        expect(hostEdgePosture.NEO_AI_DEPLOYMENT_MODE).toBe('local');
        expect(hostEdgePosture.NEO_ORCHESTRATOR_LMS_ENABLED).toBe('true');

        expect(hostEdgePlistSource).toMatch(
            /<key>NEO_MODEL_PROVIDER<\/key>\s*<string>openAiCompatible<\/string>/
        );
        expect(hostEdgePlistSource).toMatch(
            /<key>NEO_EMBEDDING_PROVIDER<\/key>\s*<string>openAiCompatible<\/string>/
        );
        expect(hostEdgePlistSource).toMatch(
            /<key>NEO_OPENAI_COMPATIBLE_HOST<\/key>\s*<string>http:\/\/127\.0\.0\.1:1234<\/string>/
        );
        expect(hostEdgePlistSource).toMatch(
            /<key>NEO_OPENAI_COMPATIBLE_MODEL<\/key>\s*<string>google\/gemma-4-26b-a4b<\/string>/
        );
        expect(hostEdgePlistSource).toMatch(
            /<key>NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL<\/key>\s*<string>text-embedding-qwen3-embedding-8b<\/string>/
        );
        expect(hostEdgePlistSource).toMatch(
            /<key>NEO_ORCHESTRATOR_LMS_PORT<\/key>\s*<string>1234<\/string>/
        );
        // The graphless closure — the load-bearing half of "the host edge cannot open the Docker
        // plane". Same key set as before, read from the posture module the entrypoint and
        // the LaunchAgent now share.
        for (const key of [
            'NEO_ORCHESTRATOR_CHROMA_DAEMON_ENABLED',
            'NEO_ORCHESTRATOR_EMBED_DAEMON_ENABLED',
            'NEO_ORCHESTRATOR_MESSAGE_DAEMON_ENABLED',
            'NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED',
            'NEO_ORCHESTRATOR_DEV_SERVER_ENABLED',
            'NEO_ORCHESTRATOR_NL_BRIDGE_ENABLED',
            'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED',
            'NEO_ORCHESTRATOR_KB_SYNC_ENABLED',
            'NEO_ORCHESTRATOR_TEMPORAL_SUMMARY_ENABLED',
            'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED'
        ]) {
            expect(hostEdgePosture[key], `${key} must stay disabled for the host edge`).toBe('false');
            // …and the plist must NOT restate it, or the two drift the first time one changes.
            expect(hostEdgePlistSource).not.toContain(`<key>${key}</key>`);
        }
        expect(hostEdgePlistSource).not.toContain('.neo-ai-data');
        expect(hostEdgePlistSource).not.toContain('ai/daemons/wake/daemon.mjs');
        expect(hostEdgePlistSource).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
        expect(hostEdgePlistSource).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
    });

    test('steady-state runbook keeps checkout data outside the Docker and host-edge targets', () => {
        const source = fs.readFileSync(localRunbookPath, 'utf8');

        expect(source).toContain('The pre-Docker checkout `.neo-ai-data`');
        expect(source).toContain('is an import source, never a');
        expect(source).toContain('live target');
        expect(source).toContain('-f ai/deploy/docker-compose.yml');
        expect(source).toContain('-f ai/deploy/docker-compose.local-agent-os.yml');
        expect(source).toContain('--profile cloud --profile ingress --profile fleet up -d --wait');
        expect(source).toContain('neo-local-agent-os');
        expect(source).toContain('Application Support/Neo/AgentOS');
        expect(source).toContain("action               : 'subscribe'");
        expect(source).toContain('subscriptionId` and `signingKey` once');
        expect(source).toContain('npm run ai:wake-manifest');
        expect(source).toContain('com.neomjs.agent-os-wake');
        expect(source).toContain('com.neomjs.agent-os-host-edge');
        expect(source).toContain('mcpHealthcheck.mjs');
        expect(source).toContain('orchestrator-authority.json');
        expect(source).toContain('launchctl bootout');
        expect(source.indexOf('launchctl bootout')).toBeLessThan(
            source.indexOf('cp ai/deploy/com.neomjs.agent-os-wake.plist')
        );
        expect(source).not.toContain('rsync -aL .neo-ai-data');
        expect(source).not.toContain('mv .neo-ai-data');
        expect(source).not.toContain('NEO_CUTOVER_OLD_ROOT');
        expect(source).not.toContain('legacy-mixed`, then');
        expect(source).not.toContain('.neo-ai-data/wake-receiver');
    });

    test('base/cloud inherits the canonical tenant-mirror root from AiConfig', () => {
        const configSource = fs.readFileSync(path.join(repoRoot, 'ai/configBase.mjs'), 'utf8');

        expect(baseCompose.services?.orchestrator?.environment)
            .not.toContain('NEO_TENANT_REPO_MIRROR_ROOT=/app/.neo-ai-data');
        expect(configSource)
            .toContain("tenantRepoMirrorRoot: leaf('/app/.neo-ai-data', 'NEO_TENANT_REPO_MIRROR_ROOT'")
    });

    test('base Compose aliases only the repeated graph and handoff entries', () => {
        const
            source                = fs.readFileSync(baseComposePath, 'utf8'),
            servicesWithGraphPath = Object.entries(baseCompose.services ?? {})
                .filter(([, service]) => (service.environment ?? [])
                    .some(entry => String(entry).startsWith('NEO_MEMORY_DB_PATH='))),
            servicesWithHandoffPath = Object.entries(baseCompose.services ?? {})
                .filter(([, service]) => (service.environment ?? [])
                    .some(entry => String(entry).startsWith('NEO_HANDOFF_FILE_PATH=')));

        expect(source.match(/NEO_MEMORY_DB_PATH=\/app\/\.neo-ai-data\/sqlite\/memory-core-graph\.sqlite/g))
            .toHaveLength(1);
        expect(source.match(/\*memory-db-env/g)).toHaveLength(2);
        expect(source.match(/NEO_HANDOFF_FILE_PATH=\/app\/\.neo-ai-data\/handoff\/sandman_handoff\.md/g))
            .toHaveLength(1);
        expect(source.match(/\*handoff-file-env/g)).toHaveLength(1);
        expect(servicesWithGraphPath).toHaveLength(3);
        expect(servicesWithHandoffPath).toHaveLength(2);

        for (const [serviceName, service] of servicesWithGraphPath) {
            expect(service.environment, serviceName)
                .toContain('NEO_MEMORY_DB_PATH=/app/.neo-ai-data/sqlite/memory-core-graph.sqlite')
        }

        for (const [serviceName, service] of servicesWithHandoffPath) {
            expect(service.environment, serviceName)
                .toContain('NEO_HANDOFF_FILE_PATH=/app/.neo-ai-data/handoff/sandman_handoff.md')
        }
    });

    test('the test Compose file remains an isolated fixture, not a durable parity profile', () => {
        const
            source          = fs.readFileSync(testComposePath, 'utf8'),
            memoryDbEntries = Object.values(testCompose.services ?? {})
                .flatMap(service => service.environment ?? [])
                .filter(entry => String(entry).startsWith('NEO_MEMORY_DB_PATH='));

        expect(testCompose).not.toHaveProperty('name');
        expect(testCompose).not.toHaveProperty('x-plane-env');
        expect(memoryDbEntries.length).toBeGreaterThan(0);
        expect(memoryDbEntries.every(entry => entry.includes('/tmp/neo-integration/'))).toBe(true);
        expect(source).not.toContain('/app/.neo-ai-data-parity')
    });
});
