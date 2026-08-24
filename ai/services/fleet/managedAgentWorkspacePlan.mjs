import path from 'node:path';
import {
    MCP_SERVERS,
    REMOTE_MCP_CREDENTIAL_ENV_VAR,
    supportsTenantMcpTarget
} from './mcpServers.mjs';
import {LAUNCHABLE_HARNESS_TYPES} from './deriveHarnessLaunchSpec.mjs';

const NEO_MCP_NAME_PREFIX = 'neo-mjs-';

/**
 * @summary Curated, installed-checkout-relative MCP execution vocabulary. The Body-safe catalog remains the
 * durable key/default authority; this pure sibling adds no host binding, environment read, command,
 * or credential value. The host apply edge consumes the relative entrypoint only after validating a
 * logical plan produced here.
 * @type {Readonly<Object<String, Object>>}
 */
export const MANAGED_WORKSPACE_MCP_SERVER_DESCRIPTORS = Object.freeze({
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
        if (!MANAGED_WORKSPACE_MCP_SERVER_DESCRIPTORS[key]) {
            throw new Error(`managedAgentWorkspacePlan: MCP catalog key '${key}' has no executable descriptor.`)
        }
    }
    for (const key of Object.keys(MANAGED_WORKSPACE_MCP_SERVER_DESCRIPTORS)) {
        if (!catalogKeys.has(key)) {
            throw new Error(`managedAgentWorkspacePlan: executable descriptor '${key}' is absent from the shared MCP catalog.`)
        }
    }
}

/**
 * @typedef {Object} ManagedAgentWorkspacePlanInput
 * @property {{id: String, harnessType: String}} agent Closed opaque seat + harness intent.
 * @property {Object<String, Boolean>} mcpMatrix Complete canonical MCP enablement matrix.
 * @property {Object|null} [mcpTarget=null] Closed non-secret tenant resource intent.
 */

/**
 * @typedef {Object} ManagedAgentWorkspaceMcpPlan
 * @property {String} key Canonical MCP catalog key.
 * @property {String} name Curated harness-facing server name.
 * @property {Boolean} enabled Whether the server is enabled for this seat.
 * @property {'resident'|'tenant'} target Resource ownership intent.
 * @property {'stdio'|'streamable-http'} transport Curated transport intent.
 * @property {String|null} entrypoint Repository-relative curated entrypoint.
 * @property {String|null} url Public remote resource URL.
 * @property {String|null} credentialEnvVar Credential slot name, never its value.
 * @property {String[]} runtimeEnv Child-runtime environment slot names.
 * @property {String[]} requiredRuntimeEnv Required child-runtime environment slot names.
 * @property {String[]} secretEnv Secret-bearing child-runtime environment slot names.
 */

/**
 * @typedef {Object} ManagedAgentWorkspacePlan
 * @property {{id: String, harnessType: String}} agent Closed opaque seat + harness intent.
 * @property {String} artifactProfile Curated harness artifact profile.
 * @property {Object<String, Boolean>} mcpMatrix Complete canonical MCP enablement matrix.
 * @property {ManagedAgentWorkspaceMcpPlan[]} mcpServers Closed logical MCP plan.
 */

const
    LOGICAL_INPUT_KEYS       = Object.freeze(['agent', 'mcpMatrix', 'mcpTarget']),
    LOGICAL_AGENT_KEYS       = Object.freeze(['id', 'harnessType']),
    MCP_TARGET_KEYS          = Object.freeze(['kind', 'credentialEnvVar', 'resources']),
    MCP_TARGET_RESOURCE_KEYS = Object.freeze(['memory-core', 'knowledge-base']),
    MCP_RESOURCE_KEYS        = Object.freeze(['url']),
    FORBIDDEN_LOGICAL_FIELDS = new Set([
        'args',
        'auth',
        'authorization',
        'bearer',
        'command',
        'credential',
        'cwd',
        'grant',
        'grants',
        'agentosRuntimeRoot',
        'instanceRoot',
        'mainCheckout',
        'nodePath',
        'owner',
        'ownerPrincipal',
        'repoPath',
        'targetRepoRoot',
        'secret',
        'token'
    ].map(key => key.toLowerCase()));

/**
 * @summary Create the deterministic, host-path-free workspace intent consumed by the Fleet host
 * apply edge. Input and output are closed schemas: this module imports no filesystem, environment,
 * process, or global configuration and the function emits no owner/grant, command, absolute path,
 * or credential value. Every returned array and object is recursively frozen.
 * @param {ManagedAgentWorkspacePlanInput} [input]
 * @returns {ManagedAgentWorkspacePlan}
 * @throws {TypeError} For missing, unknown, malformed, accessor, forbidden, or absolute-path input.
 * @throws {RangeError} For unsupported harness, MCP, or transport combinations.
 */
export function createManagedAgentWorkspacePlan(input={}) {
    assertSafeLogicalTree(input, 'input');
    assertExactRecord(input, 'input', LOGICAL_INPUT_KEYS, ['agent', 'mcpMatrix']);

    const
        agent      = normalizeLogicalAgent(input.agent),
        mcpMatrix  = normalizeLogicalMcpMatrix(input.mcpMatrix),
        mcpTarget  = normalizeLogicalMcpTarget(Object.hasOwn(input, 'mcpTarget') ? input.mcpTarget : null),
        mcpServers = MCP_SERVERS.map(entry => {
            const
                descriptor = MANAGED_WORKSPACE_MCP_SERVER_DESCRIPTORS[entry.key],
                resource   = mcpTarget?.resources[entry.key];

            return {
                key               : entry.key,
                name              : `${NEO_MCP_NAME_PREFIX}${entry.key}`,
                enabled           : mcpMatrix[entry.key],
                target            : resource ? 'tenant' : 'resident',
                transport         : resource ? 'streamable-http' : 'stdio',
                entrypoint        : descriptor.entrypoint ?? null,
                url               : resource?.url ?? null,
                credentialEnvVar  : resource ? mcpTarget.credentialEnvVar : null,
                runtimeEnv        : [...descriptor.runtimeEnv],
                requiredRuntimeEnv: [...descriptor.requiredRuntimeEnv],
                secretEnv         : [...(descriptor.secretEnv || [])]
            }
        });

    assertLogicalHarnessSupported({agent, mcpServers});

    return freezeRecursively({
        agent,
        artifactProfile: agent.harnessType,
        mcpMatrix,
        mcpServers
    })
}

/** @private */
function normalizeLogicalAgent(agent) {
    assertExactRecord(agent, 'agent', LOGICAL_AGENT_KEYS);
    assertLogicalString(agent.id, 'agent.id');
    assertLogicalString(agent.harnessType, 'agent.harnessType');

    return {id: agent.id, harnessType: agent.harnessType}
}

/** @private */
function normalizeLogicalMcpMatrix(matrix) {
    const keys = MCP_SERVERS.map(entry => entry.key);

    assertExactRecord(matrix, 'mcpMatrix', keys);

    const result = {};
    for (const key of keys) {
        if (typeof matrix[key] !== 'boolean') {
            throw new TypeError(`createManagedAgentWorkspacePlan: 'mcpMatrix.${key}' must be boolean.`)
        }
        result[key] = matrix[key]
    }

    return result
}

/** @private */
function normalizeLogicalMcpTarget(target) {
    if (target === null) return null;

    assertExactRecord(target, 'mcpTarget', MCP_TARGET_KEYS);
    if (target.kind !== 'tenant') {
        throw new TypeError("createManagedAgentWorkspacePlan: 'mcpTarget.kind' must be 'tenant'.")
    }
    if (target.credentialEnvVar !== REMOTE_MCP_CREDENTIAL_ENV_VAR) {
        throw new TypeError(`createManagedAgentWorkspacePlan: 'mcpTarget.credentialEnvVar' must name '${REMOTE_MCP_CREDENTIAL_ENV_VAR}'.`)
    }
    assertExactRecord(target.resources, 'mcpTarget.resources', MCP_TARGET_RESOURCE_KEYS);

    const
        suffixes = {
            'memory-core'   : '/mc/mcp',
            'knowledge-base': '/kb/mcp'
        },
        resources = {};
    let deploymentBase = null;

    for (const key of MCP_TARGET_RESOURCE_KEYS) {
        const resource = target.resources[key];
        let   url;

        assertExactRecord(resource, `mcpTarget.resources.${key}`, MCP_RESOURCE_KEYS);
        assertLogicalString(resource.url, `mcpTarget.resources.${key}.url`);

        try {
            url = new URL(resource.url)
        } catch {
            throw new TypeError(`createManagedAgentWorkspacePlan: remote MCP resource '${key}' has a malformed URL.`)
        }

        const suffix = suffixes[key];
        if (!['http:', 'https:'].includes(url.protocol) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            !url.pathname.endsWith(suffix)) {
            throw new TypeError(`createManagedAgentWorkspacePlan: remote MCP resource '${key}' has a malformed URL.`)
        }

        const candidateBase = `${url.origin}${url.pathname.slice(0, -suffix.length)}`;
        if (deploymentBase !== null && deploymentBase !== candidateBase) {
            throw new TypeError('createManagedAgentWorkspacePlan: remote MCP resources must share one canonical deployment base.')
        }

        deploymentBase = candidateBase;
        resources[key] = {url: resource.url}
    }

    return {
        kind            : 'tenant',
        credentialEnvVar: target.credentialEnvVar,
        resources
    }
}

/** @private */
function assertLogicalHarnessSupported({agent, mcpServers}) {
    if (!LAUNCHABLE_HARNESS_TYPES.includes(agent.harnessType)) {
        throw new RangeError(`createManagedAgentWorkspacePlan: harness '${agent.harnessType}' has no launch/workspace adapter.`)
    }

    if (mcpServers.some(server => server.target === 'tenant') &&
        !supportsTenantMcpTarget(agent.harnessType)) {
        throw new RangeError(`createManagedAgentWorkspacePlan: harness '${agent.harnessType}' has no proven secret-safe tenant MCP grammar.`)
    }

    const catalogUnsupported = mcpServers.find(server =>
        server.enabled && MANAGED_WORKSPACE_MCP_SERVER_DESCRIPTORS[server.key].unsupportedReason);
    if (catalogUnsupported) {
        throw new RangeError(
            `createManagedAgentWorkspacePlan: MCP server '${catalogUnsupported.key}' is enabled but unsupported: ` +
            MANAGED_WORKSPACE_MCP_SERVER_DESCRIPTORS[catalogUnsupported.key].unsupportedReason
        )
    }

    if (agent.harnessType === 'antigravity') {
        throw new RangeError('createManagedAgentWorkspacePlan: Antigravity 2.x exposes no proven contained per-resident MCP configuration root.')
    }

    if (agent.harnessType === 'claude-desktop') {
        const secretServer = mcpServers.find(server => server.enabled &&
            server.requiredRuntimeEnv.some(name => server.secretEnv.includes(name)));
        if (secretServer) {
            throw new RangeError(
                `createManagedAgentWorkspacePlan: Claude Desktop cannot represent startup-required Fleet secret env for enabled MCP server '${secretServer.key}' without persisting secret bytes.`
            )
        }
    }
}

/** @private */
function assertSafeLogicalTree(value, label, ancestors=new WeakSet()) {
    if (typeof value === 'string') {
        if (isPortableAbsolutePath(value)) {
            throw new TypeError(`createManagedAgentWorkspacePlan: '${label}' must not contain an absolute host path.`)
        }
        return
    }

    if (value === null || value === undefined || typeof value !== 'object') return;

    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`createManagedAgentWorkspacePlan: '${label}' must contain plain data only.`)
    }
    if (Object.getOwnPropertySymbols(value).length) {
        throw new TypeError(`createManagedAgentWorkspacePlan: '${label}' must not contain symbol fields.`)
    }
    if (ancestors.has(value)) {
        throw new TypeError(`createManagedAgentWorkspacePlan: '${label}' must not contain a reference cycle.`)
    }

    ancestors.add(value);

    try {
        for (const key of Object.keys(value)) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);

            if (!descriptor || descriptor.get || descriptor.set) {
                throw new TypeError(`createManagedAgentWorkspacePlan: '${label}.${key}' must be a data field, not an accessor.`)
            }
            if (FORBIDDEN_LOGICAL_FIELDS.has(key.toLowerCase())) {
                throw new TypeError(`createManagedAgentWorkspacePlan: forbidden logical field '${key}'.`)
            }

            assertSafeLogicalTree(descriptor.value, `${label}.${key}`, ancestors)
        }
    } finally {
        ancestors.delete(value)
    }
}

/** @private */
function assertExactRecord(value, label, allowedKeys, requiredKeys=allowedKeys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`createManagedAgentWorkspacePlan: '${label}' must be an object.`)
    }

    const
        unknown = Object.keys(value).find(key => !allowedKeys.includes(key)),
        missing = requiredKeys.find(key => !Object.hasOwn(value, key));

    if (unknown) {
        throw new TypeError(`createManagedAgentWorkspacePlan: unknown field '${label}.${unknown}'.`)
    }
    if (missing) {
        throw new TypeError(`createManagedAgentWorkspacePlan: missing field '${label}.${missing}'.`)
    }
}

/** @private */
function assertLogicalString(value, label) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`createManagedAgentWorkspacePlan: '${label}' must be a non-empty string.`)
    }
}

/** @private */
function isPortableAbsolutePath(value) {
    return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value)
}

/** @private */
function freezeRecursively(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;

    Object.values(value).forEach(freezeRecursively);
    return Object.freeze(value)
}

export default createManagedAgentWorkspacePlan;
