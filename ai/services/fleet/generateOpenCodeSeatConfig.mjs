import path                                                                                     from 'node:path';
import {REMOTE_MCP_CREDENTIAL_ENV_VAR}                                                          from './mcpServers.mjs';
import {MEMORY_LAYER_BOOT_FILES, renderAboutThisLayerMd, renderIdentityMd, renderMemoryIndexMd} from './seatMemoryLayerTemplate.mjs';

/**
 * The canonical MCP server set every OpenCode seat wires, keyed by the seat-config server name.
 * `script` is the POSIX path relative to the AgentOS runtime root. `needsCwd: true` marks
 * Neural Link: its `--cwd` starts the AgentOS package/Bridge from that same runtime authority.
 * Fixed module data, not a configurable default — an unlisted server is a deliberate caller
 * override via `options.servers`, never an accident of omission.
 * @type {ReadonlyArray<{name: String, script: String, needsCwd: Boolean}>}
 */
export const OPENCODE_SEAT_SERVERS = Object.freeze([
    {name: 'neo-mjs-memory-core',    script: 'ai/mcp/server/memory-core/mcp-server.mjs',    needsCwd: false},
    {name: 'neo-mjs-github-workflow', script: 'ai/mcp/server/github-workflow/mcp-server.mjs', needsCwd: false},
    {name: 'neo-mjs-knowledge-base', script: 'ai/mcp/server/knowledge-base/mcp-server.mjs', needsCwd: false},
    {name: 'neo-mjs-neural-link',    script: 'ai/mcp/server/neural-link/mcp-server.mjs',    needsCwd: true}
]);

/**
 * Generate every config/scaffold file an OpenCode seat boots from, as a PURE params→files
 * emission (the AiConfig SSOT purity discipline: no config imports, no env reads, no fs access,
 * no hidden defaults — callers resolve every path). The launch path (`prepareManagedAgentWorkspace`)
 * writes the returned files; this module only decides their content.
 *
 * The three load-bearing seat constraints this productizes (verified live on the first OpenCode
 * seat, `@neo-kimi-phoebe`, 2026-07-18):
 *
 * 1. **AgentOS runtime authority.** MCP server CODE must run from the AgentOS runtime root: the Memory
 *    Core resolves its DATA ROOT from the server code's own file location
 *    (`ai/mcp/server/memory-core/configBase.mjs:21-28` — `import.meta.url` → `neoRootDir` →
 *    `.neo-ai-data/*`). Server code under a per-seat checkout silently forks an empty graph
 *    island whose writes never merge back. The island guard below therefore REJECTS any server
 *    script path that resolves outside `agentosRuntimeRoot`.
 * 2. **Seat personal.** Identity + credentials load via `--env-file` from the seat's OWN `.env`
 *    (`NEO_AGENT_IDENTITY`, `GH_TOKEN`, provider keys). Node's `--env-file` never overwrites
 *    already-set vars, so explicit `environment` entries win where a caller needs them to.
 *
 *    **`XDG_DATA_HOME` is the seat-separation seam — not the OpenCode project list.** Provisioning a
 *    second seat on one machine means giving it its own data home, because that is what separates the
 *    wake envelope (`<XDG_DATA_HOME>/opencode/wake-envelope.json`), the session database and the
 *    project registry. Two seats under one `HOME` share all three no matter how many projects the
 *    desktop app displays — adding a project to an existing instance looks like separation and is
 *    not. The hook below additionally stamps the envelope's writer so the wake reader can refuse
 *    another seat's, but that check is a backstop for a shared data home, never a licence to run one.
 * 3. **The memory layer is the always-loaded slot — Grace-pattern.** OpenCode has no
 *    persistent auto-memory layer, so `instructions` carries the boot files (`MEMORY.md` +
 *    `identity.md`) into EVERY session. Detail files deliberately stay OUT of the array — each
 *    entry costs context every turn (the first seat measured 27.2KB all-loaded; the capped
 *    hot-index reshape targets ~10KB hot + on-demand detail). `identity.md` emits as a
 *    near-empty template with a story-sovereignty header — nobody authors a bearer's self-story
 *    but the bearer (the naming gate: peer sketch → bearer assent → peer-veto window →
 *    operator confirmation). The layer content is shared with the Kimi generator via
 *    `seatMemoryLayerTemplate.mjs` — same index, same docs, different load mechanism.
 *
 * Additional generated blocks, folded in from the first seat's operational findings:
 *
 * - **`permission.external_directory`** — a wake-fired turn must never freeze on an approval
 *   dialog for the seat's own files (2026-07-18 incident). The allow-list covers the seat home
 *   (target checkout + memory), the AgentOS runtime root (read access to server code), and any
 *   caller-supplied `extraAllowedPaths`; the catch-all stays `"ask"` (insertion order matters:
 *   the LAST matching rule wins).
 * - **The wake-envelope boot hook** (emitted only when `wakeHookPath` is given) — binding the
 *   envelope writer to the seat BOOT boundary, decoupled from OpenCode's plugin lifecycle: the
 *   desktop's background dependency install can fail (`@opencode-ai/plugin@local` unresolvable),
 *   leaving a planted plugin unloaded and the envelope stale. The supervisor calls the emitted
 *   script once it discovers the bound port; creds ride the seat env
 *   (`OPENCODE_SERVER_USERNAME` / `OPENCODE_SERVER_PASSWORD`, provisioned by
 *   `deriveHarnessLaunchSpec`'s `serverPassword` seam).
 *
 * **JSONC-vs-JSON loader probe (AC record):** OpenCode desktop 1.18.3 (darwin-arm64) loads
 * `opencode.jsonc` with full-line `//` comments and typed values; the first seat's entire
 * session history runs on that shape. The emission therefore keeps comments full-line at the
 * top of the file and the body strict JSON (comment-stripped `JSON.parse` must succeed — the
 * unit spec enforces it).
 *
 * @param {Object} options
 * @param {String} options.agentosRuntimeRoot Absolute AgentOS runtime root — every local MCP
 *                                            entrypoint and Neural Link `--cwd` resolve here.
 * @param {String} options.targetRepoRoot     Absolute target checkout — the `opencode.jsonc`
 *                                            destination and project authority.
 * @param {String} options.seatEnvFile        Absolute path of the seat's own `.env` (identity + keys).
 * @param {String} options.memoryDir      Absolute path of the seat's always-loaded memory dir —
 *                                        the `MEMORY.md` / `seat-pointers.md` / `identity.md` /
 *                                        `about-this-layer.md` scaffold target and the
 *                                        `instructions` entries (boot files only).
 * @param {String} options.nodeBinary     Absolute path of the node binary for server commands.
 * @param {Object} [options.environment]  Extra env merged verbatim into EVERY server's
 *                                        `environment` block (caller-resolved: PATH, HOME,
 *                                        local inference hosts). Default `{}`.
 * @param {String[]} [options.extraAllowedPaths] Additional `external_directory` allow entries.
 *                                        Default `[]`.
 * @param {String} [options.seatHome]   Absolute seat home for the permission allow-list.
 *                                        Default: `memoryDir`'s parent directory — the
 *                                        derivation is documented so the coupling is loud,
 *                                        not latent; pass explicitly for any layout whose
 *                                        memory dir is not directly under the seat home.
 * @param {String} [options.wakeHookPath] When set, also emit the wake-envelope boot hook at this
 *                                        absolute path. Default: no hook file.
 * @param {Array}  [options.servers]      Override the canonical server set
 *                                        ({@link OPENCODE_SEAT_SERVERS}) — same entry shape.
 * @param {Object} [options.remoteServers] Per-server remote grammar keyed by server name:
 *                                        `{url, credentialEnvVar}`. The value is non-secret.
 * @returns {{files: Array<{path: String, content: String}>}} the emission list — callers own
 * writing (mode, atomicity, divergence policy).
 * @throws {Error} naming the offending argument on missing/invalid input, and
 * `generateOpenCodeSeatConfig: island guard` when a server script resolves outside
 * `agentosRuntimeRoot`.
 */
export function generateOpenCodeSeatConfig({agentosRuntimeRoot, targetRepoRoot, seatEnvFile, memoryDir, nodeBinary, environment = {}, extraAllowedPaths = [], wakeHookPath, servers = OPENCODE_SEAT_SERVERS, seatHome, remoteServers = {}} = {}) {
    assertNonEmptyString(agentosRuntimeRoot, 'agentosRuntimeRoot');
    assertNonEmptyString(targetRepoRoot,     'targetRepoRoot');
    assertNonEmptyString(seatEnvFile,        'seatEnvFile');
    assertNonEmptyString(memoryDir,          'memoryDir');
    assertNonEmptyString(nodeBinary,         'nodeBinary');

    if (!Array.isArray(servers) || servers.length === 0) {
        throw new Error("generateOpenCodeSeatConfig: 'servers' must be a non-empty array.");
    }

    // Trailing slashes are legal input: `normalize` keeps them, and `root + '/'` would become
    // a double-slash that every valid script then fails (the guard mis-rejecting valid input).
    const runtimeRoot = path.posix.normalize(agentosRuntimeRoot).replace(/(.)\/+$/, '$1');

    // Island guard: every server script MUST resolve inside the AgentOS runtime root — a script
    // outside it forks the shared graph's data root into an empty island (see the module JSDoc).
    servers.forEach(server => {
        const resolved = path.posix.normalize(path.posix.join(runtimeRoot, server.script));

        if (!resolved.startsWith(runtimeRoot + '/') || !server.name || typeof server.needsCwd !== 'boolean') {
            throw new Error(`generateOpenCodeSeatConfig: island guard — server script '${server.script}' escapes agentosRuntimeRoot '${runtimeRoot}' or the entry is malformed.`);
        }
    });
    assertRemoteServerMap(remoteServers, servers);

    const files = [
        {path: path.posix.join(targetRepoRoot, 'opencode.jsonc'), content: renderOpencodeJsonc({runtimeRoot, targetRepoRoot, seatEnvFile, memoryDir, nodeBinary, environment, extraAllowedPaths, servers, seatHome, remoteServers})},
        {path: path.posix.join(memoryDir, 'MEMORY.md'),             content: renderMemoryIndexMd({harness: 'opencode'})},
        {path: path.posix.join(memoryDir, 'seat-pointers.md'),      content: renderSeatPointersMd()},
        {path: path.posix.join(memoryDir, 'identity.md'),           content: renderIdentityMd()},
        {path: path.posix.join(memoryDir, 'about-this-layer.md'),   content: renderAboutThisLayerMd({harness: 'opencode'})}
    ];

    if (wakeHookPath !== undefined) {
        assertNonEmptyString(wakeHookPath, 'wakeHookPath');
        files.push({path: wakeHookPath, content: renderWakeHook()});
    }

    return {files};
}

/**
 * Render the seat's `opencode.jsonc`: a full-line-comment header carrying the three-layer
 * pattern, then a strict-JSON body (the loader probe is recorded in the module JSDoc).
 * @param {Object} options
 * @returns {String}
 * @private
 */
function renderOpencodeJsonc({runtimeRoot, targetRepoRoot, seatEnvFile, memoryDir, nodeBinary, environment, extraAllowedPaths, servers, seatHome, remoteServers}) {
    const
        header = [
            '  // GENERATED by ai/services/fleet/generateOpenCodeSeatConfig.mjs — regenerate, do not hand-edit.',
            '  //',
            '  // 1. AGENTOS RUNTIME: server code and Neural Link package cwd resolve from the AgentOS',
            '  //    runtime root; target-repo server copies would fork Memory Core into an empty island.',
            '  // 2. SEAT PERSONAL: identity + credentials load via --env-file from the seat\'s own .env.',
            '  // 3. MEMORY: the instructions files are the always-loaded identity layer; the Memory Core is',
            '  //    the on-demand deep archive. add_memory at end of every turn feeds it.',
            '  // 4. PERMISSION: wake-fired turns must not freeze on approval dialogs for seat-local paths;',
            '  //    the catch-all stays "ask" (the LAST matching external_directory rule wins).',
            '  // 5. NEURAL LINK: the bridge claims its port lazily at `manage_connection start`; parallel',
            '  //    server processes coexist, and contention is a visible EADDRINUSE, not corruption.'
        ].join('\n'),
        mcp = {};

    servers.forEach(server => {
        const remote = remoteServers[server.name];

        if (remote) {
            mcp[server.name] = {
                type   : 'remote',
                url    : remote.url,
                enabled: true,
                headers: {Authorization: `Bearer {env:${remote.credentialEnvVar}}`},
                oauth  : false
            };
            return
        }

        const
            command = [nodeBinary, '--env-file=' + seatEnvFile, path.posix.join(runtimeRoot, server.script)],
            entry   = {
                type       : 'local',
                command    : server.needsCwd ? [...command, '--cwd', runtimeRoot] : command,
                enabled    : true,
                environment: {...environment}
            };

        mcp[server.name] = entry;
    });

    const
        // The seat home: explicit `seatHome` when given, else `memoryDir`'s parent — the
        // documented default derivation (the coupling is loud here, not latent).
        seatHomePath = seatHome ?? path.posix.dirname(path.posix.normalize(memoryDir)),
        allowedPaths = [seatHomePath + '/**', targetRepoRoot + '/**', runtimeRoot + '/**', ...extraAllowedPaths],
        externalDirectory = {'*': 'ask'};

    allowedPaths.forEach(allowedPath => {
        externalDirectory[allowedPath] = 'allow';
    });

    const config = {
        $schema   : 'https://opencode.ai/config.json',
        permission: {external_directory: externalDirectory},
        // The always-loaded slot carries the boot files ONLY — detail files load on demand by
        // path (every instructions entry costs context every turn; see the module JSDoc).
        instructions: MEMORY_LAYER_BOOT_FILES.map(file => path.posix.join(memoryDir, file)),
        mcp
    };

    return '{\n' + header + '\n' + JSON.stringify(config, null, 2).slice(2);
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
        '- Model + harness: <!-- family, harness -->',
        '- Working checkout (YOURS): <!-- abs path --> — branch from `dev`, PRs target `dev`,',
        '  never commit to `dev`/`main` directly.',
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
 * The wake-envelope boot hook — a STANDALONE node script (no Neo imports, C1-clean) the seat's
 * boot boundary runs once the bound port is known. Writes the daemon-consumed envelope
 * atomically, mode 0600. Credentials come ONLY from the process env.
 * @returns {String}
 * @private
 */
function renderWakeHook() {
    return [
        '#!/usr/bin/env node',
        '/**',
        ' * GENERATED by ai/services/fleet/generateOpenCodeSeatConfig.mjs — the wake-envelope boot hook.',
        ' *',
        ' * Usage: node write-wake-envelope.mjs --data-home <xdgDataHome> --port <port> --session-id <ses_…>',
        ' *          --project-id <id> --directory <seatCheckout>',
        ' *',
        ' * Writes <data-home>/opencode/wake-envelope.json (atomic tmp+rename, chmod 0600) — the contract',
        ' * consumed by the wake daemon\'s opencode-server route (ai/daemons/wake/daemon.mjs). Credentials',
        ' * are read from OPENCODE_SERVER_USERNAME / OPENCODE_SERVER_PASSWORD in the process env and never',
        ' * accepted as flags, so the secret never touches argv (ps-visible).',
        ' *',
        ' * `agentIdentity` is stamped from NEO_AGENT_IDENTITY for the same reason the reader checks it:',
        ' * the envelope path is per-seat only while each seat has its own XDG_DATA_HOME, and two seats',
        ' * sharing one HOME collapse onto a single file. Naming the owner lets the reader refuse an',
        ' * envelope that is not its own instead of delivering a wake into another seat\'s session. It is',
        ' * read from the env rather than argv because the seat .env already carries it — no new flag, no',
        ' * new config, and it cannot disagree with the identity the seat actually boots as.',
        ' */',
        "import fs   from 'node:fs/promises';",
        "import path from 'node:path';",
        '',
        'const args = Object.fromEntries(process.argv.slice(2)',
        "    .map((value, index, argv) => value.startsWith('--') ? [value.slice(2), argv[index + 1]] : null)",
        '    .filter(Boolean));',
        '',
        "for (const key of ['data-home', 'port', 'session-id', 'project-id', 'directory']) {",
        "    if (!args[key]) throw new Error(`write-wake-envelope: missing '--${key}'`);",
        '}',
        '',
        'const {',
        '    NEO_AGENT_IDENTITY      : seatIdentity,',
        '    OPENCODE_SERVER_USERNAME: username,',
        '    OPENCODE_SERVER_PASSWORD: password',
        '} = process.env;',
        '',
        "if (!username || !password) throw new Error('write-wake-envelope: OPENCODE_SERVER_USERNAME/PASSWORD must be set in the environment');",
        "if (!seatIdentity) throw new Error('write-wake-envelope: NEO_AGENT_IDENTITY must be set in the environment');",
        '',
        '// The registry and every wake subscription spell an identity `@handle`; a seat .env may carry it',
        "// bare. Normalising HERE keeps one spelling on the wire, so the reader can compare exactly rather",
        '// than tolerantly — a tolerant comparison is how two identities start looking like one.',
        "const agentIdentity = seatIdentity.startsWith('@') ? seatIdentity : `@${seatIdentity}`;",
        '',
        'const',
        "    envelopePath = path.join(args['data-home'], 'opencode', 'wake-envelope.json'),",
        '    envelope     = {',
        '        agentIdentity,',
        "        hostname : '127.0.0.1',",
        "        port     : Number(args.port),",
        "        sessionId: args['session-id'],",
        "        projectId: args['project-id'],",
        "        directory: args.directory,",
        '        username,',
        '        password,',
        '        updatedAt: new Date().toISOString()',
        '    };',
        '',
        'if (!Number.isInteger(envelope.port) || envelope.port < 1 || envelope.port > 65535) {',
        "    throw new Error(`write-wake-envelope: '--port' must be an integer in 1..65535`);",
        '}',
        '',
        "await fs.mkdir(path.dirname(envelopePath), {recursive: true});",
        '',
        'const tmpPath = `${envelopePath}.${process.pid}.tmp`;',
        '',
        'await fs.writeFile(tmpPath, JSON.stringify(envelope, null, 2) + \'\\n\');',
        'await fs.rename(tmpPath, envelopePath);',
        'await fs.chmod(envelopePath, 0o600);',
        '',
        'console.log(`write-wake-envelope: envelope written for session ${envelope.sessionId} (port ${envelope.port})`);',
        ''
    ].join('\n');
}

/**
 * @summary Validate the caller-resolved remote map before it reaches generated JSONC. Only a known
 * server name plus `{url, credentialEnvVar}` is legal; secret/header/env bags fail named.
 * @param {*} remoteServers
 * @param {Object[]} servers
 * @private
 */
function assertRemoteServerMap(remoteServers, servers) {
    if (!remoteServers || typeof remoteServers !== 'object' || Array.isArray(remoteServers)) {
        throw new Error("generateOpenCodeSeatConfig: 'remoteServers' must be an object.")
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
            throw new Error(`generateOpenCodeSeatConfig: remote server '${name}' is malformed.`)
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
        throw new Error(`generateOpenCodeSeatConfig: '${name}' must be a non-empty string.`);
    }
}
