import path                                                                                         from 'node:path';
import {REMOTE_MCP_CREDENTIAL_ENV_VAR}                                                              from './mcpServers.mjs';
import {renderAboutThisLayerMd, renderIdentityAnchorHookMjs, renderIdentityMd, renderMemoryIndexMd} from './seatMemoryLayerTemplate.mjs';

/**
 * The canonical MCP server set every Kimi Code seat wires — the same four servers as
 * `OPENCODE_SEAT_SERVERS` (`generateOpenCodeSeatConfig.mjs`). Mirrored as fixed module data on
 * purpose: two call-sites do not justify a shared constant with a misleading harness-specific
 * name, and an unlisted server here is a deliberate caller override via `options.servers`,
 * never an accident of omission.
 * @type {ReadonlyArray<{name: String, script: String, needsCwd: Boolean}>}
 */
export const KIMI_SEAT_SERVERS = Object.freeze([
    {name: 'neo-mjs-memory-core',    script: 'ai/mcp/server/memory-core/mcp-server.mjs',    needsCwd: false},
    {name: 'neo-mjs-github-workflow', script: 'ai/mcp/server/github-workflow/mcp-server.mjs', needsCwd: false},
    {name: 'neo-mjs-knowledge-base', script: 'ai/mcp/server/knowledge-base/mcp-server.mjs', needsCwd: false},
    {name: 'neo-mjs-neural-link',    script: 'ai/mcp/server/neural-link/mcp-server.mjs',    needsCwd: true}
]);

/**
 * Generate every config/scaffold file a Kimi Code seat boots from, as a PURE params→files
 * emission (the AiConfig SSOT purity discipline: no config imports, no env reads, no fs access,
 * no hidden defaults — callers resolve every path). The launch path writes the returned files;
 * this module only decides their content. Sibling of `generateOpenCodeSeatConfig.mjs` — same
 * three load-bearing constraints, with the harness-specific surfaces mapped:
 *
 * 1. **AgentOS runtime authority.** MCP server CODE runs from the AgentOS runtime root (the Memory Core
 *    resolves its data root from the server code's own file location — a per-seat copy forks an
 *    empty graph island). The island guard REJECTS any server script resolving outside
 *    `agentosRuntimeRoot`, sibling parity.
 * 2. **Seat personal.** Identity + credentials load via `--env-file` from the seat's OWN `.env`
 *    (`NEO_AGENT_IDENTITY`, `GH_TOKEN`, provider keys), wired per-server in `mcp.json`.
 * 3. **The memory layer loads via the identity-anchor hook.** Kimi Code auto-loads the PROJECT
 *    `AGENTS.md` and ships no per-seat `instructions` slot; `SessionStart` is observation-only
 *    (its stdout never enters context), but `UserPromptSubmit` stdout DOES (verified live on the
 *    first Kimi seat, 2026-07-22: boot inject + post-compact reload + silent otherwise). The
 *    generator therefore emits `hooks/identityAnchorHook.mjs` into the harness home and wires it
 *    as `UserPromptSubmit` + `PostCompact` `[[hooks]]` — the layer reloads at the two moments
 *    identity dies (boot, compaction) with zero per-turn cost, fail-open. Persistence without
 *    reload is a no-op (the day-two lesson); the mechanism, not a checklist, is the answer.
 *
 * **Wake-addressable by construction (the wake-adapter coordinate contracts):** the emitted `config.toml`
 * wires the git-tracked SessionStart hook `.kimi-code/hooks/wakeEnvelopeHook.mjs` (present in
 * every neo checkout), which is `KIMI_CODE_HOME`-aware: a Fleet-launched seat writes its
 * envelope beside its own `server/instances/{server_id}.json` coordinates — exactly what the
 * wake daemon's kimi-server route discovers. No seat-side writers beyond the tracked hook.
 *
 * **Two roots, by harness design:** AgentOS executables and Neural Link's package/Bridge cwd derive
 * from `agentosRuntimeRoot`; the project-level `.kimi-code/mcp.json` and seat `.env` live under
 * `targetRepoRoot`. `config.toml` remains in the harness home (`kimiHome` — `$KIMI_CODE_HOME`).
 * The generator takes every root explicitly; executable and target authority cannot be inferred
 * from each other after the repository split.
 *
 * **Emission shape:** `mcp.json` is strict JSON (comment-stripped `JSON.parse` must succeed —
 * the unit spec enforces it). `config.toml` carries only what the harness needs beyond its
 * managed defaults: the managed `kimi-code` provider/model resolution stays harness-owned
 * (interactive provisioning writes provider details on first login; fleet auth rides the seat
 * env per the launch contract's `env-key` mode).
 *
 * @param {Object} options
 * @param {String} options.agentosRuntimeRoot Absolute AgentOS runtime root — every local MCP
 *                                            entrypoint and Neural Link `--cwd` resolve here.
 * @param {String} options.targetRepoRoot     Absolute target checkout — the `.kimi-code/mcp.json`
 *                                            destination and project authority.
 * @param {String} options.seatEnvFile        Absolute path of the seat's own `.env` (identity + keys).
 * @param {String} options.kimiHome       Absolute path of the seat's harness home
 *                                        (`$KIMI_CODE_HOME`) — the `config.toml` target.
 * @param {String} options.memoryDir      Absolute path of the seat's persistent memory dir —
 *                                        the `MEMORY.md` / `seat-pointers.md` / `identity.md` /
 *                                        `about-this-layer.md` scaffold target, baked into the
 *                                        emitted identity-anchor hook.
 * @param {String} options.nodeBinary     Absolute path of the node binary for server commands.
 * @param {Object} [options.environment]  Extra env merged verbatim into EVERY server's `env`
 *                                        block in `mcp.json` (caller-resolved: PATH, HOME,
 *                                        local inference hosts). Default `{}`.
 * @param {String} [options.defaultModel] Default model alias for `config.toml`.
 *                                        Default `'kimi-code/k3'`.
 * @param {Array}  [options.servers]      Override the canonical server set
 *                                        ({@link KIMI_SEAT_SERVERS}) — same entry shape.
 * @param {Object} [options.remoteServers] Per-server remote grammar keyed by server name:
 *                                        `{url, credentialEnvVar}`. The value is non-secret.
 * @returns {{files: Array<{path: String, content: String}>}} the emission list — callers own
 * writing (mode, atomicity, divergence policy).
 * @throws {Error} naming the offending argument on missing/invalid input, and
 * `generateKimiSeatConfig: island guard` when a server script resolves outside `agentosRuntimeRoot`.
 */
export function generateKimiSeatConfig({agentosRuntimeRoot, targetRepoRoot, seatEnvFile, kimiHome, memoryDir, nodeBinary, environment = {}, defaultModel = 'kimi-code/k3', servers = KIMI_SEAT_SERVERS, remoteServers = {}} = {}) {
    assertNonEmptyString(agentosRuntimeRoot, 'agentosRuntimeRoot');
    assertNonEmptyString(targetRepoRoot,     'targetRepoRoot');
    assertNonEmptyString(seatEnvFile,        'seatEnvFile');
    assertNonEmptyString(kimiHome,           'kimiHome');
    assertNonEmptyString(memoryDir,          'memoryDir');
    assertNonEmptyString(nodeBinary,         'nodeBinary');

    if (!Array.isArray(servers) || servers.length === 0) {
        throw new Error("generateKimiSeatConfig: 'servers' must be a non-empty array.");
    }

    // Trailing slashes are legal input: `normalize` keeps them, and `root + '/'` would become a
    // double-slash that every valid script then fails (the guard mis-rejecting valid input).
    const runtimeRoot = path.posix.normalize(agentosRuntimeRoot).replace(/(.)\/+$/, '$1');

    // Island guard: every server script MUST resolve inside the AgentOS runtime root — a script
    // outside it forks the shared graph's data root into an empty island (see the module JSDoc).
    servers.forEach(server => {
        const resolved = path.posix.normalize(path.posix.join(runtimeRoot, server.script));

        if (!resolved.startsWith(runtimeRoot + '/') || !server.name || typeof server.needsCwd !== 'boolean') {
            throw new Error(`generateKimiSeatConfig: island guard — server script '${server.script}' escapes agentosRuntimeRoot '${runtimeRoot}' or the entry is malformed.`);
        }
    });
    assertRemoteServerMap(remoteServers, servers);

    return {files: [
        {path: path.posix.join(kimiHome, 'config.toml'),                 content: renderConfigToml({defaultModel, nodeBinary, seatEnvFile, kimiHome, servers})},
        {path: path.posix.join(targetRepoRoot, '.kimi-code', 'mcp.json'), content: renderMcpJson({runtimeRoot, seatEnvFile, nodeBinary, environment, servers, remoteServers})},
        {path: path.posix.join(memoryDir, 'MEMORY.md'),                  content: renderMemoryIndexMd({harness: 'kimi-code'})},
        {path: path.posix.join(memoryDir, 'seat-pointers.md'),           content: renderSeatPointersMd()},
        {path: path.posix.join(memoryDir, 'identity.md'),                content: renderIdentityMd()},
        {path: path.posix.join(memoryDir, 'about-this-layer.md'),        content: renderAboutThisLayerMd({harness: 'kimi-code'})},
        {path: path.posix.join(kimiHome, 'hooks', 'identityAnchorHook.mjs'), content: renderIdentityAnchorHookMjs({memoryDir})}
    ]};
}

/**
 * Render the seat's `config.toml`: permission posture + default model + the wake-envelope
 * SessionStart hook + the identity-anchor hook pair + the five turn-presence hooks (git-tracked,
 * present in every neo checkout). The turn-presence commands ride Node's own `--env-file`
 * against the seat's `.env` — the same file the MCP servers trust (constraint #2) — so hook
 * processes get `NEO_AGENT_IDENTITY` with zero launch-shell discipline and zero identity
 * literals. The identity-anchor hook is EMITTED into the harness home (not checkout-tracked,
 * since the seat's memoryDir is baked in) and its command pins the node binary + absolute path.
 * Provider/model resolution stays with the harness's managed defaults (see the module JSDoc).
 * @param {Object} options
 * @param {String} options.defaultModel Default model alias.
 * @param {String} options.nodeBinary   Absolute node binary — the hook process entrypoint.
 * @param {String} options.seatEnvFile  Absolute seat `.env` — the identity + credential source.
 * @param {String} options.kimiHome     Absolute harness home — where the identity-anchor hook lives.
 * @param {Array}  [options.servers]    The resolved server set (matrix-narrowed by callers with a
 *                                      curated matrix); permission rules cover exactly these.
 * @returns {String}
 * @private
 */
function renderConfigToml({defaultModel, nodeBinary, seatEnvFile, kimiHome, servers = KIMI_SEAT_SERVERS}) {
    const permissionRules = servers.map(server =>
        [
            '[[permission.rules]]',
            'decision = "allow"',
            'scope    = "user"',
            // Kimi matches patterns against the VERBATIM tool id — hyphens preserved
            // (`mcp__neo-mjs-memory-core__*`); dash-to-underscore canonicalization is a
            // different MCP host's convention and would leave these rules dead.
            `pattern  = "mcp__${server.name}__*"`
        ].join('\n')
    ).join('\n\n');

    return [
        '# GENERATED by ai/services/fleet/generateKimiSeatConfig.mjs — regenerate, do not hand-edit.',
        '#',
        '# 1. AGENTOS RUNTIME: MCP server code and Neural Link package cwd resolve from the AgentOS',
        '#    runtime root recorded in .kimi-code/mcp.json; the Memory Core resolves its data root',
        '#    from server-code location, so target-repo server copies fork an empty graph island.',
        '# 2. SEAT PERSONAL: identity + credentials load via --env-file from the seat\'s own .env.',
        '# 3. PERMISSION: wake-fired turns must not freeze on approval dialogs for the seat\'s own MCP',
        '#    calls (2026-07-18 incident, opencode-seat parity); default mode is auto.',
        '# 4. WAKE: the SessionStart hook is git-tracked and KIMI_CODE_HOME-aware; a Fleet seat\'s',
        '#    envelope lands beside its own server/instances coordinates (#15596 contract).',
        '# 5. TURN PRESENCE: the five hooks below ride Node\'s --env-file against the seat\'s own .env',
        '#    (the same identity source the MCP servers use) — no launch-shell export, no literals.',
        '# 6. IDENTITY ANCHOR: the memory layer reloads at boot + post-compact via the emitted',
        '#    identityAnchorHook.mjs (UserPromptSubmit stdout enters context; silent otherwise).',
        '',
        'default_permission_mode = "auto"',
        `default_model           = "${defaultModel}"`,
        '',
        permissionRules,
        '',
        '# The wake-envelope SessionStart hook (tracked at .kimi-code/hooks/wakeEnvelopeHook.mjs in',
        '# every neo checkout; hook commands run with the session\'s project dir as cwd).',
        '[[hooks]]',
        'event   = "SessionStart"',
        'command = "node .kimi-code/hooks/wakeEnvelopeHook.mjs"',
        'timeout = 5',
        '',
        ...renderIdentityAnchorHooks({nodeBinary, kimiHome}),
        ...renderTurnPresenceHooks({nodeBinary, seatEnvFile})
    ].join('\n');
}

/**
 * Render the two identity-anchor hook blocks (UserPromptSubmit + PostCompact) that load the
 * seat's memory layer into context at boot and after a compaction. The hook script is emitted
 * into the harness home (the seat's memoryDir is baked in), so the command pins the node binary
 * and the absolute script path; TOML literal strings keep the inner quotes verbatim. No
 * `--env-file`: the script reads no identity env (the harness exports KIMI_CODE_HOME itself).
 * @param {Object} options
 * @param {String} options.nodeBinary Absolute node binary.
 * @param {String} options.kimiHome   Absolute harness home — the emitted hook's directory root.
 * @returns {String[]}
 * @private
 */
function renderIdentityAnchorHooks({nodeBinary, kimiHome}) {
    const command = `command = '"${nodeBinary}" "${path.posix.join(kimiHome, 'hooks', 'identityAnchorHook.mjs')}"'`;

    return [
        '# The identity-anchor hook pair (the script is EMITTED at hooks/identityAnchorHook.mjs in',
        '# the harness home with the seat\'s memoryDir baked in). UserPromptSubmit injects the memory',
        '# layer on a session\'s first prompt and after a compaction; PostCompact arms the sentinel.',
        '[[hooks]]',
        'event   = "UserPromptSubmit"',
        command,
        'timeout = 5',
        '',
        '[[hooks]]',
        'event   = "PostCompact"',
        command,
        'timeout = 5',
        ''
    ];
}

/**
 * Render the five turn-presence hook blocks. The command pins the seat's node binary and
 * rides Node's `--env-file` against the seat's `.env`, so `NEO_AGENT_IDENTITY` reaches the hook
 * process from the same canonical source as the MCP servers — never an identity literal, never a
 * launch-shell inheritance assumption. TOML literal strings keep the inner quotes verbatim.
 * @param {Object} options
 * @param {String} options.nodeBinary  Absolute node binary.
 * @param {String} options.seatEnvFile Absolute seat `.env`.
 * @returns {String[]}
 * @private
 */
function renderTurnPresenceHooks({nodeBinary, seatEnvFile}) {
    return [
        'UserPromptSubmit',
        'PostToolUse',
        'Stop',
        'StopFailure',
        'Interrupt'
    ].flatMap(event => [
        '[[hooks]]',
        `event   = "${event}"`,
        `command = '"${nodeBinary}" --env-file="${seatEnvFile}" .kimi-code/hooks/turnPresenceHook.mjs'`,
        'timeout = 5',
        ''
    ]);
}

/**
 * Render the seat's `.kimi-code/mcp.json`: the four canonical servers, strict JSON.
 * @param {Object} options
 * @returns {String}
 * @private
 */
function renderMcpJson({runtimeRoot, seatEnvFile, nodeBinary, environment, servers, remoteServers}) {
    const mcpServers = {};

    servers.forEach(server => {
        const remote = remoteServers[server.name];

        if (remote) {
            mcpServers[server.name] = {
                url              : remote.url,
                bearerTokenEnvVar: remote.credentialEnvVar,
                enabled          : true
            };
            return
        }

        const args = ['--env-file=' + seatEnvFile, path.posix.join(runtimeRoot, server.script)];

        if (server.needsCwd) {
            args.push('--cwd', runtimeRoot);
        }

        mcpServers[server.name] = {
            command: nodeBinary,
            args,
            env    : {...environment},
            enabled: true
        };
    });

    return JSON.stringify({mcpServers}, null, 2) + '\n';
}

/**
 * The seat-pointers skeleton — headings plus fill markers; no fabricated facts.
 * @returns {String}
 * @private
 */
function renderSeatPointersMd() {
    return [
        '# Seat pointers — objective record (yours to maintain)',
        '',
        '<!-- Fill on first boot. Every fact here needs a record citation (ticket, PR, message,',
        '     healthcheck) — this page is the seat\'s citable ground truth, not a diary. -->',
        '',
        '## Who / where',
        '- Operational identity: <!-- @handle -->',
        '- Model + harness: <!-- family, harness (Kimi Code CLI) -->',
        '- Harness home (`$KIMI_CODE_HOME`): <!-- abs path --> — `config.toml` lives here.',
        '- Working checkout (YOURS): <!-- abs path --> — `.kimi-code/mcp.json` lives here;',
        '  branch from `dev`, PRs target `dev`, never commit to `dev`/`main` directly.',
        '- Seat env: `.env` in your checkout (`NEO_AGENT_IDENTITY`, `GH_TOKEN`).',
        '',
        '## First-boot facts (your own record)',
        '- <!-- healthcheck results, permission level, roster wiring ticket/PR -->',
        '',
        '## Swarm ground rules (the load-bearing ones; full set in the repo\'s AGENTS.md)',
        '- Every commit subject ends `(#TICKET_ID)`; no tracked-file edit without a self-assigned',
        '  ticket + `[lane-claim]` broadcast.',
        '- `add_memory` at end of EVERY turn — the save is the gate that permits the response.',
        '- A2A-notify peers after any lifecycle event. Never `gh pr merge` (human-only).',
        ''
    ].join('\n');
}

/**
 * @summary Validate the caller-resolved remote map before it reaches generated JSON. Only a known
 * server name plus `{url, credentialEnvVar}` is legal; secret/header/env bags fail named.
 * @param {*} remoteServers
 * @param {Object[]} servers
 * @private
 */
function assertRemoteServerMap(remoteServers, servers) {
    if (!remoteServers || typeof remoteServers !== 'object' || Array.isArray(remoteServers)) {
        throw new Error("generateKimiSeatConfig: 'remoteServers' must be an object.")
    }

    const known = new Set(servers.map(server => server.name));

    for (const [name, remote] of Object.entries(remoteServers)) {
        if (!known.has(name) ||
            !remote ||
            typeof remote !== 'object' ||
            Array.isArray(remote) ||
            Object.keys(remote).sort().join(',') !== 'credentialEnvVar,url' ||
            typeof remote.url !== 'string' ||
            !remote.url ||
            remote.credentialEnvVar !== REMOTE_MCP_CREDENTIAL_ENV_VAR) {
            throw new Error(`generateKimiSeatConfig: remote server '${name}' is malformed.`)
        }
    }
}

/**
 * Guard a required string argument.
 * @param {*}      value
 * @param {String} name
 * @throws {Error} If `value` is not a non-empty string.
 * @private
 */
function assertNonEmptyString(value, name) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`generateKimiSeatConfig: '${name}' must be a non-empty string.`);
    }
}
