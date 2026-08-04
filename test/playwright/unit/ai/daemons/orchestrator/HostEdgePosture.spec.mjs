import {test, expect}                                                                from '@playwright/test';
import {spawnSync}                                                                   from 'node:child_process';
import fs                                                                            from 'fs';
import os                                                                            from 'os';
import path                                                                          from 'path';
import * as yaml                                                                     from 'js-yaml';
import {buildHostEdgeEnv, HOST_EDGE_STATE_DIR_ENV}                                   from '../../../../../../ai/deploy/hostEdgeProfile.mjs';
import {buildBrainProfile, buildPackagedBrainEnv}                                    from '../../../../../../harness/brain.mjs';
import {ORCHESTRATOR_AUTHORITY_PROFILE, getTaskAuthorityClass, isTaskOwnedByProfile} from '../../../../../../ai/daemons/orchestrator/taskAuthority.mjs';

/**
 * The host-edge POSTURE contract, authored falsifier-first.
 *
 * The first attempt at this change shipped a fully green suite over a defect that would have broken
 * both real Brain launches, because `test/playwright/configTemplateResolver.mjs` sets
 * `NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE ??= 'legacy-mixed'` — supplying the exact value the
 * production launchers omit. A suite that reads the ambient process env therefore cannot see a
 * missing-role defect at all.
 *
 * Every probe below is written to be UNMASKABLE by that injection. Two techniques, used
 * deliberately:
 *
 * 1. **Read the producer, not the environment.** The census asserts on what each launcher
 *    EMITS (the harness env fragments, the Compose service blocks, the plist dict, the npm
 *    script string). Those values exist on disk and in pure functions; no ambient env can
 *    supply them.
 * 2. **Build subprocess env from scratch.** The refusal probes never spread `process.env`;
 *    they pass a hand-built env and an empty dotenv file, so the resolver's injection and any
 *    contributor's local `.env` are both out of reach.
 *
 * A probe that would still pass with the implementation reverted is not a probe.
 */

const
    REPO_ROOT       = process.cwd(),
    DAEMON_ENTRY    = 'ai/daemons/orchestrator/daemon.mjs',
    HOST_EDGE_ENTRY = 'ai/daemons/orchestrator/hostEdge.mjs',
    LEGAL_PROFILES  = Object.values(ORCHESTRATOR_AUTHORITY_PROFILE),
    ROLE_ENV        = 'NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE';

/**
 * @summary The declared launcher census: every artifact that starts the orchestrator daemon as a
 * long-lived process. Declaration is intent, never a derivable property (ticket-ref-ok: ADR 0019
 * §10.5 is the Accepted rule that membership is declared, not derived) — so the list is declared
 * here and asserted SET-EQUAL to a repo scan below rather than pinned to a count. A pinned
 * count would guard the wrong direction: the operation that actually happens is "add a launcher,
 * forget the role", and a count check passes green forever through exactly that.
 * @type {ReadonlyArray<String>}
 */
const DECLARED_LAUNCHERS = Object.freeze([
    'ai/daemons/orchestrator/hostEdge.mjs',
    'ai/deploy/com.neomjs.agent-os-host-edge.plist',
    'ai/deploy/docker-compose.dev.yml',
    'ai/deploy/docker-compose.yml',
    'harness/brain.mjs',
    'package.json'
]);

/**
 * @summary Files that name the daemon entry WITHOUT launching it — the generic image entrypoint
 * (its role comes from the Compose service that sets `SERVICE_ENTRYPOINT`), sibling daemons that
 * reference the path for singleton self-detection, the lint that reads it as data, and modules whose
 * documentation cites the daemon as the consumer whose behaviour they exist to explain.
 * @type {ReadonlyArray<String>}
 */
const NON_LAUNCHER_REFERENCES = Object.freeze([
    'ai/daemons/kb-alerting/daemon.mjs',
    'ai/daemons/orchestrator/Orchestrator.mjs',
    'ai/daemons/orchestrator/daemon.mjs',
    'ai/daemons/wake/daemon.mjs',
    'ai/deploy/Dockerfile',
    'ai/deploy/hostEdgeProfile.mjs',
    'ai/scripts/lint/lint-config-template-ssot.mjs',
    // Cites the four fail-closed daemons in prose to explain WHY a cohort can be inadmissible.
    // Reads only; it spawns nothing and resolves no entrypoint.
    'ai/scripts/setup/cohortAdmissibility.mjs'
]);

/**
 * @summary Reads a repo-relative file as UTF-8.
 * @param {String} relPath
 * @returns {String}
 */
function readRepoFile(relPath) {
    return fs.readFileSync(path.resolve(REPO_ROOT, relPath), 'utf8');
}

/**
 * @summary Parses the host-edge LaunchAgent template's `EnvironmentVariables` dict and
 * `ProgramArguments` array out of the plist XML, without a plist dependency.
 * @returns {{env: Object<String,String>, programArguments: String[]}}
 */
function parseHostEdgePlist() {
    const
        source = readRepoFile('ai/deploy/com.neomjs.agent-os-host-edge.plist'),
        env    = {};

    const
        argsBlock = source.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/),
        envBlock  = source.match(/<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/);

    for (const [, key, value] of (envBlock?.[1] ?? '').matchAll(/<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/g)) {
        env[key] = value;
    }

    return {
        env,
        programArguments: [...(argsBlock?.[1] ?? '').matchAll(/<string>([^<]*)<\/string>/g)].map(match => match[1])
    };
}

test.describe('#16229 — host-edge posture: every producer declares a valid role', () => {
    test('the launcher census is SET-EQUAL to a repo scan — a new launcher cannot skip the contract', () => {
        // BOTH entrypoints, because the plist now launches the portable one: a scan for the daemon
        // path alone stopped seeing the LaunchAgent the moment it was thinned, which is the census
        // going quiet at exactly the wrong moment.
        //
        // Bounded honestly: this catches a launcher that names an entrypoint by path — a Compose
        // `SERVICE_ENTRYPOINT`, a plist `ProgramArguments`, an npm script, the harness constant —
        // which is every launcher that exists. It does NOT catch one that assembles the path at
        // runtime, and no static scan would.
        //
        // `--untracked` is load-bearing, not tidiness: without it the scan reads the INDEX, so a
        // brand-new launcher file is invisible to this census until someone stages it — the census
        // would go quiet during exactly the edit it exists to catch. Observed while authoring this
        // suite: the same run passed and failed depending on whether `git add` had happened yet.
        const scanned = spawnSync(
            'git',
            ['grep', '-lE', '--untracked', 'orchestrator/(daemon|hostEdge)\\.mjs', '--', ':!test', ':!*.md'],
            {cwd: REPO_ROOT, encoding: 'utf8'}
        );

        expect(scanned.status, 'the repo scan itself must succeed — an empty result would vacuously pass').toBe(0);

        const discovered = scanned.stdout.trim().split('\n').filter(Boolean).sort();

        // Positive control on the instrument: the scan must actually be finding launcher content,
        // not returning a list that happens to match because both sides are empty.
        expect(discovered.length).toBeGreaterThan(DECLARED_LAUNCHERS.length);

        // Set-equality, both directions: an unclassified new file fails the first assertion; a
        // deleted or renamed launcher still under a stale declaration fails the second.
        expect(discovered).toEqual([...DECLARED_LAUNCHERS, ...NON_LAUNCHER_REFERENCES].sort());
        expect(DECLARED_LAUNCHERS.filter(file => NON_LAUNCHER_REFERENCES.includes(file))).toEqual([]);
    });

    test('BOTH harness Brain profiles declare a role — the launch the first attempt would have broken', () => {
        // The defect the first attempt would have shipped: `harness/main.mjs` launches ORCHESTRATOR_ENTRY
        // with these exact fragments, and neither carried a role. Against an empty leaf default
        // that is a refused launch on the checkout smoke AND the packaged product boot.
        const profiles = {
            buildBrainProfile    : buildBrainProfile({chromaPort: 18181, fleetPort: 18182, isolationRoot: '/tmp/neo-16229-probe'}),
            buildPackagedBrainEnv: buildPackagedBrainEnv({dataRoot: '/tmp/neo-16229-probe'})
        };

        for (const [name, profile] of Object.entries(profiles)) {
            expect(LEGAL_PROFILES, `${name} must declare a role from the frozen enum`)
                .toContain(profile[ROLE_ENV]);
        }
    });

    test('both Compose profiles declare container-plane explicitly, never by inheritance', () => {
        for (const file of ['ai/deploy/docker-compose.yml', 'ai/deploy/docker-compose.dev.yml']) {
            const
                compose       = yaml.load(readRepoFile(file)),
                {environment} = compose.services.orchestrator,
                // Compose accepts both the list and the map form; normalize to a map.
                resolved = Array.isArray(environment)
                    ? Object.fromEntries(environment.map(entry => {
                        const index = entry.indexOf('=');
                        return [entry.slice(0, index), entry.slice(index + 1)];
                    }))
                    : environment;

            expect(resolved[ROLE_ENV], `${file} orchestrator must declare its role`)
                .toBe(ORCHESTRATOR_AUTHORITY_PROFILE.containerPlane);
        }
    });
});

test.describe('#16229 — the host-edge entrypoint delivers the POSTURE, not the role alone', () => {
    test('buildHostEdgeEnv resolves every key the LaunchAgent template used to carry', () => {
        const posture = buildHostEdgeEnv({stateDir: '/probe/host-edge'});

        expect(posture[ROLE_ENV]).toBe(ORCHESTRATOR_AUTHORITY_PROFILE.hostEdge);
        expect(posture.NEO_AI_DEPLOYMENT_MODE).toBe('local');
        expect(posture[HOST_EDGE_STATE_DIR_ENV]).toBe('/probe/host-edge');

        // The posture is the whole lane closure. Role alone leaves the plane-anchored
        // `orchestrator.dataDir` default and every host-edge lane at its config default — which is
        // precisely the "role, not posture" gap the first attempt left open.
        expect(posture.NEO_ORCHESTRATOR_LMS_ENABLED).toBe('true');
        expect(posture.NEO_ORCHESTRATOR_MLX_ENABLED).toBe('false');
        expect(posture.NEO_ORCHESTRATOR_OLLAMA_ENABLED).toBe('false');
    });

    test('every lane the posture ENABLES is one the host-edge role actually owns', () => {
        // A posture that enables a lane the role does not own is a contradiction the config layer
        // cannot catch: the enable flag is honoured, the authority filter drops the lane, and the
        // operator reads an enabled flag that does nothing.
        const enabledLanes = {
            NEO_ORCHESTRATOR_LMS_ENABLED   : 'lms',
            NEO_ORCHESTRATOR_MLX_ENABLED   : 'mlx',
            NEO_ORCHESTRATOR_OLLAMA_ENABLED: 'ollama'
        };
        const posture = buildHostEdgeEnv({stateDir: '/probe/host-edge'});

        for (const [envKey, taskName] of Object.entries(enabledLanes)) {
            if (posture[envKey] === 'true') {
                expect(
                    isTaskOwnedByProfile({profile: ORCHESTRATOR_AUTHORITY_PROFILE.hostEdge, taskName}),
                    `${envKey} is enabled but "${taskName}" is a ${getTaskAuthorityClass(taskName)} lane`
                ).toBe(true);
            }
        }
    });

    test('the state-dir default is absolute and outside any checkout', () => {
        const stateDir = buildHostEdgeEnv({})[HOST_EDGE_STATE_DIR_ENV];

        expect(path.isAbsolute(stateDir)).toBe(true);
        expect(stateDir.startsWith(os.homedir())).toBe(true);
        expect(stateDir.startsWith(REPO_ROOT)).toBe(false);
    });

    test('`npm run ai:host-edge` is invocable on Windows — no shell env-assignment prefix', () => {
        const {scripts} = JSON.parse(readRepoFile('package.json'));

        expect(scripts['ai:host-edge']).toBeDefined();
        // `FOO=bar node …` is sh syntax; cmd.exe runs it as a command named `FOO=bar`. A
        // platform-neutral sentence over sh-only syntax is the drift this row exists to stop.
        expect(scripts['ai:host-edge']).not.toMatch(/^\s*[A-Z_][A-Z0-9_]*=/);
        expect(scripts['ai:host-edge']).toContain(HOST_EDGE_ENTRY);
    });

    test('the LaunchAgent is a SUPERVISION wrapper — it no longer carries the posture', () => {
        const {env, programArguments} = parseHostEdgePlist();

        // Thinning is the point: the plist supervises the portable entrypoint instead of
        // re-stating what the entrypoint owns, so the two cannot drift.
        expect(programArguments).toContain(HOST_EDGE_ENTRY);
        expect(programArguments).not.toContain(DAEMON_ENTRY);

        for (const key of Object.keys(buildHostEdgeEnv({stateDir: '/probe/host-edge'}))) {
            if (key === HOST_EDGE_STATE_DIR_ENV) continue; // the one machine-specific coordinate

            expect(env, `the plist must not restate ${key} — the entrypoint owns it`).not.toHaveProperty(key);
        }
    });
});

test.describe('#16229 — a refused launch is a genuine no-op', () => {
    /**
     * @summary Spawns the daemon with a HAND-BUILT env (never `process.env`) and an empty dotenv
     * file, so neither the Playwright resolver injection nor a contributor's local `.env` can
     * supply the role under test.
     * @param {Object} [roleEnv] Extra env entries, e.g. an invalid role.
     * @returns {{status: Number, stderr: String, stateDir: String, created: Boolean}}
     */
    function probeRefusal(roleEnv = {}) {
        const
            tmpRoot      = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-16229-refusal-')),
            stateDir     = path.join(tmpRoot, 'orchestrator'),
            emptyEnvFile = path.join(tmpRoot, 'empty.env');

        fs.writeFileSync(emptyEnvFile, '');

        try {
            const result = spawnSync(process.execPath, [DAEMON_ENTRY], {
                cwd     : REPO_ROOT,
                encoding: 'utf8',
                timeout : 60000,
                env     : {
                    DOTENV_CONFIG_PATH     : emptyEnvFile,
                    HOME                   : process.env.HOME,
                    NEO_AI_ORCHESTRATOR_DIR: stateDir,
                    PATH                   : process.env.PATH,
                    ...roleEnv
                }
            });

            return {
                created: fs.existsSync(stateDir),
                status : result.status,
                stderr : `${result.stderr ?? ''}${result.stdout ?? ''}`,
                stateDir
            };
        } finally {
            fs.rmSync(tmpRoot, {force: true, recursive: true});
        }
    }

    test('no role at all: exits non-zero and writes ZERO plane state', () => {
        const {created, status, stderr} = probeRefusal();

        expect(status, `expected a refusal, got status ${status}: ${stderr}`).not.toBe(0);
        // The severity is not the exit code. `startOrchestrator` runs `ensureDirSync` and then
        // `enforceSingleton`, which SIGTERMs whatever live orchestrator holds the PID file — so a
        // guard placed after it lets a misconfigured launch reap the correct one before dying.
        expect(created, 'a refused launch must not create its state directory').toBe(false);
    });

    test('an invalid role: exits non-zero, names the legal set, and writes ZERO plane state', () => {
        const {created, status, stderr} = probeRefusal({[ROLE_ENV]: 'typo-role'});

        expect(status, `expected a refusal, got status ${status}: ${stderr}`).not.toBe(0);
        expect(stderr).toContain('typo-role');
        expect(created, 'an invalid role must not create its state directory').toBe(false);
    });

    test('POSITIVE CONTROL: the same probe with a valid role gets PAST the guard', () => {
        // Without this control the two refusals above prove nothing — any startup failure
        // (a missing module, a bad cwd) would satisfy them. This asserts the probe harness itself
        // is capable of reaching the boot path, so the refusals are attributable to the role.
        const {created, stderr} = probeRefusal({
            [ROLE_ENV]                              : ORCHESTRATOR_AUTHORITY_PROFILE.hostEdge,
            NEO_AI_DEPLOYMENT_MODE                  : 'local',
            NEO_ORCHESTRATOR_LMS_ENABLED            : 'false',
            NEO_ORCHESTRATOR_MLX_ENABLED            : 'false',
            NEO_ORCHESTRATOR_OLLAMA_ENABLED         : 'false',
            NEO_ORCHESTRATOR_CHROMA_DAEMON_ENABLED  : 'false',
            NEO_ORCHESTRATOR_EMBED_DAEMON_ENABLED   : 'false',
            NEO_ORCHESTRATOR_MESSAGE_DAEMON_ENABLED : 'false',
            NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED  : 'false',
            NEO_ORCHESTRATOR_DEV_SERVER_ENABLED     : 'false',
            NEO_ORCHESTRATOR_NL_BRIDGE_ENABLED      : 'false',
            NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED: 'false'
        });

        expect(created, `a valid role must reach the boot path and create its state dir: ${stderr}`).toBe(true);
    });
});

test.describe('#16229 — the ADR carries the amended default clause', () => {
    test('ADR 0019 §10.8 no longer states container-plane as the canonical authorityProfile default', () => {
        // Normalized: the original clause wrapped mid-sentence, and a line-break change must not
        // be able to make this pass.
        const adr = readRepoFile('learn/agentos/decisions/0019-aiconfig-reactive-provider-ssot.md')
            .replace(/\s+/g, ' ');

        // The behaviour change and the decision record land together, or the record is a lie about
        // a shipped system. Asserted against the OPERATIVE sentence, not the bare string: the
        // amendment note quotes the superseded wording on purpose, and a record that cannot show
        // what it changed is worth less than one that never stated the default.
        expect(adr).not.toContain(
            'The canonical leaf defaults are `deploymentMode=cloud` and `authorityProfile=container-plane`'
        );
        expect(adr).toContain('`authorityProfile` has NO default — a role is declared, never inherited');
    });
});
