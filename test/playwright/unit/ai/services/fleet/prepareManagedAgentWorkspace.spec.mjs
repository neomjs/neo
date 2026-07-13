import {test, expect} from '@playwright/test';
import fs             from 'node:fs/promises';
import os             from 'node:os';
import path           from 'node:path';
import {
    ManagedWorkspacePreparationError,
    WORKSPACE_ARTIFACT_STATES,
    prepareManagedAgentWorkspace
} from '../../../../../../ai/services/fleet/prepareManagedAgentWorkspace.mjs';

// Temp-filesystem contract tests: the real artifact writer runs, while checkout hydration is an
// injected recorder. `hydrateCurrentWorktree` has its own real temp-checkout suite; this spec proves
// the new composer calls that existing primitive at the right boundary without invoking its CLI,
// install, or build path.

const TEMPLATE = `# local project policy
project_doc_max_bytes = 131072

[mcp_servers."neo-mjs-memory-core"]
command = "npm"
args = ["run", "old"]
enabled = true

[features]
hooks = true
`;

const NODE_PATH = process.execPath;

const MCP_ENTRYPOINTS = [
    'ai/mcp/server/memory-core/mcp-server.mjs',
    'ai/mcp/server/knowledge-base/mcp-server.mjs',
    'ai/mcp/server/neural-link/mcp-server.mjs',
    'ai/mcp/server/github-workflow/mcp-server.mjs',
    'ai/mcp/server/gitlab-workflow/mcp-server.mjs'
];

let root, mainCheckout, repoRoot, instanceRoot, hydrationCalls;

test.beforeEach(async () => {
    root          = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-fleet-workspace-'));
    mainCheckout  = path.join(root, 'installed-neo');
    repoRoot      = path.join(root, 'managed-repos');
    instanceRoot  = path.join(root, 'instances');
    hydrationCalls = [];

    await fs.mkdir(path.join(mainCheckout, '.codex'), {recursive: true});
    await fs.writeFile(path.join(mainCheckout, '.codex', 'config.template.toml'), TEMPLATE, 'utf8');
    for (const relativePath of MCP_ENTRYPOINTS) {
        const filePath = path.join(mainCheckout, relativePath);
        await fs.mkdir(path.dirname(filePath), {recursive: true});
        await fs.writeFile(filePath, '// installed canonical entrypoint\n', 'utf8');
    }
});

test.afterEach(async () => {
    await fs.rm(root, {recursive: true, force: true});
});

function makeAgent(harnessType, {id = 'agent-a', mcpServers = null} = {}) {
    return {id, githubUsername: 'shared-login', harnessType, mcpServers};
}

function makeHydrate() {
    return async args => {
        hydrationCalls.push(args);
        await fs.mkdir(args.projectRoot, {recursive: true});
        return {hydrated: true};
    };
}

function options(agent, repoName = agent.id) {
    return {
        agent,
        repoPath        : path.join(repoRoot, repoName),
        instanceRoot,
        mainCheckout,
        nodePath        : NODE_PATH,
        hydrateWorkspace: makeHydrate()
    };
}

async function read(filePath) {
    return fs.readFile(filePath, 'utf8');
}

test.describe('prepareManagedAgentWorkspace', () => {
    test('Codex: hydrate → project MCP projection + isolated home policy, all CREATED', async () => {
        const
            opts              = options(makeAgent('codex')),
            result            = await prepareManagedAgentWorkspace(opts),
            projectConfigPath = path.join(opts.repoPath, '.codex', 'config.toml'),
            homeConfigPath    = path.join(result.instanceHome, 'config.toml'),
            memoriesPath      = path.join(result.instanceHome, 'memories'),
            projectConfig     = await read(projectConfigPath),
            homeConfig        = await read(homeConfigPath);

        expect(hydrationCalls).toHaveLength(1);
        expect(hydrationCalls[0]).toMatchObject({mainCheckout, projectRoot: opts.repoPath});
        expect(result.repoPath).toBe(opts.repoPath);
        expect(result.hydration).toEqual({hydrated: true});
        expect(result.artifacts.map(item => item.status)).toEqual([
            WORKSPACE_ARTIFACT_STATES.CREATED,
            WORKSPACE_ARTIFACT_STATES.CREATED,
            WORKSPACE_ARTIFACT_STATES.CREATED
        ]);

        // Fresh managed clones have no dependencies: every executable comes from the installed
        // checkout, while Neural Link receives the managed repo as its explicit project cwd.
        expect(projectConfig).toContain(`command = ${JSON.stringify(NODE_PATH)}`);
        expect(projectConfig).toContain(path.join(mainCheckout, 'ai/mcp/server/memory-core/mcp-server.mjs'));
        expect(projectConfig).toContain(JSON.stringify(['--cwd', opts.repoPath]).slice(1, -1));
        expect(projectConfig).not.toContain('command = "npm"');
        await expect(fs.stat(path.join(opts.repoPath, 'node_modules'))).rejects.toMatchObject({code: 'ENOENT'});

        // All catalog keys are projected from current defaults; optional workflows remain disabled.
        expect(projectConfig.match(/^\[mcp_servers\./gm)).toHaveLength(5);
        expect(projectConfig).toMatch(/\[mcp_servers\."neo-mjs-github-workflow"\][\s\S]*?enabled = false/);
        expect(projectConfig).toMatch(/\[mcp_servers\."neo-mjs-gitlab-workflow"\][\s\S]*?enabled = false/);
        expect(homeConfig).toContain('cli_auth_credentials_store = "file"');
        expect(homeConfig).toContain('mcp_oauth_credentials_store = "file"');
        expect(homeConfig).toContain('memories = true');
        expect((await fs.stat(memoriesPath)).isDirectory()).toBe(true);
        expect((await fs.stat(homeConfigPath)).mode & 0o777).toBe(0o600);
    });

    test('re-entry reports MATCH and ignores unrelated operator-owned TOML tables/keys', async () => {
        const opts        = options(makeAgent('codex'));
        const first       = await prepareManagedAgentWorkspace(opts);
        const projectPath = path.join(opts.repoPath, '.codex', 'config.toml');
        const homePath    = path.join(first.instanceHome, 'config.toml');

        await fs.appendFile(projectPath, '\n[mcp_servers."operator-local"]\ncommand = "custom"\n', 'utf8');
        await fs.appendFile(homePath, '\n[operator]\nkeep = true\n', 'utf8');

        const second = await prepareManagedAgentWorkspace(opts);

        expect(second.artifacts.map(item => item.status)).toEqual([
            WORKSPACE_ARTIFACT_STATES.MATCH,
            WORKSPACE_ARTIFACT_STATES.MATCH,
            WORKSPACE_ARTIFACT_STATES.MATCH
        ]);
        expect(await read(projectPath)).toContain('[mcp_servers."operator-local"]');
        expect(await read(homePath)).toContain('[operator]');
    });

    test('divergent owned content refuses without overwrite and exposes only bounded metadata', async () => {
        const opts      = options(makeAgent('codex'));
        const first     = await prepareManagedAgentWorkspace(opts);
        const homePath  = path.join(first.instanceHome, 'config.toml');
        const divergent = (await read(homePath)).replace('memories = true', 'memories = false');

        await fs.writeFile(homePath, divergent, 'utf8');

        let error;
        try {
            await prepareManagedAgentWorkspace(opts);
        } catch (caught) {
            error = caught;
        }

        expect(error).toBeInstanceOf(ManagedWorkspacePreparationError);
        expect(error.code).toBe('FLEET_WORKSPACE_DIVERGENT');
        expect(error.artifact).toMatchObject({
            path     : homePath,
            status   : WORKSPACE_ARTIFACT_STATES.DIVERGENT,
            ownedKeys: 'cli_auth_credentials_store,mcp_oauth_credentials_store,features.memories'
        });
        expect(error.artifact).not.toHaveProperty('actual');
        expect(error.artifact).not.toHaveProperty('desired');
        expect(await read(homePath)).toBe(divergent);
    });

    test('two residents sharing one GitHub identity have disjoint Codex auth/memory homes', async () => {
        const
            a = await prepareManagedAgentWorkspace(options(makeAgent('codex', {id: 'resident-a'}))),
            b = await prepareManagedAgentWorkspace(options(makeAgent('codex', {id: 'resident-b'})));

        expect(a.instanceHome).not.toBe(b.instanceHome);
        expect(path.join(a.instanceHome, 'config.toml')).not.toBe(path.join(b.instanceHome, 'config.toml'));
        expect(path.join(a.instanceHome, 'memories')).not.toBe(path.join(b.instanceHome, 'memories'));
        expect((await fs.stat(path.join(a.instanceHome, 'memories'))).isDirectory()).toBe(true);
        expect((await fs.stat(path.join(b.instanceHome, 'memories'))).isDirectory()).toBe(true);
    });

    test('Codex Desktop keeps its auth/memory policy inside the nested codex-home', async () => {
        const
            opts     = options(makeAgent('codex-desktop')),
            result   = await prepareManagedAgentWorkspace(opts),
            authHome = path.join(result.instanceHome, 'codex-home');

        expect(await read(path.join(authHome, 'config.toml'))).toContain('features');
        expect((await fs.stat(path.join(authHome, 'memories'))).isDirectory()).toBe(true);
        await expect(fs.stat(path.join(result.instanceHome, 'config.toml'))).rejects.toMatchObject({code: 'ENOENT'});
    });

    test('a symlinked resident-home segment fails before hydration or artifact writes', async () => {
        const
            opts        = options(makeAgent('codex')),
            foreignHome = path.join(root, 'foreign-resident-home'),
            agentRoot   = path.join(instanceRoot, 'agent-a');

        opts.deriveInstanceHome = () => path.join(agentRoot, 'codex');
        await fs.mkdir(foreignHome, {recursive: true});
        await fs.mkdir(instanceRoot, {recursive: true});
        await fs.symlink(foreignHome, agentRoot, 'dir');

        await expect(prepareManagedAgentWorkspace(opts)).rejects.toMatchObject({
            code    : 'FLEET_WORKSPACE_DIVERGENT',
            artifact: {path: agentRoot, reason: 'symlinked resident-owned path segment'}
        });
        expect(hydrationCalls).toHaveLength(0);
    });

    test('a symlinked instance root fails before hydration or artifact writes', async () => {
        const
            opts        = options(makeAgent('codex')),
            foreignRoot = path.join(root, 'foreign-instance-root');

        await fs.mkdir(foreignRoot, {recursive: true});
        await fs.symlink(foreignRoot, instanceRoot, 'dir');

        await expect(prepareManagedAgentWorkspace(opts)).rejects.toMatchObject({
            code    : 'FLEET_WORKSPACE_DIVERGENT',
            artifact: {path: instanceRoot, reason: 'trusted root is not a real directory'}
        });
        expect(hydrationCalls).toHaveLength(0);
    });

    test('resident node_modules stays outside the owned artifact set', async () => {
        const
            opts        = options(makeAgent('codex')),
            foreignDeps = path.join(root, 'foreign-resident', 'node_modules');

        await fs.mkdir(foreignDeps, {recursive: true});
        await fs.mkdir(opts.repoPath, {recursive: true});
        await fs.symlink(foreignDeps, path.join(opts.repoPath, 'node_modules'), 'dir');

        const result = await prepareManagedAgentWorkspace(opts);

        expect(result.artifacts.every(item => item.ownedKeys !== 'dependency-root')).toBe(true);
        expect(path.resolve(path.dirname(path.join(opts.repoPath, 'node_modules')), await fs.readlink(path.join(opts.repoPath, 'node_modules'))))
            .toBe(foreignDeps);
    });

    test('raw launch overrides and missing executables fail before a launchable config exists', async () => {
        const raw = options(makeAgent('codex'));
        raw.agent.metadata = {launch: {command: '/custom'}};

        await expect(prepareManagedAgentWorkspace(raw)).rejects.toMatchObject({
            code: 'FLEET_WORKSPACE_UNSUPPORTED'
        });
        expect(hydrationCalls).toHaveLength(0);

        const missingNode = options(makeAgent('codex'), 'missing-node');
        missingNode.nodePath = path.join(root, 'absent-node');
        await expect(prepareManagedAgentWorkspace(missingNode)).rejects.toMatchObject({
            code: 'FLEET_WORKSPACE_UNSUPPORTED'
        });
        await expect(fs.stat(path.join(missingNode.repoPath, '.codex', 'config.toml'))).rejects.toMatchObject({code: 'ENOENT'});

        const missingEntrypoint = options(makeAgent('codex'), 'missing-entrypoint');
        await fs.rm(path.join(mainCheckout, MCP_ENTRYPOINTS[0]));
        await expect(prepareManagedAgentWorkspace(missingEntrypoint)).rejects.toMatchObject({
            code: 'FLEET_WORKSPACE_UNSUPPORTED'
        });
        await expect(fs.stat(path.join(missingEntrypoint.repoPath, '.codex', 'config.toml'))).rejects.toMatchObject({code: 'ENOENT'});
    });

    test('directory-valued Node and MCP entrypoint paths fail executable preflight', async () => {
        const directoryNode = options(makeAgent('codex'), 'directory-node');
        directoryNode.nodePath = root;

        await expect(prepareManagedAgentWorkspace(directoryNode)).rejects.toMatchObject({
            code: 'FLEET_WORKSPACE_UNSUPPORTED'
        });

        const directoryEntrypoint = options(makeAgent('codex'), 'directory-entrypoint');
        const directoryPath       = path.join(mainCheckout, MCP_ENTRYPOINTS[0]);
        await fs.rm(directoryPath);
        await fs.mkdir(directoryPath);

        await expect(prepareManagedAgentWorkspace(directoryEntrypoint)).rejects.toMatchObject({
            code: 'FLEET_WORKSPACE_UNSUPPORTED'
        });
    });

    test('Claude Code: strict home JSON stores env references, never dynamic secret values', async () => {
        const originalBridgeToken = process.env.NEO_FLEET_BRIDGE_TOKEN;
        process.env.NEO_FLEET_BRIDGE_TOKEN = 'secret-token-value';

        const opts = options(makeAgent('claude-code'));
        let result;
        try {
            result = await prepareManagedAgentWorkspace(opts);
        } finally {
            if (originalBridgeToken === undefined) delete process.env.NEO_FLEET_BRIDGE_TOKEN;
            else process.env.NEO_FLEET_BRIDGE_TOKEN = originalBridgeToken;
        }

        const
            configPath = path.join(result.instanceHome, 'mcp-config.json'),
            raw        = await read(configPath),
            config     = JSON.parse(raw),
            nl         = config.mcpServers['neo-mjs-neural-link'];

        expect(Object.keys(config.mcpServers).sort()).toEqual([
            'neo-mjs-knowledge-base',
            'neo-mjs-memory-core',
            'neo-mjs-neural-link'
        ]);
        expect(nl.command).toBe(NODE_PATH);
        expect(nl.args).toEqual([
            path.join(mainCheckout, 'ai/mcp/server/neural-link/mcp-server.mjs'),
            '--cwd',
            opts.repoPath
        ]);
        expect(nl.env).toEqual({
            NEO_AGENT_IDENTITY         : '${NEO_AGENT_IDENTITY}',
            NEO_FLEET_BRIDGE_TOKEN     : '${NEO_FLEET_BRIDGE_TOKEN}',
            NEO_NL_TOOL_PROJECTION_MODE: '${NEO_NL_TOOL_PROJECTION_MODE}'
        });
        expect(raw).not.toContain('secret-token-value');
        await expect(fs.stat(path.join(opts.repoPath, '.mcp.json'))).rejects.toMatchObject({code: 'ENOENT'});
    });

    test('Claude Desktop: default profile includes Neural Link without persisting its optional Bridge token', async () => {
        const originalBridgeToken = process.env.NEO_FLEET_BRIDGE_TOKEN;
        process.env.NEO_FLEET_BRIDGE_TOKEN = 'secret-token-value';

        const opts = options(makeAgent('claude-desktop'));
        let result;
        try {
            result = await prepareManagedAgentWorkspace(opts);
        } finally {
            if (originalBridgeToken === undefined) delete process.env.NEO_FLEET_BRIDGE_TOKEN;
            else process.env.NEO_FLEET_BRIDGE_TOKEN = originalBridgeToken;
        }

        const
            configPath = path.join(result.instanceHome, 'claude_desktop_config.json'),
            raw        = await read(configPath),
            nl         = JSON.parse(raw).mcpServers['neo-mjs-neural-link'];

        expect(nl.env).toEqual({
            NEO_AGENT_IDENTITY         : 'agent-a',
            NEO_NL_TOOL_PROJECTION_MODE: 'harness-embedded'
        });
        expect(raw).not.toContain('NEO_FLEET_BRIDGE_TOKEN');
        expect(raw).not.toContain('secret-token-value');
    });

    test('Claude Desktop: a secret-free matrix materializes the exact contained profile config', async () => {
        const
            opts       = options(makeAgent('claude-desktop', {mcpServers: {'neural-link': false}})),
            result     = await prepareManagedAgentWorkspace(opts),
            configPath = path.join(result.instanceHome, 'claude_desktop_config.json'),
            config     = JSON.parse(await read(configPath));

        expect(result.artifacts).toEqual([
            {
                path     : configPath,
                status   : WORKSPACE_ARTIFACT_STATES.CREATED,
                ownedKeys: 'mcpServers.neo-mjs-*'
            }
        ]);
        expect(Object.keys(config.mcpServers).sort()).toEqual([
            'neo-mjs-knowledge-base',
            'neo-mjs-memory-core'
        ]);
        expect(config.mcpServers['neo-mjs-memory-core'].env).toEqual({NEO_AGENT_IDENTITY: 'agent-a'});
    });

    test('Claude Desktop refuses an enabled server whose startup requires secret env', async () => {
        const opts = options(makeAgent('claude-desktop', {mcpServers: {'github-workflow': true}}));

        await expect(prepareManagedAgentWorkspace(opts)).rejects.toMatchObject({
            code: 'FLEET_WORKSPACE_UNSUPPORTED'
        });
        expect(hydrationCalls).toHaveLength(0);
        await expect(fs.stat(instanceRoot)).rejects.toMatchObject({code: 'ENOENT'});
    });

    test('Antigravity and unprovisioned GitLab credential authority fail before hydration', async () => {
        await expect(prepareManagedAgentWorkspace(options(makeAgent('antigravity')))).rejects.toMatchObject({
            code: 'FLEET_WORKSPACE_UNSUPPORTED'
        });
        await expect(prepareManagedAgentWorkspace(options(makeAgent('codex', {
            mcpServers: {'gitlab-workflow': true}
        }), 'gitlab-agent'))).rejects.toMatchObject({code: 'FLEET_WORKSPACE_UNSUPPORTED'});

        expect(hydrationCalls).toHaveLength(0);
        await expect(fs.stat(path.join(repoRoot, 'agent-a', '.gemini', 'settings.json'))).rejects.toMatchObject({code: 'ENOENT'});
    });

    test('required arguments fail loud before any hydration', async () => {
        await expect(prepareManagedAgentWorkspace()).rejects.toThrow(/agent/);
        await expect(prepareManagedAgentWorkspace({
            ...options(makeAgent('codex')),
            repoPath: 'relative/repo'
        })).rejects.toThrow(/repoPath.*absolute/);
        expect(hydrationCalls).toHaveLength(0);
    });
});
