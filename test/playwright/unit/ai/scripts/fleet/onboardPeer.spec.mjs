import {test, expect}             from '@playwright/test';
import {execFile, spawnSync}      from 'node:child_process';
import {EventEmitter}             from 'node:events';
import fs                         from 'node:fs';
import os                         from 'node:os';
import path                       from 'node:path';
import {promisify}                from 'node:util';
import Neo                        from '../../../../../../src/Neo.mjs';
import * as core                  from '../../../../../../src/core/_export.mjs';
import FleetControlBridge         from '../../../../../../ai/services/fleet/FleetControlBridge.mjs';
import FleetLifecycleService      from '../../../../../../ai/services/fleet/FleetLifecycleService.mjs';
import FleetManager               from '../../../../../../ai/services/fleet/FleetManager.mjs';
import FleetRegistryService       from '../../../../../../ai/services/fleet/FleetRegistryService.mjs';
import {deriveAgentRepoPath}      from '../../../../../../ai/services/fleet/deriveAgentRepoPath.mjs';
import {startFleetBridgeServer}   from '../../../../../../ai/services/fleet/fleetBridgeServer.mjs';
import {generateLocalBearerToken} from '../../../../../../ai/mcp/server/shared/helpers/localBearer.mjs';
import {
    CURATED_HARNESS_TYPES,
    buildLoginCommand,
    buildOnboardingIntent,
    createOnboardingFleetBridge,
    deriveAuthHandoff,
    normalizeToken,
    originDevRosterHasResident,
    originDevRosterIdentity,
    parseOnboardArgs,
    planOnboarding,
    renderPlan
} from '../../../../../../ai/scripts/fleet/onboardPeer.mjs';
import {parseGenerateArgs} from '../../../../../../ai/scripts/setup/generateRosterOnboarding.mjs';

const
    execFileAsync = promisify(execFile),
    BASE_OPTIONS  = Object.freeze({
        residentId    : 'neo-gpt-2',
        githubUsername: 'neo-gpt-2',
        harnessType   : 'codex'
    }),
    REPO_OPTIONS = Object.freeze({
        cloneUrl: 'https://github.com/x/y.git',
        repoSlug: 'x/y'
    });

/**
 * @summary Builds a valid intent from the shared fixture options.
 * @param {Object} [overrides] Option overrides.
 * @returns {Object} The frozen intent.
 */
function buildIntent(overrides = {}) {
    const built = buildOnboardingIntent({...BASE_OPTIONS, ...overrides});

    expect(built.valid).toBe(true);

    return built.intent;
}

/**
 * @summary Builds the registry's public agent projection for planner facts.
 * @param {Object} [overrides] Agent-field overrides.
 * @returns {Object}
 */
function buildAgent(overrides = {}) {
    return {
        id            : 'neo-gpt-2',
        githubUsername: 'neo-gpt-2',
        harnessType   : 'codex',
        metadata      : {repo: {...REPO_OPTIONS}},
        ...overrides
    }
}

/**
 * @summary Close an ephemeral Fleet HTTP server and await its listening-socket release.
 * @param {Object} server Node HTTP server.
 * @returns {Promise<void>}
 */
function closeServer(server) {
    return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

test.describe('onboardPeer — intent construction (pure half)', () => {

    test('the resident handle is the Fleet agent id; repo coordinates come as a pair or not at all', () => {
        const intent = buildIntent(REPO_OPTIONS);

        expect(intent.agentId).toBe('neo-gpt-2');
        expect(intent.repo).toEqual({cloneUrl: 'https://github.com/x/y.git', repoSlug: 'x/y'});

        expect(buildOnboardingIntent({...BASE_OPTIONS, cloneUrl: 'https://github.com/x/y.git'}).valid).toBe(false);
        expect(buildOnboardingIntent({...BASE_OPTIONS, repoSlug: 'x/y'}).valid).toBe(false);
    });

    test('credential-bearing clone URLs and terminal-control payloads refuse before registry persistence or rendering', () => {
        expect(buildOnboardingIntent({...BASE_OPTIONS, ...REPO_OPTIONS, cloneUrl: 'https://ghp_SUPERSECRET@github.com/x/y.git'})).toMatchObject({valid: false});
        expect(buildOnboardingIntent({...BASE_OPTIONS, ...REPO_OPTIONS, cloneUrl: 'https://github.com/x/y.git?access_token=SUPERSECRET'})).toMatchObject({valid: false});
        expect(buildOnboardingIntent({...BASE_OPTIONS, ...REPO_OPTIONS, cloneUrl: 'https://github.com/x/y.git#SUPERSECRET'})).toMatchObject({valid: false});
        expect(buildOnboardingIntent({...BASE_OPTIONS, ...REPO_OPTIONS, repoSlug: 'x/y\n[FAKE]'})).toMatchObject({valid: false});

        const
            secret = 'https://ghp_SUPERSECRET@github.com/x/y.git',
            intent = buildIntent(REPO_OPTIONS),
            report = renderPlan(intent, planOnboarding({intent, facts: {agent: null, rosterHasResident: false}})).join('\n');

        expect(report).not.toContain(intent.repo.cloneUrl);
        expect(report).not.toContain(secret);
    });

    test('merged-roster verification reads the exact origin/dev authority, not the current worktree', () => {
        let invocation;
        const present = originDevRosterHasResident({
            residentId  : 'neo-gpt-2',
            repoRoot    : '/repo',
            execFileImpl: (...args) => {
                invocation = args;
                return "export const IDENTITIES = [{id: '@neo-gpt-2'}];";
            }
        });

        expect(present).toBe(true);
        expect(invocation).toEqual(['git', ['show', 'origin/dev:ai/graph/identityRoots.mjs'], {cwd: '/repo', encoding: 'utf8'}]);
        expect(originDevRosterIdentity({
            residentId  : 'neo-gpt-2',
            execFileImpl: () => "export const IDENTITIES = [{id: '@neo-gpt-2', properties: {participationStatus: 'active'}}];"
        })).toEqual({id: '@neo-gpt-2', participationStatus: 'active'});
        expect(originDevRosterHasResident({
            residentId  : 'neo-gpt-2',
            execFileImpl: () => "// retired: {id: '@neo-gpt-2'}\nexport const IDENTITIES = [{id: '@neo-gpt-20'}];"
        })).toBe(false);
        expect(() => originDevRosterHasResident({residentId: 'neo-gpt-2', execFileImpl: () => 'not valid module source'}))
            .toThrow(/cannot parse the merged identity roster/);
    });

    test('only curated harness families are accepted, with a named refusal', () => {
        // The curated set IS the launch-templated subset — one derived truth, widened in lockstep
        // with deriveHarnessLaunchSpec. `native-neo` stays registered-but-unlaunchable.
        expect(CURATED_HARNESS_TYPES).toEqual(['antigravity', 'claude-code', 'claude-desktop', 'codex', 'codex-desktop', 'kimi-code', 'opencode']);
        expect(CURATED_HARNESS_TYPES).not.toContain('native-neo');

        const built = buildOnboardingIntent({...BASE_OPTIONS, harnessType: 'gemini-cli'});

        expect(built.valid).toBe(false);
        expect(built.reason).toContain('claude-code');
        expect(built.reason).toContain('antigravity');
    });

    test('malformed identifiers fail loud, and the @-prefix normalizes off', () => {
        expect(normalizeToken('@neo-gpt-2', '--resident-id')).toEqual({valid: true, reason: null, token: 'neo-gpt-2'});
        expect(normalizeToken('Bad Handle', '--resident-id').valid).toBe(false);
        expect(buildOnboardingIntent({}).valid).toBe(false);
    });

    test('there is NO engine and NO name input surface — the flags do not exist', () => {
        expect(parseOnboardArgs(['--model', 'gpt-6']).valid).toBe(false);
        expect(parseOnboardArgs(['--social-name', 'Minerva']).valid).toBe(false);
        expect(parseOnboardArgs(['--resident-id']).valid).toBe(false);   // missing value refuses too
    });
});

test.describe('onboardPeer — the two-phase planner', () => {

    test('PHASE A: an un-rostered resident ends at the roster ceremony PRINT + the operator gate', () => {
        const intent = buildIntent(REPO_OPTIONS),
              plan   = planOnboarding({intent, facts: {agent: null, rosterHasResident: false}});

        expect(plan.phase).toBe('A');
        expect(plan.segments.map(segment => [segment.key, segment.action])).toEqual([
            ['define', 'CREATE'],
            ['repo',   'CREATE'],
            ['roster', 'PRINT']
        ]);
        const generator = plan.segments[2].detail;

        expect(generator).toContain('generateRosterOnboarding.mjs --handle neo-gpt-2');
        expect(generator).not.toContain('--resident-id');
        expect(generator).toContain('--family gpt');
        expect(generator).not.toContain('<family>');
        expect(parseGenerateArgs(['--handle', 'neo-gpt-2', '--github-username', 'neo-gpt-2', '--family', 'gpt']).valid).toBe(true);
        expect(plan.gateMessage).toContain('membership ceremony');
        expect(plan.gateMessage).toContain('git switch dev');
        expect(plan.gateMessage).toContain('git pull --ff-only origin dev');
        expect(plan.gateMessage).toContain('seedAgentIdentities.mjs');
        expect(plan.gateMessage).toContain('restart the Memory Core');
        expect(plan.gateMessage).toContain("get_node({id:'@neo-gpt-2', projection:'full'})");
        expect(plan.gateMessage).toContain('who_is_online({verbose:true})');
        // Phase A NEVER contains a launch segment — launching an un-rostered resident is refused by omission
        expect(plan.segments.some(segment => segment.key === 'launch')).toBe(false);
    });

    test('PHASE A re-run: existing definition + repo report EXISTS honestly', () => {
        const intent = buildIntent(REPO_OPTIONS),
              plan   = planOnboarding({intent, facts: {agent: buildAgent(), rosterHasResident: false}});

        expect(plan.segments.map(segment => segment.action)).toEqual(['EXISTS', 'EXISTS', 'PRINT']);
    });

    test('occupied-definition drift REFUSES; repo-coordinate drift UPDATEs only through the owner', () => {
        const intent = buildIntent(REPO_OPTIONS);

        const wrongIdentity = planOnboarding({
            intent,
            facts: {agent: buildAgent({githubUsername: 'someone-else'}), rosterHasResident: true, graphNodeSeeded: true}
        });

        expect(wrongIdentity.segments.find(segment => segment.key === 'define').action).toBe('REFUSE');
        expect(wrongIdentity.segments.some(segment => segment.key === 'launch')).toBe(false);

        const repoDrift = planOnboarding({
            intent,
            facts: {agent: buildAgent({metadata: {repo: {cloneUrl: 'https://github.com/old/repo.git', repoSlug: 'old/repo'}}}), rosterHasResident: true, graphNodeSeeded: true}
        });

        expect(repoDrift.segments.find(segment => segment.key === 'repo')).toMatchObject({action: 'UPDATE'});
        expect(repoDrift.segments.find(segment => segment.key === 'repo').detail).toContain('FleetManager.setRepo');
    });

    test('a missing repo intent REFUSES for a new resident, but may reuse exact existing coordinates', () => {
        const intent = buildIntent();

        const missing = planOnboarding({intent, facts: {agent: null, rosterHasResident: true, graphNodeSeeded: true}});

        expect(missing.segments.find(segment => segment.key === 'repo')).toMatchObject({action: 'REFUSE'});
        expect(missing.segments.some(segment => segment.key === 'launch')).toBe(false);

        const existing = planOnboarding({intent, facts: {agent: buildAgent(), rosterHasResident: true, graphNodeSeeded: true, running: false}});

        expect(existing.segments.find(segment => segment.key === 'repo')).toMatchObject({action: 'EXISTS'});
        expect(existing.segments.find(segment => segment.key === 'launch')).toMatchObject({action: 'CREATE'});
    });

    test('PHASE B REFUSE: roster merged but the graph node is NOT seeded — the exact operator step is named', () => {
        const intent = buildIntent(REPO_OPTIONS),
              plan   = planOnboarding({intent, facts: {agent: buildAgent(), rosterHasResident: true, graphNodeSeeded: false}});

        expect(plan.phase).toBe('B');

        const preflight = plan.segments.find(segment => segment.key === 'preflight');

        expect(preflight.action).toBe('REFUSE');
        expect(preflight.detail).toContain('git switch dev');
        expect(preflight.detail).toContain('git pull --ff-only origin dev');
        expect(preflight.detail).toContain('seedAgentIdentities.mjs');
        expect(preflight.detail).toContain('restart Memory Core');
        expect(plan.segments.some(segment => segment.key === 'launch')).toBe(false);
    });

    test('PHASE B REFUSE: an unreachable graph cannot be promoted from unverifiable to launchable', () => {
        const intent = buildIntent(REPO_OPTIONS),
              plan   = planOnboarding({intent, facts: {agent: buildAgent(), rosterHasResident: true, graphNodeSeeded: null, running: false}});

        expect(plan.segments.find(segment => segment.key === 'preflight')).toMatchObject({action: 'REFUSE'});
        expect(plan.segments.some(segment => segment.key === 'launch')).toBe(false);
    });

    test('PHASE B happy path: seeded node → launch CREATE + auth PRINT', () => {
        const intent = buildIntent(REPO_OPTIONS),
              seeded = planOnboarding({
                  intent,
                  facts: {
                      agent                      : buildAgent(),
                      expectedParticipationStatus: 'active',
                      graphNodeSeeded            : true,
                      graphParticipationStatus   : 'active',
                      rosterHasResident          : true,
                      running                    : false
                  }
              });

        expect(seeded.phase).toBe('B');
        expect(seeded.segments.find(segment => segment.key === 'preflight').action).toBe('OK');
        expect(seeded.segments.find(segment => segment.key === 'preflight').detail).toContain("participationStatus 'active'");
        expect(seeded.segments.find(segment => segment.key === 'launch').action).toBe('CREATE');
        expect(seeded.segments.find(segment => segment.key === 'auth').action).toBe('PRINT');
    });

    test('PHASE B REFUSE: a stale graph status cannot launch until pull → seed → full/liveness verification', () => {
        const intent = buildIntent(REPO_OPTIONS),
              plan   = planOnboarding({
                  intent,
                  facts: {
                      agent                      : buildAgent(),
                      expectedParticipationStatus: 'active',
                      graphNodeSeeded            : true,
                      graphParticipationStatus   : 'temporarily_unreachable',
                      rosterHasResident          : true,
                      running                    : false
                  }
              }),
              preflight = plan.segments.find(segment => segment.key === 'preflight');

        expect(preflight.action).toBe('REFUSE');
        expect(preflight.detail).toContain("expects '@neo-gpt-2' participationStatus 'active'");
        expect(preflight.detail).toContain("projects 'temporarily_unreachable'");
        expect(preflight.detail).toContain('git switch dev');
        expect(preflight.detail).toContain('git pull --ff-only origin dev');
        expect(preflight.detail).toContain('seedAgentIdentities.mjs');
        expect(preflight.detail).toContain("get_node({id:'@neo-gpt-2', projection:'full'})");
        expect(preflight.detail).toContain('who_is_online({verbose:true})');
        expect(plan.segments.some(segment => segment.key === 'launch')).toBe(false);
    });

    test('PHASE B re-run on a running agent reports launch EXISTS (start short-circuits at the owner)', () => {
        const intent = buildIntent(REPO_OPTIONS),
              plan   = planOnboarding({intent, facts: {agent: buildAgent(), rosterHasResident: true, graphNodeSeeded: true, running: true}});

        expect(plan.segments.find(segment => segment.key === 'launch').action).toBe('EXISTS');
    });

    test('renderPlan derives from the same plan the commit path executes — phase + gate rendered verbatim', () => {
        const intent   = buildIntent(REPO_OPTIONS),
              plan     = planOnboarding({intent, facts: {agent: null, rosterHasResident: false}}),
              rendered = renderPlan(intent, plan).join('\n');

        expect(rendered).toContain('phase A');
        expect(rendered).toContain('OPERATOR GATE');
        expect(rendered).toContain('[PRINT] roster');
    });
});

test.describe('onboardPeer — auth handoff', () => {
    test('the lifecycle-resolved absolute home is shell-quoted; placeholders and relative homes refuse', () => {
        expect(buildLoginCommand({harnessType: 'codex', authHome: "/tmp/neo homes/o'neil", authCommand: '/Applications/ChatGPT.app/Contents/Resources/codex'}))
            .toBe("CODEX_HOME='/tmp/neo homes/o'\\''neil' '/Applications/ChatGPT.app/Contents/Resources/codex' login");
        expect(buildLoginCommand({harnessType: 'claude-code', authHome: '/tmp/claude-home', authCommand: '/opt/claude'}))
            .toBe("CLAUDE_CONFIG_DIR='/tmp/claude-home' '/opt/claude'  # then /login inside the session");
        expect(() => buildLoginCommand({harnessType: 'codex', authHome: '<instance home>', authCommand: '/opt/codex'})).toThrow(/absolute authHome/);
        expect(() => buildLoginCommand({harnessType: 'codex', authHome: '/tmp/x\nFAKE', authCommand: '/opt/codex'})).toThrow(/control-character-free/);
    });

    test('the executable login helper is marker-only — GUI families cannot manufacture a raw relaunch', () => {
        expect(() => buildLoginCommand({harnessType: 'claude-desktop', instanceHome: '/srv/homes/a', launchCommand: '/Applications/Claude.app/Contents/MacOS/Claude'}))
            .toThrow(/marker-family only/);
        expect(() => buildLoginCommand({harnessType: 'antigravity', instanceHome: '/srv/homes/b', launchCommand: '/Applications/Antigravity.app/Contents/MacOS/Antigravity'}))
            .toThrow(/marker-family only/);
        expect(() => buildLoginCommand({harnessType: 'native-neo', instanceHome: '/srv/homes/c', launchCommand: '/bin/x'})).toThrow(/unsupported harnessType/);
    });

    test('the executable login helper names the actual authMode for non-marker families — env-key is not mislabeled in-app', () => {
        expect(() => buildLoginCommand({harnessType: 'opencode', authHome: '/srv/homes/p', authCommand: '/usr/local/bin/opencode'}))
            .toThrow(/authMode 'env-key'; login commands are marker-family only/);
    });

    test('opencode (env-key): the post-launch handoff is done plus the provisioning reminder — no login, no sign-in, no guessed command', () => {
        const handoff = deriveAuthHandoff({harnessType: 'opencode', status: {authRequired: null, instanceHome: '/srv/homes/p'}});
        const output  = handoff.lines.join('\n');

        expect(handoff.kind).toBe('done');
        expect(output).toContain('env-key family');
        expect(output).toContain('no per-home login step');
        expect(output).not.toContain('SIGN-IN REQUIRED');
        expect(output).not.toContain('LOGIN REQUIRED');
    });

    test('claude-desktop authenticates in the Fleet-launched window and routes closed-window recovery back through Fleet', () => {
        const status = {
            authRequired : null,
            instanceHome : '/srv/homes/a',
            launchCommand: '/Applications/Claude.app/Contents/MacOS/Claude'
        };
        const handoff = deriveAuthHandoff({
            harnessType: 'claude-desktop',
            status
        });
        const output = handoff.lines.join('\n');

        expect(handoff.kind).toBe('sign-in-app');
        expect(output).toContain('already Fleet-launched app window');
        expect(output).toContain('re-run this onboardPeer command with --commit');
        expect(output).toContain('Start in the Fleet cockpit');
        expect(output).not.toContain(status.instanceHome);
        expect(output).not.toContain(status.launchCommand);
        expect(output).not.toContain('--user-data-dir');
        expect(output).not.toContain('launchCommand');
    });

    test('antigravity authenticates in the Fleet-launched window without leaking an unmanaged relaunch', () => {
        const status = {
            authRequired : null,
            instanceHome : '/srv/homes/b',
            launchCommand: '/Applications/Antigravity.app/Contents/MacOS/Antigravity'
        };
        const handoff = deriveAuthHandoff({harnessType: 'antigravity', status});
        const output  = handoff.lines.join('\n');

        expect(handoff.kind).toBe('sign-in-app');
        expect(output).toContain('already Fleet-launched app window');
        expect(output).toContain('restart through Fleet');
        expect(output).not.toContain(status.instanceHome);
        expect(output).not.toContain(status.launchCommand);
        expect(output).not.toContain('--user-data-dir');
        expect(output).not.toContain('launchCommand');
    });

    test('marker families keep the heuristic-driven branches unchanged: true → login command, false → done, null → honest WARN with no guessed command', () => {
        const required = deriveAuthHandoff({harnessType: 'codex', status: {authRequired: true, authHome: '/srv/homes/c', authCommand: '/opt/codex'}});

        expect(required.kind).toBe('login-required');
        expect(required.lines.join('\n')).toContain("CODEX_HOME='/srv/homes/c' '/opt/codex' login");

        const claudeRequired = deriveAuthHandoff({harnessType: 'claude-code', status: {authRequired: true, authHome: '/srv/homes/d', authCommand: '/opt/claude'}});

        expect(claudeRequired.kind).toBe('login-required');
        expect(claudeRequired.lines.at(-1)).toBe("    CLAUDE_CONFIG_DIR='/srv/homes/d' '/opt/claude'  # then /login inside the session");

        expect(deriveAuthHandoff({harnessType: 'codex', status: {authRequired: false, authHome: '/srv/homes/c', authCommand: '/opt/codex'}}).kind).toBe('done');

        const unknown = deriveAuthHandoff({harnessType: 'codex', status: {authRequired: null, authHome: '/srv/homes/c', authCommand: '/opt/codex'}});

        expect(unknown.kind).toBe('unknown');
        expect(unknown.lines.join('\n')).not.toContain('codex login');
    });

    test('Codex Desktop marker auth uses the bundled CLI + nested auth home, never the GUI main', () => {
        const handoff = deriveAuthHandoff({
            harnessType: 'codex-desktop',
            status     : {
                authRequired : true,
                instanceHome : '/srv/homes/desktop',
                launchCommand: '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
                authHome     : '/srv/homes/desktop/codex-home',
                authCommand  : '/Applications/ChatGPT.app/Contents/Resources/codex'
            }
        });

        expect(handoff.kind).toBe('login-required');
        expect(handoff.lines.join('\n')).toContain("CODEX_HOME='/srv/homes/desktop/codex-home' '/Applications/ChatGPT.app/Contents/Resources/codex' login");
        expect(handoff.lines.join('\n')).not.toContain('Contents/MacOS/ChatGPT');
    });

    test('the dry-run planner names the in-app mode for GUI families — plan and post-launch decision cannot drift', () => {
        const intent = buildIntent({harnessType: 'claude-desktop'}),
              plan   = planOnboarding({intent, facts: {agent: buildAgent({harnessType: 'claude-desktop'}), rosterHasResident: true, graphNodeSeeded: true, running: false, authRequired: null}}),
              auth   = plan.segments.find(segment => segment.key === 'auth');

        expect(auth.detail).toContain('in-app sign-in');
        expect(auth.detail).not.toContain('UNKNOWN');

        // marker families keep the heuristic wording
        const codexPlan = planOnboarding({intent: buildIntent(), facts: {agent: buildAgent(), rosterHasResident: true, graphNodeSeeded: true, running: false, authRequired: null}});

        expect(codexPlan.segments.find(segment => segment.key === 'auth').detail).toContain('UNKNOWN');
    });

    test('the dry-run planner names the env-key mode for opencode — plan and post-launch decision cannot drift', () => {
        const plan = planOnboarding({intent: buildIntent({harnessType: 'opencode'}), facts: {agent: buildAgent({harnessType: 'opencode'}), rosterHasResident: true, graphNodeSeeded: true, running: false, authRequired: null}});

        const auth = plan.segments.find(segment => segment.key === 'auth');

        expect(auth.detail).toContain('auth rides the spawned env');
        expect(auth.detail).not.toContain('UNKNOWN');
        expect(auth.detail).not.toContain('in-app sign-in');
    });

    test('the rendered login line executes through /bin/sh without command injection', async () => {
        const root          = fs.mkdtempSync(path.join(os.tmpdir(), 'onboard-peer-login-')),
              capturePath   = path.join(root, 'capture.json'),
              sentinelPath  = path.join(root, 'PWNED'),
              launchCommand = path.join(root, 'fake;touch PWNED'),
              instanceHome  = path.join(root, "home with ' quote"),
              command       = buildLoginCommand({harnessType: 'codex', authHome: instanceHome, authCommand: launchCommand});

        try {
            fs.writeFileSync(launchCommand, `#!/usr/bin/env node\nimport fs from 'node:fs';\nfs.writeFileSync(process.env.CAPTURE, JSON.stringify({home: process.env.CODEX_HOME, argv: process.argv.slice(2)}));\n`);
            fs.chmodSync(launchCommand, 0o755);

            await execFileAsync('/bin/sh', ['-c', command], {
                cwd: root,
                env: {...process.env, CAPTURE: capturePath}
            });

            expect(JSON.parse(fs.readFileSync(capturePath, 'utf8'))).toEqual({home: instanceHome, argv: ['login']});
            expect(fs.existsSync(sentinelPath)).toBe(false);
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    });
});

test.describe('onboardPeer — long-lived Fleet owner transport', () => {
    test('two independent Node CLI processes observe one owner process and an idempotent second start', async () => {
        let spawnCount = 0,
              capturedSpawn;
        const root         = fs.mkdtempSync(path.join(os.tmpdir(), 'onboard-peer-owner-')),
              managedRoot  = path.join(root, 'repos'),
              instanceRoot = path.join(root, 'instance homes'),
              repoPath     = deriveAgentRepoPath({managedRoot, agentId: 'neo-gpt-2', repoSlug: 'x/y'}),
              original     = {
                  bridgeManager        : FleetControlBridge.manager,
                  bridgeRegistry       : FleetControlBridge.registry,
                  lifecycleBinaries    : FleetLifecycleService.harnessBinaryPaths,
                  lifecycleExecFile    : FleetLifecycleService.execFileFn,
                  lifecycleInstanceRoot: FleetLifecycleService.instanceRoot,
                  lifecycleRegistry    : FleetLifecycleService.registry,
                  lifecycleSpawn       : FleetLifecycleService.spawnFn,
                  managerLifecycle     : FleetManager.lifecycleService,
                  managerManagedRoot   : FleetManager.managedRoot,
                  managerProvision     : FleetManager.provisionAndStartFn,
                  registryDataDir      : FleetRegistryService.dataDir
              };

        fs.mkdirSync(path.join(repoPath, '.git'), {recursive: true});

        FleetRegistryService.dataDir  = path.join(root, 'registry');
        FleetRegistryService.loadedDir = null;
        FleetRegistryService.agents.clear();

        FleetLifecycleService.processes.clear();
        FleetLifecycleService.registry           = FleetRegistryService;
        FleetLifecycleService.instanceRoot       = instanceRoot;
        FleetLifecycleService.harnessBinaryPaths = {codex: process.execPath};
        FleetLifecycleService.execFileFn         = () => {};
        FleetLifecycleService.spawnFn            = (command, args, options) => {
            spawnCount++;
            capturedSpawn = {command, args, options};

            const child = new EventEmitter();
            child.pid    = 4242;
            child.stderr = new EventEmitter();
            child.kill   = () => true;
            return child
        };

        FleetManager.lifecycleService    = FleetLifecycleService;
        FleetManager.managedRoot         = managedRoot;
        FleetManager.provisionAndStartFn = null;
        FleetControlBridge.registry      = FleetRegistryService;
        FleetControlBridge.manager       = FleetManager;

        const bearerToken = generateLocalBearerToken(),
              server      = await startFleetBridgeServer({
                  port         : 0,
                  bearerToken,
                  viewerContext: {userId: 'onboard-owner', username: 'Onboard Owner', agentIdentityNodeId: '@onboard-owner'},
                  runInContext : (context, fn) => fn()
              }),
              url       = `http://127.0.0.1:${server.address().port}/fleet`,
              moduleUrl = new URL('../../../../../../ai/scripts/fleet/onboardPeer.mjs', import.meta.url).href;

        try {
            const firstCode = `
                const {createOnboardingFleetBridge} = await import(${JSON.stringify(moduleUrl)});
                const bridge = createOnboardingFleetBridge({url: ${JSON.stringify(url)}});
                await bridge.defineAgent({id:'neo-gpt-2', githubUsername:'neo-gpt-2', harnessType:'codex'});
                await bridge.setRepo({id:'neo-gpt-2', cloneUrl:'https://github.com/x/y.git', repoSlug:'x/y'});
                console.log(JSON.stringify(await bridge.startAgent('neo-gpt-2')));
            `;
            const firstRun   = await execFileAsync(process.execPath, ['--input-type=module', '-e', firstCode], {encoding: 'utf8', timeout: 30_000, env: {...process.env, NEO_FLEET_BEARER: bearerToken}}),
                  firstStart = JSON.parse(firstRun.stdout);

            const relativeHome = path.relative(instanceRoot, firstStart.instanceHome);

            expect(firstStart.instanceHome).toBe(capturedSpawn.options.env.CODEX_HOME);
            expect(firstStart.launchCommand).toBe(process.execPath);
            expect(capturedSpawn.command).toBe(process.execPath);
            expect(relativeHome).not.toBe('');
            expect(relativeHome.startsWith('..')).toBe(false);
            expect(path.isAbsolute(relativeHome)).toBe(false);

            const secondCode = `
                const {createOnboardingFleetBridge} = await import(${JSON.stringify(moduleUrl)});
                const bridge = createOnboardingFleetBridge({url: ${JSON.stringify(url)}});
                console.log(JSON.stringify({
                    agent: await bridge.getAgent('neo-gpt-2'),
                    runtime: await bridge.fleetRuntimeStatus(),
                    start: await bridge.startAgent('neo-gpt-2')
                }));
            `;
            const secondRun  = await execFileAsync(process.execPath, ['--input-type=module', '-e', secondCode], {encoding: 'utf8', timeout: 30_000, env: {...process.env, NEO_FLEET_BEARER: bearerToken}}),
                  secondView = JSON.parse(secondRun.stdout);

            expect(secondView.agent).toMatchObject({metadata: {repo: REPO_OPTIONS}});
            expect(secondView.runtime).toEqual([
                expect.objectContaining({agentId: 'neo-gpt-2', running: true, state: 'running'})
            ]);
            expect(secondView.start.pid).toBe(4242);
            expect(spawnCount).toBe(1);
        } finally {
            await closeServer(server);
            FleetLifecycleService.processes.clear();
            FleetControlBridge.manager                 = original.bridgeManager;
            FleetControlBridge.registry                = original.bridgeRegistry;
            FleetLifecycleService.harnessBinaryPaths   = original.lifecycleBinaries;
            FleetLifecycleService.execFileFn           = original.lifecycleExecFile;
            FleetLifecycleService.instanceRoot         = original.lifecycleInstanceRoot;
            FleetLifecycleService.registry             = original.lifecycleRegistry;
            FleetLifecycleService.spawnFn              = original.lifecycleSpawn;
            FleetManager.lifecycleService              = original.managerLifecycle;
            FleetManager.managedRoot                   = original.managerManagedRoot;
            FleetManager.provisionAndStartFn           = original.managerProvision;
            FleetRegistryService.dataDir               = original.registryDataDir;
            FleetRegistryService.loadedDir             = null;
            FleetRegistryService.agents.clear();
            fs.rmSync(root, {recursive: true, force: true});
        }
    });

    test('an unreachable long-lived owner fails closed with the operator recovery command', async () => {
        const endpointSecret = 'credential-shaped-endpoint-secret';
        const bridge = createOnboardingFleetBridge({
            bearerToken: generateLocalBearerToken(),
            fetchImpl  : async () => { throw new Error('raw-upstream-transport-secret') },
            url        : `http://127.0.0.1:8083/fleet?token=${endpointSecret}`
        });

        await expect(bridge.getAgent('neo-gpt-2')).rejects.toThrow(/npm run ai:fleet-server/);
        await expect(bridge.getAgent('neo-gpt-2')).rejects.not.toThrow(endpointSecret);
        await expect(bridge.getAgent('neo-gpt-2')).rejects.not.toThrow('raw-upstream-transport-secret')
    });

    test('a missing process bearer fails closed at construction with the launch-contract remedy', () => {
        const priorBearer = process.env.NEO_FLEET_BEARER;
        delete process.env.NEO_FLEET_BEARER;

        try {
            expect(() => createOnboardingFleetBridge({fetchImpl: async () => ({ok: true, json: async () => ({})})}))
                .toThrow(/NEO_FLEET_BEARER/)
        } finally {
            priorBearer !== undefined && (process.env.NEO_FLEET_BEARER = priorBearer)
        }
    });
});

test.describe('onboardPeer — fresh-process bootstrap contract', () => {
    test('--help exits 0 with usage output in a BARE process — no Neo bootstrap, no services touched', () => {
        const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../../..'),
              result   = spawnSync(process.execPath, ['ai/scripts/fleet/onboardPeer.mjs', '--help'], {cwd: repoRoot, encoding: 'utf-8', timeout: 30_000});

        expect(result.status, `--help must exit 0 (stderr: ${result.stderr})`).toBe(0);
        expect(result.stdout).toContain('Usage:');
        expect(result.stdout).toContain('roster ceremony');
    });
});
