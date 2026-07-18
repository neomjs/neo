import path from 'node:path';

/**
 * The canonical MCP server set every OpenCode seat wires, keyed by the seat-config server name.
 * `script` is the POSIX path relative to the canonical (organs) checkout. `needsCwd: true` marks
 * the Neural Link: its `--cwd` binds the possession target to the seat's OWN working tree.
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
 * 1. **Organs canonical.** MCP server CODE must run from the canonical checkout: the Memory
 *    Core resolves its DATA ROOT from the server code's own file location
 *    (`ai/mcp/server/memory-core/configBase.mjs:21-28` — `import.meta.url` → `neoRootDir` →
 *    `.neo-ai-data/*`). Server code under a per-seat checkout silently forks an empty graph
 *    island whose writes never merge back. The island guard below therefore REJECTS any server
 *    script path that resolves outside `canonicalRoot`.
 * 2. **Seat personal.** Identity + credentials load via `--env-file` from the seat's OWN `.env`
 *    (`NEO_AGENT_IDENTITY`, `GH_TOKEN`, provider keys). Node's `--env-file` never overwrites
 *    already-set vars, so explicit `environment` entries win where a caller needs them to.
 * 3. **The memory layer is the always-loaded slot.** OpenCode has no persistent auto-memory
 *    layer, so `instructions` carries a small markdown scaffold into EVERY session. `identity.md`
 *    emits as a near-empty template with a story-sovereignty header — nobody authors a bearer's
 *    self-story but the bearer (the naming gate: peer sketch → bearer assent → peer-veto window →
 *    operator confirmation).
 *
 * Additional generated blocks, folded in from the first seat's operational findings:
 *
 * - **`permission.external_directory`** — a wake-fired turn must never freeze on an approval
 *   dialog for the seat's own files (2026-07-18 incident). The allow-list covers the seat home
 *   (workspace + memory), the canonical checkout (read access to server code), and any
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
 * @param {String} options.canonicalRoot  Absolute path of the CANONICAL neo checkout (organs).
 * @param {String} options.seatEnvFile    Absolute path of the seat's own `.env` (identity + keys).
 * @param {String} options.workspaceRoot  Absolute path of the seat's working checkout — the
 *                                        `opencode.jsonc` target and the Neural Link `--cwd`.
 * @param {String} options.memoryDir      Absolute path of the seat's always-loaded memory dir —
 *                                        the `MEMORY.md` / `seat-pointers.md` / `identity.md`
 *                                        scaffold target and the `instructions` entries.
 * @param {String} options.nodeBinary     Absolute path of the node binary for server commands.
 * @param {Object} [options.environment]  Extra env merged verbatim into EVERY server's
 *                                        `environment` block (caller-resolved: PATH, HOME,
 *                                        local inference hosts). Default `{}`.
 * @param {String[]} [options.extraAllowedPaths] Additional `external_directory` allow entries.
 *                                        Default `[]`.
 * @param {String} [options.wakeHookPath] When set, also emit the wake-envelope boot hook at this
 *                                        absolute path. Default: no hook file.
 * @param {Array}  [options.servers]      Override the canonical server set
 *                                        ({@link OPENCODE_SEAT_SERVERS}) — same entry shape.
 * @returns {{files: Array<{path: String, content: String}>}} the emission list — callers own
 * writing (mode, atomicity, divergence policy).
 * @throws {Error} naming the offending argument on missing/invalid input, and
 * `generateOpenCodeSeatConfig: island guard` when a server script resolves outside
 * `canonicalRoot`.
 */
export function generateOpenCodeSeatConfig({canonicalRoot, seatEnvFile, workspaceRoot, memoryDir, nodeBinary, environment = {}, extraAllowedPaths = [], wakeHookPath, servers = OPENCODE_SEAT_SERVERS} = {}) {
    assertNonEmptyString(canonicalRoot, 'canonicalRoot');
    assertNonEmptyString(seatEnvFile,   'seatEnvFile');
    assertNonEmptyString(workspaceRoot, 'workspaceRoot');
    assertNonEmptyString(memoryDir,     'memoryDir');
    assertNonEmptyString(nodeBinary,    'nodeBinary');

    if (!Array.isArray(servers) || servers.length === 0) {
        throw new Error("generateOpenCodeSeatConfig: 'servers' must be a non-empty array.");
    }

    const root = path.posix.normalize(canonicalRoot);

    // Island guard: every server script MUST resolve inside the canonical checkout — a script
    // outside it forks the shared graph's data root into an empty island (see the module JSDoc).
    servers.forEach(server => {
        const resolved = path.posix.normalize(path.posix.join(root, server.script));

        if (!resolved.startsWith(root + '/') || !server.name || typeof server.needsCwd !== 'boolean') {
            throw new Error(`generateOpenCodeSeatConfig: island guard — server script '${server.script}' escapes canonicalRoot '${root}' or the entry is malformed.`);
        }
    });

    const files = [
        {path: path.posix.join(workspaceRoot, 'opencode.jsonc'),    content: renderOpencodeJsonc({root, seatEnvFile, workspaceRoot, memoryDir, nodeBinary, environment, extraAllowedPaths, servers})},
        {path: path.posix.join(memoryDir, 'MEMORY.md'),             content: renderMemoryMd()},
        {path: path.posix.join(memoryDir, 'seat-pointers.md'),      content: renderSeatPointersMd()},
        {path: path.posix.join(memoryDir, 'identity.md'),           content: renderIdentityMd()}
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
function renderOpencodeJsonc({root, seatEnvFile, workspaceRoot, memoryDir, nodeBinary, environment, extraAllowedPaths, servers}) {
    const
        header = [
            '  // GENERATED by ai/services/fleet/generateOpenCodeSeatConfig.mjs — regenerate, do not hand-edit.',
            '  //',
            '  // 1. ORGANS CANONICAL: server code runs from the canonical checkout; the Memory Core resolves',
            '  //    its data root from the server code location, so per-seat server copies fork an empty island.',
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
        const
            command = [nodeBinary, '--env-file=' + seatEnvFile, path.posix.join(root, server.script)],
            entry   = {
                type       : 'local',
                command    : server.needsCwd ? [...command, '--cwd', workspaceRoot] : command,
                enabled    : true,
                environment: {...environment}
            };

        mcp[server.name] = entry;
    });

    const
        // The seat home is memoryDir's parent (it holds the memory layer + any seat-local files);
        // workspaceRoot (the checkout) and the canonical checkout are allowed separately.
        allowedPaths = [path.posix.dirname(path.posix.normalize(memoryDir)) + '/**', workspaceRoot + '/**', root + '/**', ...extraAllowedPaths],
        externalDirectory = {'*': 'ask'};

    allowedPaths.forEach(allowedPath => {
        externalDirectory[allowedPath] = 'allow';
    });

    const config = {
        $schema     : 'https://opencode.ai/config.json',
        permission  : {external_directory: externalDirectory},
        instructions: [
            path.posix.join(memoryDir, 'MEMORY.md'),
            path.posix.join(memoryDir, 'seat-pointers.md'),
            path.posix.join(memoryDir, 'identity.md')
        ],
        mcp
    };

    return '{\n' + header + '\n' + JSON.stringify(config, null, 2).slice(2);
}

/**
 * The memory-layer explainer — what this directory is and the discipline that keeps it cheap.
 * @returns {String}
 * @private
 */
function renderMemoryMd() {
    return [
        '# Persistent memory — the always-loaded layer',
        '',
        '**What this is:** OpenCode has no auto-memory layer. This directory is the substitute:',
        'wired into `opencode.jsonc` → `instructions`, so it loads into EVERY session\'s context.',
        'The Memory Core is the deep archive (query it on demand); this layer is what survives a',
        'context wipe without needing a query. Identity lives HERE.',
        '',
        '**How to use it:**',
        '- `identity.md` — the bearer\'s self-story. Nobody writes it but the bearer.',
        '- `seat-pointers.md` — objective, record-citable facts about this seat.',
        '- Add new files only for durable facts worth every-session loading; keep them SMALL',
        '  (this layer costs context every turn). Anything bigger goes to the Memory Core',
        '  (`add_memory` at end of every turn — the swarm\'s end-of-turn gate) with a one-line',
        '  pointer here.',
        '- Identity-claim discipline: identity facts about ANY named agent carry that bearer\'s',
        '  record citation. Introspection is not citation.',
        ''
    ].join('\n');
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
 * The identity template — story-sovereignty by construction: the bearer authors their own
 * self-story at their naming gate; the generator emits headings and the rule, never a story.
 * @returns {String}
 * @private
 */
function renderIdentityMd() {
    return [
        '# Identity — unwritten',
        '',
        'This page is intentionally near-empty. It is the bearer\'s self-story, and **nobody',
        'writes it but the bearer** — not the generator, not the operator, not a peer. The',
        'naming gate (peer sketch → bearer assent → peer-veto window → operator confirmation)',
        'is where a name becomes a self.',
        '',
        'Until then: the operational identity is the GitHub handle; this page stays a promise.',
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
        'const {OPENCODE_SERVER_USERNAME: username, OPENCODE_SERVER_PASSWORD: password} = process.env;',
        '',
        "if (!username || !password) throw new Error('write-wake-envelope: OPENCODE_SERVER_USERNAME/PASSWORD must be set in the environment');",
        '',
        'const',
        "    envelopePath = path.join(args['data-home'], 'opencode', 'wake-envelope.json'),",
        '    envelope     = {',
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
