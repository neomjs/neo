import {constants as fsConstants}      from 'node:fs';
import fs                              from 'node:fs/promises';
import path                            from 'node:path';
import {fileURLToPath}                 from 'node:url';
import {hydrateCurrentWorktree}        from '../../scripts/migrations/bootstrapWorktree.mjs';
import {MCP_SERVERS, resolveMcpMatrix} from '../../../src/ai/fleet/mcpServers.mjs';
import {deriveAgentInstanceHome}       from './deriveAgentInstanceHome.mjs';
import {LAUNCHABLE_HARNESS_TYPES}      from './deriveHarnessLaunchSpec.mjs';

const
    __filename            = fileURLToPath(import.meta.url),
    __dirname             = path.dirname(__filename),
    DEFAULT_MAIN_CHECKOUT = path.resolve(__dirname, '../../..'),
    NEO_MCP_NAME_PREFIX   = 'neo-mjs-';

/**
 * @summary Convergence states for Fleet-owned workspace artifacts. `DIVERGENT` is emitted on the
 * thrown error's `artifact` field because preparation fails closed instead of returning a launchable
 * result alongside unresolved operator content.
 * @type {Readonly<{CREATED: String, MATCH: String, DIVERGENT: String}>}
 */
export const WORKSPACE_ARTIFACT_STATES = Object.freeze({
    CREATED  : 'CREATED',
    MATCH    : 'MATCH',
    DIVERGENT: 'DIVERGENT'
});

// One executable descriptor per shared catalog key. The catalog remains the durable key/default
// authority; these Node-only leaves add the installed-checkout-relative entrypoint + environment
// transport facts the Body-safe catalog deliberately cannot carry. Import-time lockstep below turns catalog drift into a
// loud failure rather than silently omitting a newly registered server.
const MCP_SERVER_DESCRIPTORS = Object.freeze({
    'memory-core': Object.freeze({
        entrypoint: 'ai/mcp/server/memory-core/mcp-server.mjs',
        runtimeEnv: Object.freeze([
            'NEO_AGENT_IDENTITY',
            'NEO_CHROMA_EMBEDDING_PROVIDER',
            'NEO_CHROMA_UNIFIED',
            'NEO_EMBEDDING_PROVIDER',
            'NEO_MEM_AUTO_START_DATABASE',
            'NEO_MEM_AUTO_START_INFERENCE',
            'NEO_MODEL_PROVIDER',
            'NEO_OPENAI_COMPATIBLE_API_KEY',
            'NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL',
            'NEO_OPENAI_COMPATIBLE_HOST',
            'NEO_OPENAI_COMPATIBLE_MODEL'
        ]),
        requiredRuntimeEnv: Object.freeze(['NEO_AGENT_IDENTITY'])
    }),
    'knowledge-base': Object.freeze({
        entrypoint: 'ai/mcp/server/knowledge-base/mcp-server.mjs',
        runtimeEnv: Object.freeze([
            'NEO_AGENT_IDENTITY',
            'NEO_CHROMA_EMBEDDING_PROVIDER',
            'NEO_CHROMA_UNIFIED',
            'NEO_EMBEDDING_PROVIDER',
            'NEO_KB_ASK_API_KEY',
            'NEO_KB_AUTO_START_DATABASE',
            'NEO_OPENAI_COMPATIBLE_API_KEY',
            'NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL',
            'NEO_OPENAI_COMPATIBLE_HOST',
            'NEO_OPENAI_COMPATIBLE_MODEL'
        ]),
        requiredRuntimeEnv: Object.freeze(['NEO_AGENT_IDENTITY'])
    }),
    'neural-link': Object.freeze({
        entrypoint: 'ai/mcp/server/neural-link/mcp-server.mjs',
        runtimeEnv: Object.freeze([
            'NEO_AGENT_IDENTITY',
            'NEO_FLEET_BRIDGE_TOKEN',
            'NEO_NL_TOOL_PROJECTION_MODE'
        ]),
        requiredRuntimeEnv: Object.freeze([
            'NEO_AGENT_IDENTITY',
            'NEO_NL_TOOL_PROJECTION_MODE'
        ]),
        secretEnv: Object.freeze(['NEO_FLEET_BRIDGE_TOKEN'])
    }),
    'github-workflow': Object.freeze({
        entrypoint        : 'ai/mcp/server/github-workflow/mcp-server.mjs',
        runtimeEnv        : Object.freeze(['GH_TOKEN', 'GITHUB_TOKEN', 'NEO_AGENT_IDENTITY']),
        requiredRuntimeEnv: Object.freeze(['GH_TOKEN', 'NEO_AGENT_IDENTITY']),
        secretEnv         : Object.freeze(['GH_TOKEN'])
    }),
    'gitlab-workflow': Object.freeze({
        entrypoint        : 'ai/mcp/server/gitlab-workflow/mcp-server.mjs',
        runtimeEnv        : Object.freeze(['NEO_AGENT_IDENTITY', 'NEO_GITLAB_HOST', 'NEO_GITLAB_PAT', 'NEO_GITLAB_PROJECT']),
        requiredRuntimeEnv: Object.freeze(['NEO_AGENT_IDENTITY', 'NEO_GITLAB_PAT']),
        secretEnv         : Object.freeze(['NEO_GITLAB_PAT']),
        unsupportedReason : 'FleetLifecycleService has no GitLab credential injection contract'
    })
});

{
    const catalogKeys = new Set(MCP_SERVERS.map(entry => entry.key));

    for (const key of catalogKeys) {
        if (!MCP_SERVER_DESCRIPTORS[key]) {
            throw new Error(`prepareManagedAgentWorkspace: MCP catalog key '${key}' has no executable descriptor.`);
        }
    }
    for (const key of Object.keys(MCP_SERVER_DESCRIPTORS)) {
        if (!catalogKeys.has(key)) {
            throw new Error(`prepareManagedAgentWorkspace: executable descriptor '${key}' is absent from the shared MCP catalog.`);
        }
    }
}

/**
 * @summary Error for a fail-closed workspace preparation result. `code` is stable for callers;
 * `artifact` contains paths, owned-key names, and state only — never file contents or secret values.
 */
export class ManagedWorkspacePreparationError extends Error {
    constructor(message, {code = 'FLEET_WORKSPACE_PREPARATION_FAILED', artifact} = {}) {
        super(message);
        this.name = 'ManagedWorkspacePreparationError';
        this.code = code;
        if (artifact) this.artifact = artifact;
    }
}

/**
 * @summary Hydrate and converge one Fleet-managed checkout plus its isolated harness home before
 * process spawn. This is the missing lifecycle seam between `ensureAgentRepo` and
 * `FleetLifecycleService.start`: no install/build, no operator-dotfile reads, no secret rendering.
 *
 * Executable MCP entrypoints deliberately resolve from the installed `mainCheckout`: fresh managed
 * clones have no dependencies, dependency installation/build is outside this composer, and sharing
 * another checkout's writable `node_modules` would collapse the checkout boundary. The prepared
 * `repoPath` remains the single harness cwd/project truth (and Neural Link's explicit `--cwd`), while
 * its ignored overlays are hydrated for resident workspace tooling. No resident dependency artifact
 * is created or adopted.
 *
 * Product adapters are evidence-gated. Codex uses project TOML plus an isolated home; Claude Code
 * uses an explicit strict MCP JSON with environment-variable references; Claude Desktop uses its
 * exact `CLAUDE_USER_DATA_DIR` profile file but refuses any enabled server whose startup requires a
 * dynamic secret that cannot be represented without writing the secret. Optional secrets remain
 * child-environment capabilities, not persisted config. Antigravity refuses until a contained
 * per-resident MCP authority is proven.
 *
 * @param {Object}   options
 * @param {Object}   options.agent               Fleet registry agent definition.
 * @param {String}   options.repoPath            Absolute provisioned checkout path.
 * @param {String}   options.instanceRoot        Absolute Fleet harness-home root.
 * @param {String}  [options.mainCheckout]       Installed canonical checkout; defaults to this module's repo root.
 * @param {String}  [options.nodePath]           Node executable used for installed MCP entrypoints.
 * @param {Function}[options.hydrateWorkspace]    Import-safe checkout hydration seam.
 * @param {Function}[options.deriveInstanceHome]  Per-agent home derivation seam.
 * @param {Function}[options.resolveMatrix]       Sparse-at-rest MCP resolver seam.
 * @param {Object}  [options.fileSystem]          Promise filesystem seam.
 * @param {Function}[options.log]                 Hydration logger.
 * @returns {Promise<{repoPath: String, instanceHome: String, mcpMatrix: Object, hydration: Object, artifacts: Object[]}>}
 * @throws {ManagedWorkspacePreparationError} for unsupported adapters or divergent owned content.
 */
export async function prepareManagedAgentWorkspace({
    agent,
    repoPath,
    instanceRoot,
    mainCheckout = DEFAULT_MAIN_CHECKOUT,
    nodePath = process.execPath,
    hydrateWorkspace = hydrateCurrentWorktree,
    deriveInstanceHome = deriveAgentInstanceHome,
    resolveMatrix = resolveMcpMatrix,
    fileSystem = fs,
    log = () => {}
} = {}) {
    if (!agent || typeof agent !== 'object') {
        throw new ManagedWorkspacePreparationError("prepareManagedAgentWorkspace: 'agent' is required.");
    }

    assertNonEmptyString(agent.id, 'agent.id');
    assertNonEmptyString(agent.harnessType, 'agent.harnessType');
    assertAbsolutePath(repoPath, 'repoPath');
    assertAbsolutePath(instanceRoot, 'instanceRoot');
    assertAbsolutePath(mainCheckout, 'mainCheckout');
    assertAbsolutePath(nodePath, 'nodePath');

    const
        canonicalRepoPath = path.resolve(repoPath),
        installedRoot     = path.resolve(mainCheckout),
        mcpMatrix         = resolveMatrix(agent.mcpServers),
        plan              = createMcpPlan({mcpMatrix, repoPath: canonicalRepoPath, mainCheckout: installedRoot, nodePath}),
        instanceHome      = deriveInstanceHome({instanceRoot, agentId: agent.id, harnessType: agent.harnessType});

    // Hardest/unsupported adapter gate runs before hydration or artifact writes. A failed product
    // authority proof cannot leave a checkout looking partially resident-ready.
    assertHarnessSupported({agent, plan});
    await assertNoSymlinkSegments({
        rootPath  : path.resolve(instanceRoot),
        targetPath: instanceHome,
        fileSystem,
        label     : 'resident home'
    });

    const hydration = await hydrateWorkspace({
        mainCheckout: installedRoot,
        projectRoot : canonicalRepoPath,
        log
    });

    await assertRealDirectory(canonicalRepoPath, 'repoPath', fileSystem);
    await assertExecutablePlan({plan, nodePath, fileSystem});

    await assertNoSymlinkSegments({
        rootPath  : path.resolve(instanceRoot),
        targetPath: instanceHome,
        fileSystem,
        label     : 'resident home'
    });

    const artifacts = await prepareHarnessArtifacts({
        agent,
        repoPath    : canonicalRepoPath,
        instanceHome,
        mainCheckout: installedRoot,
        plan,
        fileSystem
    });

    return {repoPath: canonicalRepoPath, instanceHome, mcpMatrix, hydration, artifacts};
}

/** @private */
function createMcpPlan({mcpMatrix, repoPath, mainCheckout, nodePath}) {
    return MCP_SERVERS.map(entry => {
        const descriptor = MCP_SERVER_DESCRIPTORS[entry.key];

        return {
            key    : entry.key,
            name   : `${NEO_MCP_NAME_PREFIX}${entry.key}`,
            enabled: mcpMatrix[entry.key] === true,
            command: nodePath,
            args   : [
                path.join(mainCheckout, descriptor.entrypoint),
                ...(entry.key === 'neural-link' ? ['--cwd', repoPath] : [])
            ],
            runtimeEnv        : [...descriptor.runtimeEnv],
            requiredRuntimeEnv: [...descriptor.requiredRuntimeEnv],
            secretEnv         : [...(descriptor.secretEnv || [])],
            unsupportedReason : descriptor.unsupportedReason || null
        };
    });
}

/** @private */
function assertHarnessSupported({agent, plan}) {
    if (agent.metadata?.launch) {
        throw unsupported('raw metadata.launch overrides bypass curated resident-home and MCP preparation');
    }

    if (!LAUNCHABLE_HARNESS_TYPES.includes(agent.harnessType)) {
        throw unsupported(`harness '${agent.harnessType}' has no launch/workspace adapter`);
    }

    const catalogUnsupported = plan.find(server => server.enabled && server.unsupportedReason);
    if (catalogUnsupported) {
        throw unsupported(`MCP server '${catalogUnsupported.key}' is enabled but unsupported: ${catalogUnsupported.unsupportedReason}`);
    }

    if (agent.harnessType === 'antigravity') {
        throw unsupported('Antigravity 2.x exposes no proven contained per-resident MCP configuration root');
    }

    if (agent.harnessType === 'claude-desktop') {
        const secretServer = plan.find(server => server.enabled &&
            server.requiredRuntimeEnv.some(name => server.secretEnv.includes(name)));
        if (secretServer) {
            throw unsupported(`Claude Desktop cannot represent startup-required Fleet secret env for enabled MCP server '${secretServer.key}' without persisting secret bytes`);
        }
    }
}

/** @private */
async function assertRealDirectory(directoryPath, label, fileSystem) {
    const stat = await fileSystem.lstat(directoryPath).catch(() => null);

    if (!stat?.isDirectory() || stat.isSymbolicLink()) {
        throw divergentArtifact(directoryPath, label, 'expected a real resident-owned directory');
    }
}

/** @private */
async function assertExecutablePlan({plan, nodePath, fileSystem}) {
    const nodeStat = await fileSystem.stat(nodePath).catch(() => null);

    if (!nodeStat?.isFile()) {
        throw unsupported(`Node executable is absent or not a file at '${nodePath}'`);
    }

    try {
        await fileSystem.access(nodePath, fsConstants.X_OK);
    } catch {
        throw unsupported(`Node executable is absent or non-executable at '${nodePath}'`);
    }

    for (const server of plan) {
        if (!server.enabled) continue;

        const
            entrypoint = server.args[0],
            entryStat  = await fileSystem.lstat(entrypoint).catch(() => null);

        if (!entryStat?.isFile()) {
            throw unsupported(`enabled MCP server '${server.key}' has no installed file entrypoint at '${entrypoint}'`);
        }

        try {
            await fileSystem.access(entrypoint, fsConstants.R_OK);
        } catch {
            throw unsupported(`enabled MCP server '${server.key}' has no readable installed entrypoint at '${entrypoint}'`);
        }
    }
}

/** @private */
async function assertNoSymlinkSegments({rootPath, targetPath, fileSystem, label}) {
    const relative = path.relative(rootPath, targetPath);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw divergentArtifact(targetPath, label, 'path escapes its trusted root');
    }

    const rootStat = await fileSystem.lstat(rootPath).catch(error => {
        if (error?.code === 'ENOENT') return null;
        throw error;
    });
    if (rootStat && (!rootStat.isDirectory() || rootStat.isSymbolicLink())) {
        throw divergentArtifact(rootPath, label, 'trusted root is not a real directory');
    }

    let current = rootPath;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, segment);
        const stat = await fileSystem.lstat(current).catch(error => {
            if (error?.code === 'ENOENT') return null;
            throw error;
        });
        if (!stat) break;
        if (stat.isSymbolicLink()) {
            throw divergentArtifact(current, label, 'symlinked resident-owned path segment');
        }
    }
}

/** @private */
async function prepareHarnessArtifacts({agent, repoPath, instanceHome, mainCheckout, plan, fileSystem}) {
    switch (agent.harnessType) {
        case 'codex':
        case 'codex-desktop':
            return prepareCodexArtifacts({agent, repoPath, instanceHome, mainCheckout, plan, fileSystem});
        case 'claude-code':
            return [await prepareClaudeJsonArtifact({
                agent,
                filePath      : path.join(instanceHome, 'mcp-config.json'),
                trustedRoot   : instanceHome,
                plan,
                fileSystem,
                interpolateEnv: true
            })];
        case 'claude-desktop':
            return [await prepareClaudeJsonArtifact({
                agent,
                filePath      : path.join(instanceHome, 'claude_desktop_config.json'),
                trustedRoot   : instanceHome,
                plan,
                fileSystem,
                interpolateEnv: false
            })];
        default:
            throw unsupported(`harness '${agent.harnessType}' has no workspace adapter`);
    }
}

/** @private */
async function prepareCodexArtifacts({agent, repoPath, instanceHome, mainCheckout, plan, fileSystem}) {
    const
        templatePath   = path.join(mainCheckout, '.codex', 'config.template.toml'),
        projectPath    = path.join(repoPath, '.codex', 'config.toml'),
        template       = await fileSystem.readFile(templatePath, 'utf8'),
        projectContent = renderCodexProjectConfig(template, plan),
        homeRoot       = agent.harnessType === 'codex-desktop' ? path.join(instanceHome, 'codex-home') : instanceHome,
        homePath       = path.join(homeRoot, 'config.toml'),
        memoriesPath   = path.join(homeRoot, 'memories'),
        artifacts      = [];

    artifacts.push(await convergeTextArtifact({
        filePath       : projectPath,
        desiredContent : projectContent,
        ownedProjection: projectCodexOwnedProjection,
        ownedLabel     : 'mcp_servers.\"neo-mjs-*\"',
        trustedRoot    : repoPath,
        fileSystem
    }));
    artifacts.push(await convergeTextArtifact({
        filePath       : homePath,
        desiredContent : renderCodexHomeConfig(),
        ownedProjection: codexHomeOwnedProjection,
        ownedLabel     : 'cli_auth_credentials_store,mcp_oauth_credentials_store,features.memories',
        trustedRoot    : instanceHome,
        fileSystem
    }));
    artifacts.push(await ensureDirectoryArtifact(memoriesPath, instanceHome, fileSystem));

    return artifacts;
}

/** @private */
async function prepareClaudeJsonArtifact({agent, filePath, trustedRoot, plan, fileSystem, interpolateEnv}) {
    const servers = {};

    for (const server of plan) {
        if (!server.enabled) continue;

        const
            env      = {},
            envNames = interpolateEnv
                ? new Set([...server.requiredRuntimeEnv, ...server.secretEnv])
                : server.requiredRuntimeEnv;

        for (const name of envNames) {
            if (interpolateEnv) {
                env[name] = `\${${name}}`;
            } else if (name === 'NEO_AGENT_IDENTITY') {
                env[name] = agent.id;
            } else if (name === 'NEO_NL_TOOL_PROJECTION_MODE') {
                env[name] = 'harness-embedded';
            } else {
                throw unsupported(`Claude Desktop has no secret-free representation for runtime env '${name}'`);
            }
        }

        servers[server.name] = {command: server.command, args: server.args, env};
    }

    return convergeTextArtifact({
        filePath,
        desiredContent : JSON.stringify({mcpServers: servers}, null, 2) + '\n',
        ownedProjection: claudeJsonOwnedProjection,
        ownedLabel     : 'mcpServers.neo-mjs-*',
        trustedRoot,
        fileSystem
    });
}

/** @private */
function renderCodexProjectConfig(template, plan) {
    const
        base     = stripManagedMcpTables(template).trimEnd(),
        sections = plan.map(renderCodexMcpTable).join('\n\n'),
        marker   = /^\[features\]\s*$/m,
        header   = '# Fleet-managed Neo MCP tables: executable paths come from the installed canonical checkout; cwd/project paths stay bound to this prepared resident checkout; enabled values are the current Brain projection.';

    if (!marker.test(base)) return `${base}\n\n${header}\n${sections}\n`;

    return base.replace(marker, `${header}\n${sections}\n\n[features]`) + '\n';
}

/** @private */
function renderCodexMcpTable(server) {
    return [
        `[mcp_servers.\"${server.name}\"]`,
        `command = ${JSON.stringify(server.command)}`,
        `args = ${JSON.stringify(server.args)}`,
        `env_vars = ${JSON.stringify(server.runtimeEnv)}`,
        'startup_timeout_sec = 30',
        'tool_timeout_sec = 120',
        `enabled = ${server.enabled}`
    ].join('\n');
}

/** @private */
function renderCodexHomeConfig() {
    return [
        '# Fleet-owned Codex home policy. Authentication material itself is created by Codex login, never by Fleet.',
        'cli_auth_credentials_store = "file"',
        'mcp_oauth_credentials_store = "file"',
        '',
        '[features]',
        'memories = true',
        ''
    ].join('\n');
}

/** @private */
function stripManagedMcpTables(source) {
    const lines    = source.split(/\r?\n/), output = [];
    let   skipping = false;

    for (const line of lines) {
        const header = line.match(/^\s*\[mcp_servers\.\"([^\"]+)\"\]\s*$/);
        if (header) {
            skipping = header[1].startsWith(NEO_MCP_NAME_PREFIX);
            if (!skipping) output.push(line);
            continue;
        }
        if (/^\s*\[[^\]]+\]\s*$/.test(line)) skipping = false;
        if (!skipping) output.push(line);
    }

    return output.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** @private */
function projectCodexOwnedProjection(source) {
    const lines   = source.split(/\r?\n/), result = {};
    let   current = null, buffer = [];

    const flush = () => {
        if (current?.startsWith(NEO_MCP_NAME_PREFIX)) {
            result[current] = buffer.map(line => line.trimEnd()).join('\n').trim();
        }
    };

    for (const line of lines) {
        const header = line.match(/^\s*\[mcp_servers\.\"([^\"]+)\"\]\s*$/);
        if (header) {
            flush();
            current = header[1];
            buffer = [line];
            continue;
        }
        if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
            flush();
            current = null;
            buffer = [];
            continue;
        }
        if (current) buffer.push(line);
    }
    flush();

    return canonicalize(result);
}

/** @private */
function codexHomeOwnedProjection(source) {
    const wanted = new Set([
        'cli_auth_credentials_store',
        'mcp_oauth_credentials_store',
        'features.memories'
    ]), result = {};
    let table = '';

    for (const rawLine of source.split(/\r?\n/)) {
        const line = rawLine.replace(/\s+#.*$/, '').trim();
        if (!line) continue;
        const header = line.match(/^\[([^\]]+)\]$/);
        if (header) {
            table = header[1];
            continue;
        }
        const entry = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
        if (!entry) continue;
        const key = table ? `${table}.${entry[1]}` : entry[1];
        if (wanted.has(key)) result[key] = entry[2].trim();
    }

    return canonicalize(result);
}

/** @private */
function claudeJsonOwnedProjection(source) {
    let parsed;
    try {
        parsed = JSON.parse(source);
    } catch {
        return {__invalidJson: true};
    }

    const result = {};
    for (const [name, definition] of Object.entries(parsed?.mcpServers || {})) {
        if (name.startsWith(NEO_MCP_NAME_PREFIX)) result[name] = definition;
    }
    return canonicalize(result);
}

/** @private */
async function convergeTextArtifact({filePath, desiredContent, ownedProjection, ownedLabel, trustedRoot, fileSystem}) {
    await assertNoSymlinkSegments({rootPath: trustedRoot, targetPath: filePath, fileSystem, label: ownedLabel});

    let existing;
    try {
        existing = await fileSystem.readFile(filePath, 'utf8');
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;

        await fileSystem.mkdir(path.dirname(filePath), {recursive: true});
        await assertNoSymlinkSegments({rootPath: trustedRoot, targetPath: filePath, fileSystem, label: ownedLabel});
        try {
            await fileSystem.writeFile(filePath, desiredContent, {encoding: 'utf8', flag: 'wx', mode: 0o600});
            return {path: filePath, status: WORKSPACE_ARTIFACT_STATES.CREATED, ownedKeys: ownedLabel};
        } catch (writeError) {
            if (writeError?.code !== 'EEXIST') throw writeError;
            existing = await fileSystem.readFile(filePath, 'utf8');
        }
    }

    const
        actual  = ownedProjection(existing),
        desired = ownedProjection(desiredContent);

    if (JSON.stringify(actual) === JSON.stringify(desired)) {
        return {path: filePath, status: WORKSPACE_ARTIFACT_STATES.MATCH, ownedKeys: ownedLabel};
    }

    const artifact = {
        path     : filePath,
        status   : WORKSPACE_ARTIFACT_STATES.DIVERGENT,
        ownedKeys: ownedLabel,
        reason   : actual.__invalidJson ? 'invalid JSON' : 'Fleet-owned keys differ or are missing'
    };
    throw new ManagedWorkspacePreparationError(
        `prepareManagedAgentWorkspace: refusing to overwrite divergent Fleet-owned content at '${filePath}' (${ownedLabel}).`,
        {code: 'FLEET_WORKSPACE_DIVERGENT', artifact}
    );
}

/** @private */
async function ensureDirectoryArtifact(directoryPath, trustedRoot, fileSystem) {
    let stat;
    try {
        stat = await fileSystem.lstat(directoryPath);
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
    }

    if (stat) {
        if (stat.isSymbolicLink()) {
            throw divergentArtifact(directoryPath, 'directory', 'symlinked resident-owned directory');
        }
        if (!stat.isDirectory()) {
            const artifact = {path: directoryPath, status: WORKSPACE_ARTIFACT_STATES.DIVERGENT, ownedKeys: 'directory'};
            throw new ManagedWorkspacePreparationError(
                `prepareManagedAgentWorkspace: expected directory '${directoryPath}', found another filesystem entry.`,
                {code: 'FLEET_WORKSPACE_DIVERGENT', artifact}
            );
        }
        return {path: directoryPath, status: WORKSPACE_ARTIFACT_STATES.MATCH, ownedKeys: 'directory'};
    }

    await fileSystem.mkdir(directoryPath, {recursive: true});
    await assertNoSymlinkSegments({rootPath: trustedRoot, targetPath: directoryPath, fileSystem, label: 'directory'});
    return {path: directoryPath, status: WORKSPACE_ARTIFACT_STATES.CREATED, ownedKeys: 'directory'};
}

/** @private */
function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

/** @private */
function divergentArtifact(filePath, ownedKeys, reason) {
    return new ManagedWorkspacePreparationError(
        `prepareManagedAgentWorkspace: refusing divergent resident-owned path '${filePath}' (${reason}).`,
        {
            code    : 'FLEET_WORKSPACE_DIVERGENT',
            artifact: {path: filePath, status: WORKSPACE_ARTIFACT_STATES.DIVERGENT, ownedKeys, reason}
        }
    );
}

/** @private */
function unsupported(reason) {
    return new ManagedWorkspacePreparationError(
        `prepareManagedAgentWorkspace: unsupported adapter state — ${reason}.`,
        {code: 'FLEET_WORKSPACE_UNSUPPORTED'}
    );
}

/** @private */
function assertNonEmptyString(value, name) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new ManagedWorkspacePreparationError(`prepareManagedAgentWorkspace: '${name}' must be a non-empty string.`);
    }
}

/** @private */
function assertAbsolutePath(value, name) {
    assertNonEmptyString(value, name);
    if (!path.isAbsolute(value)) {
        throw new ManagedWorkspacePreparationError(`prepareManagedAgentWorkspace: '${name}' must be absolute, received '${value}'.`);
    }
}

export default prepareManagedAgentWorkspace;
