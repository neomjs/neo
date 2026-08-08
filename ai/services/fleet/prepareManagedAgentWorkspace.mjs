import {constants as fsConstants} from 'node:fs';
import fs                         from 'node:fs/promises';
import path                       from 'node:path';
import crypto                     from 'node:crypto';
import {fileURLToPath}            from 'node:url';
import {hydrateCurrentWorktree}   from '../../scripts/migrations/bootstrapWorktree.mjs';
import {
    MCP_SERVERS,
    REMOTE_MCP_CREDENTIAL_ENV_VAR,
    resolveMcpMatrix,
    supportsTenantMcpTarget
} from './mcpServers.mjs';
import {deriveAgentInstanceHome}                           from './deriveAgentInstanceHome.mjs';
import {LAUNCHABLE_HARNESS_TYPES}                          from './deriveHarnessLaunchSpec.mjs';
import {KIMI_SEAT_SERVERS, generateKimiSeatConfig}         from './generateKimiSeatConfig.mjs';
import {OPENCODE_SEAT_SERVERS, generateOpenCodeSeatConfig} from './generateOpenCodeSeatConfig.mjs';

const
    __filename               = fileURLToPath(import.meta.url),
    __dirname                = path.dirname(__filename),
    DEFAULT_MAIN_CHECKOUT    = path.resolve(__dirname, '../../..'),
    NEO_MCP_NAME_PREFIX      = 'neo-mjs-',
    CODEX_REMOTE_TRUST_BEGIN = '# Fleet-managed remote MCP project trust begin',
    CODEX_REMOTE_TRUST_END   = '# Fleet-managed remote MCP project trust end';

/**
 * @summary Convergence states for Fleet-owned workspace artifacts. `DIVERGENT` is emitted on the
 * thrown error's `artifact` field because preparation fails closed instead of returning a launchable
 * result alongside unresolved operator content.
 * @type {Readonly<{CREATED: String, MATCH: String, UPDATED: String, DIVERGENT: String}>}
 */
export const WORKSPACE_ARTIFACT_STATES = Object.freeze({
    CREATED  : 'CREATED',
    MATCH    : 'MATCH',
    UPDATED  : 'UPDATED',
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
 * @param {Object}  [options.mcpTarget]          Resolved non-secret tenant target:
 *     `{kind:'tenant', credentialEnvVar, resources:{memory-core:{url},knowledge-base:{url}}}`.
 * @param {Object}  [options.remoteMcpCapability] Exact non-secret installed-adapter proof returned
 *     by `FleetLifecycleService.assertRemoteMcpCapability`.
 * @param {Function}[options.hydrateWorkspace]    Import-safe checkout hydration seam.
 * @param {Function}[options.deriveInstanceHome]  Per-agent home derivation seam.
 * @param {Function}[options.resolveMatrix]       Sparse-at-rest MCP resolver seam.
 * @param {Object}  [options.fileSystem]          Promise filesystem seam.
 * @param {Function}[options.log]                 Hydration logger.
 * @returns {Promise<{repoPath: String, instanceHome: String, mcpMatrix: Object, mcpPlan: Object[], hydration: Object, artifacts: Object[]}>}
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
    mcpTarget = null,
    remoteMcpCapability = null,
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
        plan              = createMcpPlan({mcpMatrix, repoPath: canonicalRepoPath, mainCheckout: installedRoot, nodePath, mcpTarget}),
        instanceHome      = deriveInstanceHome({instanceRoot, agentId: agent.id, harnessType: agent.harnessType});

    // Hardest/unsupported adapter gate runs before hydration or artifact writes. A failed product
    // authority proof cannot leave a checkout looking partially resident-ready.
    assertHarnessSupported({agent, plan});
    await assertRemoteBridgeCapability({
        agent,
        plan,
        capability  : remoteMcpCapability,
        mainCheckout: installedRoot,
        nodePath,
        fileSystem
    });
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
        remoteMcpCapability,
        fileSystem
    });

    // The logical plan contains executable paths, public URLs, and ENV-SLOT NAMES only — never
    // values. Direct-HTTP adapters return their exact renderer input for installed readback;
    // Claude Desktop's command-only bridge is independently bound by the capability proof plus
    // generated-artifact/real-transport tests, while this plan retains the transport intent.
    return {
        repoPath: canonicalRepoPath,
        instanceHome,
        mcpMatrix,
        mcpPlan : plan.map(server => ({
            ...server,
            args              : [...server.args],
            runtimeEnv        : [...server.runtimeEnv],
            requiredRuntimeEnv: [...server.requiredRuntimeEnv],
            secretEnv         : [...server.secretEnv]
        })),
        hydration,
        artifacts
    };
}

/** @private */
function createMcpPlan({mcpMatrix, repoPath, mainCheckout, nodePath, mcpTarget}) {
    assertMcpTargetPlan(mcpTarget);

    return MCP_SERVERS.map(entry => {
        const
            descriptor = MCP_SERVER_DESCRIPTORS[entry.key],
            resource   = mcpTarget?.kind === 'tenant' && mcpTarget.resources[entry.key];

        return {
            key             : entry.key,
            name            : `${NEO_MCP_NAME_PREFIX}${entry.key}`,
            enabled         : mcpMatrix[entry.key] === true,
            target          : resource ? 'tenant' : 'resident',
            transport       : resource ? 'streamable-http' : 'stdio',
            url             : resource?.url ?? null,
            credentialEnvVar: resource ? mcpTarget.credentialEnvVar : null,
            command         : nodePath,
            sourceRoot      : mainCheckout,
            args            : [
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
function assertMcpTargetPlan(target) {
    if (target === null) return;

    const topLevelKeys = new Set(['kind', 'credentialEnvVar', 'resources']);

    if (!target ||
        typeof target !== 'object' ||
        Array.isArray(target) ||
        Object.keys(target).some(key => !topLevelKeys.has(key)) ||
        target.kind !== 'tenant' ||
        target.credentialEnvVar !== REMOTE_MCP_CREDENTIAL_ENV_VAR ||
        !target.resources ||
        typeof target.resources !== 'object' ||
        Array.isArray(target.resources)) {
        throw unsupported('tenant MCP target plan is malformed')
    }

    const
        allowed  = new Set(['memory-core', 'knowledge-base']),
        suffixes = {
            'memory-core'   : '/mc/mcp',
            'knowledge-base': '/kb/mcp'
        };
    let deploymentBase = null;

    for (const [key, resource] of Object.entries(target.resources)) {
        let url;

        try {
            url = new URL(resource?.url)
        } catch {
            throw unsupported(`remote MCP resource '${key}' is malformed`)
        }

        const suffix = suffixes[key];

        if (!allowed.has(key) ||
            !resource ||
            typeof resource !== 'object' ||
            Array.isArray(resource) ||
            Object.keys(resource).some(field => field !== 'url') ||
            typeof resource.url !== 'string' ||
            !resource.url ||
            !['http:', 'https:'].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            !url.pathname.endsWith(suffix)) {
            throw unsupported(`remote MCP resource '${key}' is malformed`)
        }

        const candidateBase = `${url.origin}${url.pathname.slice(0, -suffix.length)}`;

        if (deploymentBase !== null && deploymentBase !== candidateBase) {
            throw unsupported('remote MCP resources do not share one canonical deployment base')
        }

        deploymentBase = candidateBase
    }

    if (![...allowed].every(key => target.resources[key])) {
        throw unsupported('tenant MCP target requires both memory-core and knowledge-base resources')
    }
}

/** @private */
function assertHarnessSupported({agent, plan}) {
    if (agent.metadata?.launch) {
        throw unsupported('raw metadata.launch overrides bypass curated resident-home and MCP preparation');
    }

    if (!LAUNCHABLE_HARNESS_TYPES.includes(agent.harnessType)) {
        throw unsupported(`harness '${agent.harnessType}' has no launch/workspace adapter`);
    }

    if (plan.some(server => server.target === 'tenant') &&
        !supportsTenantMcpTarget(agent.harnessType)) {
        throw unsupported(`harness '${agent.harnessType}' has no proven secret-safe tenant MCP grammar`)
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

/**
 * @summary Revalidate Claude Desktop's exact installed Neo bridge before hydration. The lifecycle
 * performs the same gate before checkout provisioning; this local check prevents direct composer
 * callers from manufacturing a structurally plausible proof over missing or drifted bytes.
 * @param {Object} options
 * @param {Object} options.agent
 * @param {Object[]} options.plan
 * @param {Object|null} options.capability
 * @param {String} options.mainCheckout
 * @param {String} options.nodePath
 * @param {Object} options.fileSystem
 * @returns {Promise<void>}
 * @private
 */
async function assertRemoteBridgeCapability({agent, plan, capability, mainCheckout, nodePath, fileSystem}) {
    if (agent.harnessType !== 'claude-desktop' ||
        !plan.some(server => server.enabled && server.target === 'tenant')) {
        return
    }

    const
        bridge             = capability?.bridge,
        expectedEntrypoint = path.join(mainCheckout, 'ai/mcp/client/stdioToStreamableHttp.mjs');

    if (capability?.harnessType !== 'claude-desktop' ||
        !bridge ||
        bridge.kind !== 'neo-stdio-streamable-http' ||
        bridge.command !== nodePath ||
        bridge.entrypoint !== expectedEntrypoint) {
        throw unsupported('Claude Desktop remote MCP requires the exact installed Neo bridge capability proof')
    }

    const
        nodeStat   = await fileSystem.stat(nodePath).catch(() => null),
        bridgeStat = await fileSystem.lstat(expectedEntrypoint).catch(() => null);

    if (!nodeStat?.isFile() || !bridgeStat?.isFile()) {
        throw unsupported('Claude Desktop bridge Node command or installed entrypoint is absent')
    }

    try {
        await fileSystem.access(nodePath, fsConstants.X_OK);
        await fileSystem.access(expectedEntrypoint, fsConstants.R_OK)
    } catch {
        throw unsupported('Claude Desktop bridge Node command or installed entrypoint is inaccessible')
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
    const localEnabled = plan.filter(server => server.enabled && server.transport === 'stdio');

    if (localEnabled.length === 0) return;

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
        if (!server.enabled || server.transport !== 'stdio') continue;

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
async function prepareHarnessArtifacts({
    agent,
    repoPath,
    instanceHome,
    mainCheckout,
    plan,
    remoteMcpCapability,
    fileSystem
}) {
    switch (agent.harnessType) {
        case 'codex':
        case 'codex-desktop':
            return prepareCodexArtifacts({agent, repoPath, instanceHome, mainCheckout, plan, fileSystem});
        case 'kimi-code':
            return prepareKimiArtifacts({repoPath, instanceHome, mainCheckout, plan, fileSystem});
        case 'opencode':
            return prepareOpenCodeArtifacts({repoPath, instanceHome, mainCheckout, plan, fileSystem});
        case 'claude-code':
            return prepareClaudeJsonArtifact({
                agent,
                filePath      : path.join(instanceHome, 'mcp-config.json'),
                trustedRoot   : instanceHome,
                plan,
                remoteMcpCapability,
                fileSystem,
                interpolateEnv: true
            });
        case 'claude-desktop':
            return prepareClaudeJsonArtifact({
                agent,
                filePath      : path.join(instanceHome, 'claude_desktop_config.json'),
                trustedRoot   : instanceHome,
                plan,
                remoteMcpCapability,
                fileSystem,
                interpolateEnv: false
            });
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
        legacyContent  = renderCodexProjectConfig(template, localizePlan(plan)),
        homeRoot       = agent.harnessType === 'codex-desktop' ? path.join(instanceHome, 'codex-home') : instanceHome,
        homePath       = path.join(homeRoot, 'config.toml'),
        memoriesPath   = path.join(homeRoot, 'memories'),
        homeContent    = renderCodexHomeConfig(),
        remote         = plan.some(server => server.target === 'tenant'),
        artifacts      = [];

    artifacts.push(...await convergeTransportArtifact({
        filePath       : projectPath,
        desiredContent : projectContent,
        legacyContent,
        ownedProjection: projectCodexOwnedProjection,
        mergeTransport : mergeCodexTransport,
        adapter        : agent.harnessType,
        instanceHome,
        remote,
        ownedLabel     : 'mcp_servers.\"neo-mjs-*\"',
        trustedRoot    : repoPath,
        fileSystem
    }));
    const homeArtifact = await convergeTextArtifact({
        filePath       : homePath,
        desiredContent : homeContent,
        ownedProjection: codexHomeOwnedProjection,
        ownedLabel     : 'cli_auth_credentials_store,mcp_oauth_credentials_store,features.memories',
        trustedRoot    : instanceHome,
        fileSystem
    });

    if (await convergeCodexRemoteTrust({
        filePath   : homePath,
        repoPath,
        remote,
        trustedRoot: instanceHome,
        fileSystem
    }) && homeArtifact.status === WORKSPACE_ARTIFACT_STATES.MATCH) {
        homeArtifact.status = WORKSPACE_ARTIFACT_STATES.UPDATED
    }

    artifacts.push(homeArtifact);
    artifacts.push(await ensureDirectoryArtifact(memoriesPath, instanceHome, fileSystem));

    return artifacts;
}

/** @private */
async function prepareClaudeJsonArtifact({
    agent,
    filePath,
    trustedRoot,
    plan,
    remoteMcpCapability,
    fileSystem,
    interpolateEnv
}) {
    const
        desiredContent = renderClaudeJsonContent({
            agent,
            plan,
            remoteMcpCapability,
            instanceHome: trustedRoot,
            interpolateEnv
        }),
        legacyContent  = renderClaudeJsonContent({
            agent,
            plan        : localizePlan(plan),
            remoteMcpCapability,
            instanceHome: trustedRoot,
            interpolateEnv
        });

    return convergeTransportArtifact({
        filePath,
        desiredContent,
        legacyContent,
        ownedProjection: claudeJsonOwnedProjection,
        mergeTransport : (existing, desired) => mergeJsonTransport(existing, desired, 'mcpServers'),
        adapter        : agent.harnessType,
        instanceHome   : trustedRoot,
        remote         : plan.some(server => server.target === 'tenant'),
        ownedLabel     : 'mcpServers.neo-mjs-*',
        trustedRoot,
        fileSystem
    })
}

/**
 * @summary Render Claude-family MCP JSON. Claude Desktop receives Neo's local command bridge for
 * remote rows; direct-HTTP-capable Claude Code receives native HTTP entries.
 * @private
 */
function renderClaudeJsonContent({agent, plan, remoteMcpCapability, interpolateEnv}) {
    const servers = {};

    for (const server of plan) {
        if (!server.enabled) continue;

        if (server.transport === 'streamable-http') {
            if (agent.harnessType === 'claude-desktop') {
                servers[server.name] = {
                    command: remoteMcpCapability.bridge.command,
                    args   : [
                        remoteMcpCapability.bridge.entrypoint,
                        '--url',
                        server.url,
                        '--token-env',
                        server.credentialEnvVar
                    ]
                }
            } else {
                servers[server.name] = {
                    type   : 'http',
                    url    : server.url,
                    headers: {Authorization: `Bearer \${${server.credentialEnvVar}}`}
                }
            }
            continue
        }

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

    return JSON.stringify({mcpServers: servers}, null, 2) + '\n'
}

/**
 * Birth a Kimi Code seat's full artifact set from `generateKimiSeatConfig` — the generator owns
 * content, this composer owns convergence policy. The curated MCP matrix narrows the canonical
 * server set (a disabled catalog server is never wired); the memory-layer files are CREATE-ONLY
 * (story-sovereignty: after first boot they are bearer-authored, and re-provisioning must never
 * clobber or even flag them); the config/hook surfaces converge on their Fleet-owned projections.
 * @private
 */
async function prepareKimiArtifacts({repoPath, instanceHome, mainCheckout, plan, fileSystem}) {
    const
        enabledKeys = new Set(plan.filter(server => server.enabled).map(server => server.key)),
        servers     = KIMI_SEAT_SERVERS.filter(server => enabledKeys.has(server.name.slice(NEO_MCP_NAME_PREFIX.length)));

    if (servers.length === 0) {
        throw unsupported("harness 'kimi-code' has no enabled MCP servers to wire");
    }

    const
        remoteServers = createRemoteServerMap(plan),
        {files}       = generateKimiSeatConfig({
        canonicalRoot: mainCheckout,
        seatEnvFile  : path.join(repoPath, '.env'),
        workspaceRoot: repoPath,
        kimiHome     : instanceHome,
        memoryDir    : path.join(instanceHome, 'memory'),
        nodeBinary   : plan[0].command,
        servers,
        remoteServers
    }),
        {files: legacyFiles} = generateKimiSeatConfig({
            canonicalRoot: mainCheckout,
            seatEnvFile  : path.join(repoPath, '.env'),
            workspaceRoot: repoPath,
            kimiHome     : instanceHome,
            memoryDir    : path.join(instanceHome, 'memory'),
            nodeBinary   : plan[0].command,
            servers
        });

    return convergeSeatConfigFiles({files, legacyFiles, repoPath, instanceHome, fileSystem, policies: [
        {match: /config\.toml$/,                   ownedProjection: kimiConfigTomlOwnedProjection, ownedLabel: 'default_permission_mode,default_model,[[permission.rules]],[[hooks]]'},
        {
            match          : /\.kimi-code\/mcp\.json$/,
            ownedProjection: claudeJsonOwnedProjection,
            ownedLabel     : 'mcpServers."neo-mjs-*"',
            transport      : {adapter: 'kimi-code', containerName: 'mcpServers'}
        },
        {match: /hooks\/identityAnchorHook\.mjs$/, ownedProjection: wholeFileOwnedProjection,      ownedLabel: 'generated identity-anchor hook'}
        // Everything else (the four memory-layer files) is create-only bearer substrate.
    ]});
}

/**
 * Birth an OpenCode seat's full artifact set from `generateOpenCodeSeatConfig` — same split as
 * the Kimi branch: generator content, composer convergence, matrix-narrowed servers, create-only
 * bearer memory layer. The wake-envelope boot hook is emitted into the instance home (fully
 * Fleet-owned; divergence fails closed per the generated-artifact posture).
 * @private
 */
async function prepareOpenCodeArtifacts({repoPath, instanceHome, mainCheckout, plan, fileSystem}) {
    const
        enabledKeys = new Set(plan.filter(server => server.enabled).map(server => server.key)),
        servers     = OPENCODE_SEAT_SERVERS.filter(server => enabledKeys.has(server.name.slice(NEO_MCP_NAME_PREFIX.length)));

    if (servers.length === 0) {
        throw unsupported("harness 'opencode' has no enabled MCP servers to wire");
    }

    const
        remoteServers = createRemoteServerMap(plan),
        options       = {
        canonicalRoot: mainCheckout,
        seatEnvFile  : path.join(repoPath, '.env'),
        workspaceRoot: repoPath,
        memoryDir    : path.join(instanceHome, 'memory'),
        nodeBinary   : plan[0].command,
        seatHome     : instanceHome,
        wakeHookPath : path.join(instanceHome, 'write-wake-envelope.mjs'),
        servers
    },
        {files}       = generateOpenCodeSeatConfig({...options, remoteServers}),
        {files: legacyFiles} = generateOpenCodeSeatConfig(options);

    return convergeSeatConfigFiles({files, legacyFiles, repoPath, instanceHome, fileSystem, policies: [
        {
            match          : /opencode\.jsonc$/,
            ownedProjection: opencodeJsoncOwnedProjection,
            ownedLabel     : 'mcp."neo-mjs-*",instructions',
            transport      : {adapter: 'opencode', containerName: 'mcp'}
        },
        {match: /write-wake-envelope\.mjs$/, ownedProjection: wholeFileOwnedProjection,     ownedLabel: 'generated wake-envelope boot hook'}
    ]});
}

/**
 * Converge a generator's emission list against the workspace: each file lands under the policy
 * its path matches (Fleet-owned projection, fail-closed on divergence) or falls through to the
 * create-only bearer default — an existing file of ANY content reports MATCH untouched (the
 * seat's own authorship is never a divergence), an absent file is created from the template.
 * @private
 */
async function convergeSeatConfigFiles({files, legacyFiles, repoPath, instanceHome, fileSystem, policies}) {
    const artifacts = [];

    for (const file of files) {
        const policy = policies.find(entry => entry.match.test(file.path));

        const legacyFile = legacyFiles?.find(entry => entry.path === file.path);
        const common     = {
            filePath       : file.path,
            desiredContent : file.content,
            ownedProjection: policy ? policy.ownedProjection : createOnlyOwnedProjection,
            ownedLabel     : policy ? policy.ownedLabel      : 'create-only bearer memory layer',
            trustedRoot    : file.path.startsWith(repoPath + path.sep) ? repoPath : instanceHome,
            fileSystem
        };

        if (policy?.transport) {
            artifacts.push(...await convergeTransportArtifact({
                ...common,
                legacyContent : legacyFile.content,
                mergeTransport: (existing, desired) => mergeJsonTransport(
                    existing,
                    desired,
                    policy.transport.containerName
                ),
                adapter: policy.transport.adapter,
                instanceHome,
                remote : file.content !== legacyFile.content
            }))
        } else {
            artifacts.push(await convergeTextArtifact(common))
        }
    }

    return artifacts;
}

/**
 * The create-only projection: existing bearer-authored content is never a divergence.
 * @private
 */
function createOnlyOwnedProjection() {
    return null;
}

/**
 * The whole-file projection for fully Fleet-owned generated artifacts (hook scripts): any
 * content drift — a hand-edit or a stale template generation — fails closed and loud.
 * @private
 */
function wholeFileOwnedProjection(source) {
    return source;
}

/**
 * The Fleet-owned surface of a generated Kimi `config.toml`: the two managed scalars plus every
 * array-of-tables block (`[[permission.rules]]`, `[[hooks]]`) the generator emits. Harness-owned
 * additions the seat's first login writes (provider tables) sit OUTSIDE the projection, so a
 * post-provisioning re-birth reports MATCH instead of a false divergence.
 * @private
 */
function kimiConfigTomlOwnedProjection(source) {
    const result  = {blocks: [], scalars: {}};
    let   current = null;

    for (const line of source.split(/\r?\n/)) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith('#')) continue;

        const arrayHeader = trimmed.match(/^\[\[([^\]]+)\]\]$/);

        if (arrayHeader) {
            current = [trimmed];
            result.blocks.push(current);
            continue;
        }
        if (/^\[[^\]]+\]$/.test(trimmed)) { current = null; continue; }
        if (current) { current.push(trimmed); continue; }

        const scalar = trimmed.match(/^(default_permission_mode|default_model)\s*=\s*(.+)$/);
        if (scalar) result.scalars[scalar[1]] = scalar[2].trim();
    }

    return canonicalize(result);
}

/**
 * The Fleet-owned surface of a generated `opencode.jsonc`: the `neo-mjs-*` MCP entries plus the
 * `instructions` array (the memory-layer load wiring). Resident additions outside those keys are
 * free. Legal JSONC comments and trailing commas are normalized only for comparison; the source
 * bytes themselves remain resident-owned outside Fleet's narrow MCP replacements.
 * @private
 */
function opencodeJsoncOwnedProjection(source) {
    let parsed;
    try {
        parsed = parseJsonLike(source);
    } catch {
        return {__invalidJson: true};
    }

    const result = {instructions: parsed?.instructions};

    for (const [name, definition] of Object.entries(parsed?.mcp || {})) {
        if (name.startsWith(NEO_MCP_NAME_PREFIX)) (result.mcp ??= {})[name] = definition;
    }

    return canonicalize(result);
}

/** @private */
function renderCodexProjectConfig(template, plan) {    const
        base     = stripManagedMcpTables(template).trimEnd(),
        sections = plan.map(renderCodexMcpTable).join('\n\n'),
        marker   = /^\[features\]\s*$/m,
        header   = '# Fleet-managed Neo MCP tables: executable paths come from the installed canonical checkout; cwd/project paths stay bound to this prepared resident checkout; enabled values are the current Brain projection.';

    if (!marker.test(base)) return `${base}\n\n${header}\n${sections}\n`;

    return base.replace(marker, `${header}\n${sections}\n\n[features]`) + '\n';
}

/** @private */
function renderCodexMcpTable(server) {
    if (server.transport === 'streamable-http') {
        return [
            `[mcp_servers.\"${server.name}\"]`,
            `url = ${JSON.stringify(server.url)}`,
            `bearer_token_env_var = ${JSON.stringify(server.credentialEnvVar)}`,
            'startup_timeout_sec = 30',
            'tool_timeout_sec = 120',
            `enabled = ${server.enabled}`
        ].join('\n')
    }

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

/**
 * @summary Parse a TOML table header without mistaking brackets or `#` inside quoted keys for the
 * structural close/comment boundary. Both `[table]` and `[[array.table]]` forms are recognized,
 * including legal trailing comments.
 * @param {String} line One physical TOML line.
 * @returns {{array: Boolean, body: String}|null}
 * @private
 */
function parseTomlTableHeader(line) {
    const
        source    = String(line).trimStart(),
        array     = source.startsWith('[['),
        openWidth = array ? 2 : 1;

    if ((!array && !source.startsWith('[')) || source.length <= openWidth) return null;

    let quote = null, escaped = false;

    for (let index = openWidth; index < source.length; index++) {
        const char = source[index];

        if (quote) {
            if (quote === '"' && escaped) {
                escaped = false
            } else if (quote === '"' && char === '\\') {
                escaped = true
            } else if (char === quote) {
                quote = null
            }

            continue
        }

        if (char === '"' || char === "'") {
            quote = char;
            continue
        }

        if (char === '#') return null;

        const closes = array
            ? char === ']' && source[index + 1] === ']'
            : char === ']';

        if (!closes) continue;

        const
            body   = source.slice(openWidth, index).trim(),
            suffix = source.slice(index + (array ? 2 : 1)).trim();

        if (!body || (suffix && !suffix.startsWith('#'))) return null;

        return {array, body}
    }

    return null
}

/**
 * @summary Extract a Codex MCP server name from one parsed TOML table header.
 * @param {{array: Boolean, body: String}|null} header
 * @returns {String|null}
 * @private
 */
function codexMcpServerName(header) {
    if (!header || header.array) return null;

    return header.body.match(/^mcp_servers\."([^"]+)"$/)?.[1] ?? null
}

/** @private */
function stripManagedMcpTables(source) {
    const lines    = source.split(/\r?\n/), output = [];
    let   skipping = false;

    for (const line of lines) {
        const
            header = parseTomlTableHeader(line),
            name   = codexMcpServerName(header);

        if (name) {
            skipping = name.startsWith(NEO_MCP_NAME_PREFIX);
            if (!skipping) output.push(line);
            continue;
        }
        if (header) skipping = false;
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
        const
            header = parseTomlTableHeader(line),
            name   = codexMcpServerName(header);

        if (name) {
            flush();
            current = name;
            buffer = [line];
            continue;
        }
        if (header) {
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
        const header = parseTomlTableHeader(rawLine);

        if (header) {
            table = header.array ? '' : header.body;
            continue
        }

        const line = rawLine.replace(/\s+#.*$/, '').trim();
        if (!line) continue;
        const entry = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
        if (!entry) continue;
        const key = table ? `${table}.${entry[1]}` : entry[1];
        if (wanted.has(key)) result[key] = entry[2].trim();
    }

    return canonicalize(result);
}

/**
 * @summary Add the narrow Codex project-trust row only while remote MCP is selected, then remove
 * exactly Fleet's marked block on opt-out. A resident-authored trust row is preserved; an explicit
 * non-trusted row rejects remote admission. This keeps the no-intent home artifact byte-identical
 * to the stdio baseline while making the generated project MCP config consumable at runtime.
 * @param {Object} options
 * @returns {Promise<Boolean>} whether Fleet changed the home artifact.
 * @private
 */
async function convergeCodexRemoteTrust({filePath, repoPath, remote, trustedRoot, fileSystem}) {
    await assertNoSymlinkSegments({
        rootPath  : trustedRoot,
        targetPath: filePath,
        fileSystem,
        label     : 'Codex remote MCP project trust'
    });

    const
        source        = await fileSystem.readFile(filePath, 'utf8'),
        expectedBlock = renderCodexRemoteTrustBlock(repoPath),
        begin         = source.indexOf(CODEX_REMOTE_TRUST_BEGIN),
        endMarker     = begin < 0 ? -1 : source.indexOf(CODEX_REMOTE_TRUST_END, begin),
        secondBegin   = begin < 0 ? -1 : source.indexOf(CODEX_REMOTE_TRUST_BEGIN, begin + 1);

    if ((begin < 0) !== (endMarker < 0) || secondBegin >= 0) {
        throw transportDivergence(filePath, 'projects.<managed-repo>.trust_level', 'malformed Fleet trust marker')
    }

    if (begin >= 0) {
        const
            end   = endMarker + CODEX_REMOTE_TRUST_END.length,
            block = source.slice(begin, end);

        if (remote) {
            if (block !== expectedBlock) {
                throw transportDivergence(filePath, 'projects.<managed-repo>.trust_level', 'Fleet trust block diverged')
            }
            return false
        }

        const removable = block.match(
            /^# Fleet-managed remote MCP project trust begin\n\[projects\.(.+)\]\ntrust_level = "trusted"\n# Fleet-managed remote MCP project trust end$/
        );

        if (!removable) {
            throw transportDivergence(filePath, 'projects.<managed-repo>.trust_level', 'Fleet trust block diverged')
        }

        const suffix = source.slice(end).startsWith('\n\n') ? source.slice(end + 2) : source.slice(end);

        await publishTextAtomically({
            filePath,
            content: source.slice(0, begin) + suffix,
            fileSystem
        });
        return true
    }

    if (!remote) return false;

    const existingTrust = readCodexProjectTrust(source, repoPath);

    if (existingTrust === '"trusted"') return false;
    if (existingTrust !== undefined) {
        throw transportDivergence(filePath, 'projects.<managed-repo>.trust_level', 'resident trust row is not trusted')
    }

    const featureHeader = /^\[features\]\s*$/m.exec(source);
    if (!featureHeader) {
        throw transportDivergence(filePath, 'projects.<managed-repo>.trust_level', 'features insertion anchor is missing')
    }

    const output = source.slice(0, featureHeader.index) +
        expectedBlock + '\n\n' +
        source.slice(featureHeader.index);

    await publishTextAtomically({filePath, content: output, fileSystem});
    return true
}

/** @private */
function renderCodexRemoteTrustBlock(repoPath) {
    return [
        CODEX_REMOTE_TRUST_BEGIN,
        `[projects.${JSON.stringify(repoPath)}]`,
        'trust_level = "trusted"',
        CODEX_REMOTE_TRUST_END
    ].join('\n')
}

/** @private */
function readCodexProjectTrust(source, repoPath) {
    const wanted = `projects.${JSON.stringify(repoPath)}.trust_level`;
    let   table  = '';

    for (const rawLine of source.split(/\r?\n/)) {
        const header = parseTomlTableHeader(rawLine);

        if (header) {
            table = header.array ? '' : header.body;
            continue
        }

        const line = rawLine.replace(/\s+#.*$/, '').trim();
        if (!line) continue;

        const entry = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
        if (!entry) continue;

        const key = table ? `${table}.${entry[1]}` : entry[1];
        if (key === wanted) return entry[2].trim()
    }
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

const TRANSPORT_SERVER_NAMES = Object.freeze([
    `${NEO_MCP_NAME_PREFIX}memory-core`,
    `${NEO_MCP_NAME_PREFIX}knowledge-base`
]);

/** @private */
function localizePlan(plan) {
    return plan.map(server => server.target === 'tenant'
        ? {...server, target: 'resident', transport: 'stdio', url: null, credentialEnvVar: null}
        : {...server});
}

/** @private */
function createRemoteServerMap(plan) {
    return Object.fromEntries(plan
        .filter(server => server.target === 'tenant')
        .map(server => [server.name, {
            url             : server.url,
            credentialEnvVar: server.credentialEnvVar
        }]));
}

/**
 * @summary Converge the one transport-bearing artifact with an authenticated transition receipt.
 * Markerless legacy stdio may move once; later changes require the receipt hash to match the
 * current MC/KB projection. All other managed Neo entries must already match, and the merge
 * function replaces only the two transport values.
 * @private
 */
async function convergeTransportArtifact({
    filePath,
    desiredContent,
    legacyContent,
    ownedProjection,
    mergeTransport,
    adapter,
    instanceHome,
    remote,
    ownedLabel,
    trustedRoot,
    fileSystem
}) {
    await assertNoSymlinkSegments({rootPath: trustedRoot, targetPath: filePath, fileSystem, label: ownedLabel});

    const
        receiptPath = path.join(instanceHome, '.neo-fleet-mcp-transport.json'),
        desired     = splitTransportProjection(ownedProjection(desiredContent)),
        legacy      = splitTransportProjection(ownedProjection(legacyContent));
    let existing;
    let artifactStatus = WORKSPACE_ARTIFACT_STATES.MATCH;

    try {
        existing = await fileSystem.readFile(filePath, 'utf8')
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error;

        await fileSystem.mkdir(path.dirname(filePath), {recursive: true});
        await assertNoSymlinkSegments({rootPath: trustedRoot, targetPath: filePath, fileSystem, label: ownedLabel});
        await fileSystem.writeFile(filePath, desiredContent, {encoding: 'utf8', flag: 'wx', mode: 0o600});
        existing       = desiredContent;
        artifactStatus = WORKSPACE_ARTIFACT_STATES.CREATED
    }

    const actual = splitTransportProjection(ownedProjection(existing));

    if (actual.invalid || desired.invalid || legacy.invalid ||
        JSON.stringify(actual.other) !== JSON.stringify(desired.other)) {
        throw transportDivergence(filePath, ownedLabel, actual.invalid ? 'invalid managed artifact' : 'non-transport managed keys differ')
    }

    if (JSON.stringify(actual.transport) !== JSON.stringify(desired.transport)) {
        const receipt    = await readTransportReceipt({receiptPath, adapter, filePath, fileSystem});
        const authorized = receipt
            ? receipt.projectionSha256 === hashProjection(actual.transport)
            : JSON.stringify(actual.transport) === JSON.stringify(legacy.transport);

        if (!authorized) {
            throw transportDivergence(filePath, ownedLabel, 'current MC/KB projection is neither markerless legacy stdio nor receipt-authenticated')
        }

        const merged     = mergeTransport(existing, desiredContent);
        const mergedPlan = splitTransportProjection(ownedProjection(merged));

        if (mergedPlan.invalid ||
            JSON.stringify(mergedPlan.transport) !== JSON.stringify(desired.transport) ||
            JSON.stringify(mergedPlan.other) !== JSON.stringify(actual.other)) {
            throw transportDivergence(filePath, ownedLabel, 'transport-only merge could not preserve the managed artifact contract')
        }

        await publishTextAtomically({filePath, content: merged, fileSystem});
        artifactStatus = WORKSPACE_ARTIFACT_STATES.UPDATED
    }

    const artifacts = [{
        path     : filePath,
        status   : artifactStatus,
        ownedKeys: ownedLabel
    }];

    if (remote) {
        artifacts.push(await convergeTransportReceipt({
            receiptPath,
            adapter,
            filePath,
            projectionSha256: hashProjection(desired.transport),
            fileSystem,
            instanceHome
        }))
    } else {
        const removed = await removeTransportReceipt({receiptPath, fileSystem, instanceHome});
        if (removed) artifacts.push(removed)
    }

    return artifacts
}

/** @private */
function splitTransportProjection(projection) {
    if (!projection || projection.__invalidJson) {
        return {invalid: true, transport: {}, other: {}}
    }

    const
        hasMcpBag = Object.hasOwn(projection, 'mcp'),
        bag       = hasMcpBag ? (projection.mcp || {}) : projection,
        transport = {},
        otherBag  = {...bag};

    for (const name of TRANSPORT_SERVER_NAMES) {
        if (Object.hasOwn(bag, name)) transport[name] = bag[name];
        delete otherBag[name]
    }

    const other = hasMcpBag
        ? {...projection, ...(Object.keys(otherBag).length ? {mcp: otherBag} : {})}
        : otherBag;

    if (hasMcpBag && Object.keys(otherBag).length === 0) delete other.mcp;

    return {
        invalid  : false,
        transport: canonicalize(transport),
        other    : canonicalize(other)
    }
}

/** @private */
function hashProjection(projection) {
    return crypto.createHash('sha256').update(JSON.stringify(canonicalize(projection))).digest('hex')
}

/** @private */
async function readTransportReceipt({receiptPath, adapter, filePath, fileSystem}) {
    let raw;

    try {
        raw = await fileSystem.readFile(receiptPath, 'utf8')
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error
    }

    let receipt;

    try {
        receipt = JSON.parse(raw)
    } catch {
        throw transportDivergence(receiptPath, 'transport receipt', 'invalid JSON')
    }

    const expectedKeys = ['adapter', 'artifact', 'projectionSha256', 'version'];

    if (!receipt ||
        typeof receipt !== 'object' ||
        Array.isArray(receipt) ||
        Object.keys(receipt).sort().join(',') !== expectedKeys.sort().join(',') ||
        receipt.version !== 1 ||
        receipt.adapter !== adapter ||
        receipt.artifact !== path.basename(filePath) ||
        !/^[a-f0-9]{64}$/.test(receipt.projectionSha256 || '')) {
        throw transportDivergence(receiptPath, 'transport receipt', 'receipt identity or shape differs')
    }

    return receipt
}

/** @private */
async function convergeTransportReceipt({receiptPath, adapter, filePath, projectionSha256, fileSystem, instanceHome}) {
    await assertNoSymlinkSegments({
        rootPath  : instanceHome,
        targetPath: receiptPath,
        fileSystem,
        label     : 'transport receipt'
    });

    const desired = {
        version : 1,
        adapter,
        artifact: path.basename(filePath),
        projectionSha256
    };
    let existing = null;

    try {
        existing = JSON.parse(await fileSystem.readFile(receiptPath, 'utf8'))
    } catch (error) {
        if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }

    if (JSON.stringify(existing) === JSON.stringify(desired)) {
        return {path: receiptPath, status: WORKSPACE_ARTIFACT_STATES.MATCH, ownedKeys: 'transport receipt'}
    }

    const status = existing
        ? WORKSPACE_ARTIFACT_STATES.UPDATED
        : WORKSPACE_ARTIFACT_STATES.CREATED;

    await fileSystem.mkdir(path.dirname(receiptPath), {recursive: true});
    await publishTextAtomically({
        filePath: receiptPath,
        content : JSON.stringify(desired, null, 2) + '\n',
        fileSystem
    });

    return {path: receiptPath, status, ownedKeys: 'transport receipt'}
}

/** @private */
async function removeTransportReceipt({receiptPath, fileSystem, instanceHome}) {
    await assertNoSymlinkSegments({
        rootPath  : instanceHome,
        targetPath: receiptPath,
        fileSystem,
        label     : 'transport receipt'
    });

    try {
        await fileSystem.unlink(receiptPath);
        return {path: receiptPath, status: WORKSPACE_ARTIFACT_STATES.UPDATED, ownedKeys: 'transport receipt removed'}
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error
    }
}

/** @private */
async function publishTextAtomically({filePath, content, fileSystem}) {
    const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;

    try {
        await fileSystem.writeFile(tmpPath, content, {encoding: 'utf8', mode: 0o600});
        await fileSystem.rename(tmpPath, filePath);
        await fileSystem.chmod(filePath, 0o600)
    } catch (error) {
        await fileSystem.unlink(tmpPath).catch(() => {});
        throw error
    }
}

/** @private */
function mergeCodexTransport(existing, desired) {
    let   output       = existing;
    const replacements = TRANSPORT_SERVER_NAMES.map(name => {
        const
            current = findTomlMcpTable(existing, name),
            target  = findTomlMcpTable(desired, name);

        if (!current || !target) {
            throw transportDivergence(name, 'Codex MCP table', 'managed table is missing')
        }

        return {start: current.start, end: current.end, value: target.value}
    }).sort((a, b) => b.start - a.start);

    for (const replacement of replacements) {
        output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end)
    }

    return output
}

/** @private */
function findTomlMcpTable(source, name) {
    let start = null, boundary = source.length, lineStart = 0;

    while (lineStart < source.length) {
        const
            lineEnd = source.indexOf('\n', lineStart),
            line    = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd),
            header  = parseTomlTableHeader(line);

        if (start === null) {
            if (codexMcpServerName(header) === name) start = lineStart
        } else if (header) {
            boundary = lineStart;
            break
        }

        if (lineEnd === -1) break;

        lineStart = lineEnd + 1
    }

    if (start === null) return null;

    // The replacement owns only the table bytes, never the whitespace separator after them.
    // Keeping that suffix in the resident source is what makes an inserted operator table survive
    // local → remote → alternate remote → local with byte-exact surrounding layout.
    let end = boundary;

    while (end > start && /\s/.test(source[end - 1])) end--;

    return {start, end, value: source.slice(start, end)}
}

/** @private */
function mergeJsonTransport(existing, desired, containerName) {
    const desiredObject = parseJsonLike(desired);
    const desiredBag    = desiredObject?.[containerName];

    if (!desiredBag || typeof desiredBag !== 'object') {
        throw transportDivergence(containerName, 'JSON MCP container', 'desired container is missing')
    }

    const
        rootRange             = findJsonObjectRange(existing),
        containerRange        = findDirectJsonProperty(existing, rootRange, containerName),
        desiredRootRange      = findJsonObjectRange(desired),
        desiredContainerRange = findDirectJsonProperty(desired, desiredRootRange, containerName);

    if (!containerRange || existing[containerRange.valueStart] !== '{') {
        throw transportDivergence(containerName, 'JSON MCP container', 'existing container is missing')
    }
    if (!desiredContainerRange || desired[desiredContainerRange.valueStart] !== '{') {
        throw transportDivergence(containerName, 'JSON MCP container', 'desired container source is missing')
    }

    const replacements = TRANSPORT_SERVER_NAMES.map(name => {
        const
            current = findDirectJsonProperty(existing, {
                start: containerRange.valueStart,
                end  : containerRange.valueEnd
            }, name),
            target  = findDirectJsonProperty(desired, {
                start: desiredContainerRange.valueStart,
                end  : desiredContainerRange.valueEnd
            }, name);

        if (!current || !target || !Object.hasOwn(desiredBag, name)) {
            throw transportDivergence(name, 'JSON MCP entry', 'managed entry is missing')
        }

        return {
            start: current.valueStart,
            end  : current.valueEnd,
            value: desired.slice(target.valueStart, target.valueEnd)
        }
    }).sort((a, b) => b.start - a.start);

    let output = existing;

    for (const replacement of replacements) {
        output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end)
    }

    return output
}

/** @private */
function parseJsonLike(source) {
    return JSON.parse(normalizeJsonc(source))
}

/**
 * @summary Normalize legal JSONC comments and trailing commas for semantic comparison without
 * rewriting the resident's source artifact. String content and line structure are preserved.
 * @param {String} source
 * @returns {String}
 * @private
 */
function normalizeJsonc(source) {
    const
        withoutComments = [],
        length          = source.length;
    let
        cursor   = 0,
        inString = false,
        escaped  = false;

    while (cursor < length) {
        const character = source[cursor];

        if (inString) {
            withoutComments.push(character);

            if (escaped) {
                escaped = false
            } else if (character === '\\') {
                escaped = true
            } else if (character === '"') {
                inString = false
            }

            cursor++;
            continue
        }

        if (character === '"') {
            inString = true;
            withoutComments.push(character);
            cursor++;
            continue
        }

        if (source.startsWith('//', cursor)) {
            while (cursor < length && source[cursor] !== '\n') {
                withoutComments.push(' ');
                cursor++
            }
            continue
        }

        if (source.startsWith('/*', cursor)) {
            const end = source.indexOf('*/', cursor + 2);

            if (end < 0) throw new SyntaxError('Unterminated JSONC block comment.');

            while (cursor < end + 2) {
                withoutComments.push(source[cursor] === '\n' ? '\n' : ' ');
                cursor++
            }
            continue
        }

        withoutComments.push(character);
        cursor++
    }

    const
        normalized = withoutComments.join(''),
        output     = normalized.split('');

    inString = false;
    escaped  = false;

    for (cursor = 0; cursor < normalized.length; cursor++) {
        const character = normalized[cursor];

        if (inString) {
            if (escaped) {
                escaped = false
            } else if (character === '\\') {
                escaped = true
            } else if (character === '"') {
                inString = false
            }
            continue
        }

        if (character === '"') {
            inString = true;
            continue
        }

        if (character === ',') {
            let lookahead = cursor + 1;

            while (/\s/.test(normalized[lookahead])) lookahead++;
            if (normalized[lookahead] === '}' || normalized[lookahead] === ']') output[cursor] = ' '
        }
    }

    return output.join('')
}

/** @private */
function findJsonObjectRange(source) {
    const start = skipJsonTrivia(source, 0);

    if (source[start] !== '{') return null;

    return {start, end: scanJsonValueEnd(source, start)}
}

/** @private */
function findDirectJsonProperty(source, objectRange, propertyName) {
    if (!objectRange || source[objectRange.start] !== '{') return null;

    let cursor = objectRange.start + 1;

    while (cursor < objectRange.end) {
        cursor = skipJsonTrivia(source, cursor);
        if (source[cursor] === ',') {
            cursor++;
            continue
        }
        if (source[cursor] === '}') return null;
        if (source[cursor] !== '"') return null;

        const keyEnd = scanJsonStringEnd(source, cursor);
        const key    = JSON.parse(source.slice(cursor, keyEnd));

        cursor = skipJsonTrivia(source, keyEnd);
        if (source[cursor] !== ':') return null;

        const valueStart = skipJsonTrivia(source, cursor + 1);
        const valueEnd   = scanJsonValueEnd(source, valueStart);

        if (key === propertyName) {
            return {valueStart, valueEnd}
        }

        cursor = valueEnd
    }

    return null
}

/** @private */
function skipJsonTrivia(source, start) {
    let cursor = start;

    while (cursor < source.length) {
        if (/\s/.test(source[cursor])) {
            cursor++;
        } else if (source.startsWith('//', cursor)) {
            cursor = source.indexOf('\n', cursor + 2);
            if (cursor < 0) return source.length;
        } else if (source.startsWith('/*', cursor)) {
            const end = source.indexOf('*/', cursor + 2);
            if (end < 0) return source.length;
            cursor = end + 2
        } else {
            break
        }
    }

    return cursor
}

/** @private */
function scanJsonStringEnd(source, start) {
    let escaped = false;

    for (let cursor = start + 1; cursor < source.length; cursor++) {
        const character = source[cursor];

        if (escaped) {
            escaped = false
        } else if (character === '\\') {
            escaped = true
        } else if (character === '"') {
            return cursor + 1
        }
    }

    return source.length
}

/** @private */
function scanJsonValueEnd(source, start) {
    if (source[start] === '"') return scanJsonStringEnd(source, start);

    if (source[start] === '{' || source[start] === '[') {
        const stack = [source[start] === '{' ? '}' : ']'];

        for (let cursor = start + 1; cursor < source.length; cursor++) {
            if (source[cursor] === '"') {
                cursor = scanJsonStringEnd(source, cursor) - 1;
                continue
            }
            if (source.startsWith('//', cursor)) {
                const end = source.indexOf('\n', cursor + 2);
                if (end < 0) return source.length;
                cursor = end;
                continue
            }
            if (source.startsWith('/*', cursor)) {
                const end = source.indexOf('*/', cursor + 2);
                if (end < 0) return source.length;
                cursor = end + 1;
                continue
            }
            if (source[cursor] === '{') {
                stack.push('}')
            } else if (source[cursor] === '[') {
                stack.push(']')
            } else if (source[cursor] === stack.at(-1)) {
                stack.pop();
                if (!stack.length) return cursor + 1
            }
        }

        return source.length
    }

    let cursor = start;
    while (cursor < source.length &&
        source[cursor] !== ',' &&
        source[cursor] !== '}' &&
        source[cursor] !== ']' &&
        !source.startsWith('//', cursor) &&
        !source.startsWith('/*', cursor)) cursor++;
    return cursor
}

/** @private */
function transportDivergence(filePath, ownedKeys, reason) {
    return new ManagedWorkspacePreparationError(
        `prepareManagedAgentWorkspace: refusing unauthenticated MCP transport transition at '${filePath}' (${reason}).`,
        {
            code    : 'FLEET_WORKSPACE_DIVERGENT',
            artifact: {path: filePath, status: WORKSPACE_ARTIFACT_STATES.DIVERGENT, ownedKeys, reason}
        }
    )
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
