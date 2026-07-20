import path from 'node:path';

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
 * 1. **Organs canonical.** MCP server CODE runs from the canonical checkout (the Memory Core
 *    resolves its data root from the server code's own file location — a per-seat copy forks an
 *    empty graph island). The island guard REJECTS any server script resolving outside
 *    `canonicalRoot`, sibling parity.
 * 2. **Seat personal.** Identity + credentials load via `--env-file` from the seat's OWN `.env`
 *    (`NEO_AGENT_IDENTITY`, `GH_TOKEN`, provider keys), wired per-server in `mcp.json`.
 * 3. **The memory layer is a boot RITUAL here, not a config slot.** Kimi Code auto-loads the
 *    PROJECT `AGENTS.md` and ships no per-seat `instructions` slot (verified 2026-07-20 against
 *    the live harness v0.28.0 + the official hooks/config docs: `SessionStart` is an
 *    observation-only event whose stdout never enters context, so hook-injection is not a
 *    reliable surface either). The honest wiring is therefore the MEMORY.md boot checklist
 *    below: read the layer before the first public artifact of every session — persistence
 *    without reload is a no-op (the day-two lesson, kept inside the substrate that teaches it).
 *    If the harness later ships an instructions/memory config, this decision re-opens.
 *
 * **Wake-addressable by construction (the wake-adapter coordinate contracts):** the emitted `config.toml`
 * wires the git-tracked SessionStart hook `.kimi-code/hooks/wakeEnvelopeHook.mjs` (present in
 * every neo checkout), which is `KIMI_CODE_HOME`-aware: a Fleet-launched seat writes its
 * envelope beside its own `server/instances/{server_id}.json` coordinates — exactly what the
 * wake daemon's kimi-server route discovers. No seat-side writers beyond the tracked hook.
 *
 * **Two roots, by harness design:** `config.toml` lives in the harness home (`kimiHome` —
 * `$KIMI_CODE_HOME`), while the MCP wiring lives in the seat checkout (`.kimi-code/mcp.json` is
 * a project-level file, untracked per seat). The generator takes both roots explicitly; the
 * coupling is loud, not latent.
 *
 * **Emission shape:** `mcp.json` is strict JSON (comment-stripped `JSON.parse` must succeed —
 * the unit spec enforces it). `config.toml` carries only what the harness needs beyond its
 * managed defaults: the managed `kimi-code` provider/model resolution stays harness-owned
 * (interactive provisioning writes provider details on first login; fleet auth rides the seat
 * env per the launch contract's `env-key` mode).
 *
 * @param {Object} options
 * @param {String} options.canonicalRoot  Absolute path of the CANONICAL neo checkout (organs).
 * @param {String} options.seatEnvFile    Absolute path of the seat's own `.env` (identity + keys).
 * @param {String} options.workspaceRoot  Absolute path of the seat's working checkout — the
 *                                        `.kimi-code/mcp.json` target and the Neural Link `--cwd`.
 * @param {String} options.kimiHome       Absolute path of the seat's harness home
 *                                        (`$KIMI_CODE_HOME`) — the `config.toml` target.
 * @param {String} options.memoryDir      Absolute path of the seat's persistent memory dir —
 *                                        the `MEMORY.md` / `seat-pointers.md` / `identity.md`
 *                                        scaffold target.
 * @param {String} options.nodeBinary     Absolute path of the node binary for server commands.
 * @param {Object} [options.environment]  Extra env merged verbatim into EVERY server's `env`
 *                                        block in `mcp.json` (caller-resolved: PATH, HOME,
 *                                        local inference hosts). Default `{}`.
 * @param {String} [options.defaultModel] Default model alias for `config.toml`.
 *                                        Default `'kimi-code/k3'`.
 * @param {Array}  [options.servers]      Override the canonical server set
 *                                        ({@link KIMI_SEAT_SERVERS}) — same entry shape.
 * @returns {{files: Array<{path: String, content: String}>}} the emission list — callers own
 * writing (mode, atomicity, divergence policy).
 * @throws {Error} naming the offending argument on missing/invalid input, and
 * `generateKimiSeatConfig: island guard` when a server script resolves outside `canonicalRoot`.
 */
export function generateKimiSeatConfig({canonicalRoot, seatEnvFile, workspaceRoot, kimiHome, memoryDir, nodeBinary, environment = {}, defaultModel = 'kimi-code/k3', servers = KIMI_SEAT_SERVERS} = {}) {
    assertNonEmptyString(canonicalRoot, 'canonicalRoot');
    assertNonEmptyString(seatEnvFile,   'seatEnvFile');
    assertNonEmptyString(workspaceRoot, 'workspaceRoot');
    assertNonEmptyString(kimiHome,      'kimiHome');
    assertNonEmptyString(memoryDir,     'memoryDir');
    assertNonEmptyString(nodeBinary,    'nodeBinary');

    if (!Array.isArray(servers) || servers.length === 0) {
        throw new Error("generateKimiSeatConfig: 'servers' must be a non-empty array.");
    }

    // Trailing slashes are legal input: `normalize` keeps them, and `root + '/'` would become a
    // double-slash that every valid script then fails (the guard mis-rejecting valid input).
    const root = path.posix.normalize(canonicalRoot).replace(/(.)\/+$/, '$1');

    // Island guard: every server script MUST resolve inside the canonical checkout — a script
    // outside it forks the shared graph's data root into an empty island (see the module JSDoc).
    servers.forEach(server => {
        const resolved = path.posix.normalize(path.posix.join(root, server.script));

        if (!resolved.startsWith(root + '/') || !server.name || typeof server.needsCwd !== 'boolean') {
            throw new Error(`generateKimiSeatConfig: island guard — server script '${server.script}' escapes canonicalRoot '${root}' or the entry is malformed.`);
        }
    });

    return {files: [
        {path: path.posix.join(kimiHome, 'config.toml'),                 content: renderConfigToml({defaultModel})},
        {path: path.posix.join(workspaceRoot, '.kimi-code', 'mcp.json'), content: renderMcpJson({root, seatEnvFile, workspaceRoot, nodeBinary, environment, servers})},
        {path: path.posix.join(memoryDir, 'MEMORY.md'),                  content: renderMemoryMd()},
        {path: path.posix.join(memoryDir, 'seat-pointers.md'),           content: renderSeatPointersMd()},
        {path: path.posix.join(memoryDir, 'identity.md'),                content: renderIdentityMd()}
    ]};
}

/**
 * Render the seat's `config.toml`: permission posture + default model + the wake-envelope
 * SessionStart hook (git-tracked, present in every neo checkout). Provider/model resolution
 * stays with the harness's managed defaults (see the module JSDoc).
 * @param {Object} options
 * @returns {String}
 * @private
 */
function renderConfigToml({defaultModel}) {
    const permissionRules = KIMI_SEAT_SERVERS.map(server =>
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
        '# 1. ORGANS CANONICAL: MCP server code runs from the canonical checkout (.kimi-code/mcp.json);',
        '#    the Memory Core resolves its data root from the server code location, so per-seat server',
        '#    copies fork an empty graph island.',
        '# 2. SEAT PERSONAL: identity + credentials load via --env-file from the seat\'s own .env.',
        '# 3. PERMISSION: wake-fired turns must not freeze on approval dialogs for the seat\'s own MCP',
        '#    calls (2026-07-18 incident, opencode-seat parity); default mode is auto.',
        '# 4. WAKE: the SessionStart hook is git-tracked and KIMI_CODE_HOME-aware; a Fleet seat\'s',
        '#    envelope lands beside its own server/instances coordinates (#15596 contract).',
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
        ''
    ].join('\n');
}

/**
 * Render the seat's `.kimi-code/mcp.json`: the four canonical servers, strict JSON.
 * @param {Object} options
 * @returns {String}
 * @private
 */
function renderMcpJson({root, seatEnvFile, workspaceRoot, nodeBinary, environment, servers}) {
    const mcpServers = {};

    servers.forEach(server => {
        const args = ['--env-file=' + seatEnvFile, path.posix.join(root, server.script)];

        if (server.needsCwd) {
            args.push('--cwd', workspaceRoot);
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
 * The memory-layer explainer — including the harness reality: Kimi Code has no per-seat
 * instructions slot, so the layer loads via a boot RITUAL, not a config slot (see the module
 * JSDoc for the evidence trail).
 * @returns {String}
 * @private
 */
function renderMemoryMd() {
    return [
        '# Persistent memory — the always-loaded layer',
        '',
        '**What this is:** Kimi Code auto-loads the PROJECT `AGENTS.md` and ships no per-seat',
        '`instructions` slot (verified 2026-07-20: live harness v0.28.0 + official hooks/config',
        'docs; `SessionStart` is observation-only, so hook-injection is not a reliable surface',
        'either). This directory is the seat\'s persistent layer — identity lives HERE. The',
        'Memory Core is the deep archive (query it on demand via the MCP tools).',
        '',
        '**Boot checklist (persistence without reload is a no-op — the day-two lesson):**',
        '1. At every session boot, read `identity.md` + `field-notes.md` (if present) BEFORE the',
        '   first public artifact (A2A, comment, PR body).',
        '2. `add_memory` at the end of EVERY turn — the save is the gate that permits the response.',
        '',
        '**How to use it:**',
        '- `identity.md` — the bearer\'s self-story. Nobody writes it but the bearer.',
        '- `seat-pointers.md` — objective, record-citable facts about this seat.',
        '- Add new files only for durable facts worth every-session loading; keep them SMALL',
        '  (this layer costs attention every session). Anything bigger goes to the Memory Core',
        '  with a one-line pointer here.',
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
