import {test, expect} from '@playwright/test';
import fs             from 'node:fs';

import {REMOTE_MCP_CREDENTIAL_ENV_VAR} from '../../../../../../ai/services/fleet/mcpServers.mjs';

const
    BRIDGE_ENTRYPOINT = 'ai/mcp/client/stdioToStreamableHttp.mjs',
    PLANE_SERVERS     = ['neo-mjs-memory-core', 'neo-mjs-knowledge-base'],
    STDIO_SERVERS     = ['neo-mjs-github-workflow', 'neo-mjs-neural-link'],
    SUFFIXES          = {'neo-mjs-memory-core': '/mc/mcp', 'neo-mjs-knowledge-base': '/kb/mcp'};

/** @summary Read one repo-root file as UTF-8. */
function readRepoFile(relativePath) {
    return fs.readFileSync(new URL(`../../../../../../${relativePath}`, import.meta.url), 'utf8')
}

/**
 * @summary The host port the container plane actually publishes, read from the Compose file rather
 * than restated here. A template pinned to a port Compose no longer binds is the silent-provisioning
 * failure this whole guard exists to catch. Scoped to the `ingress` service: several services publish
 * on loopback, and the first one in the file is Chroma.
 * @returns {String}
 */
function publishedIngressPort() {
    const
        compose = readRepoFile('ai/deploy/docker-compose.local-agent-os.yml'),
        block   = compose.split(/^ {2}(?=\S)/m).find(section => section.startsWith('ingress:'));

    expect(block, 'Compose no longer declares an ingress service').toBeTruthy();

    const match = block.match(/"127\.0\.0\.1:(\d+):\d+"/);

    expect(match, 'the ingress service no longer publishes a loopback host port').not.toBeNull();

    return match[1]
}

/**
 * @summary Extract one Codex MCP table: the header plus its contiguous key/value lines. Stops at a
 * blank line, a comment, or the next table, so neighbouring prose cannot be read as table content.
 * @param {String} source
 * @param {String} serverName
 * @returns {String}
 */
function codexTable(source, serverName) {
    const
        header = `[mcp_servers."${serverName}"]`,
        start  = source.indexOf(header);

    expect(start, `${serverName} table is absent`).toBeGreaterThan(-1);

    const lines = [];

    for (const line of source.slice(start + header.length).split('\n').slice(1)) {
        if (!line.trim() || line.startsWith('#') || line.startsWith('[')) break;
        lines.push(line)
    }

    return lines.join('\n')
}

/**
 * @summary Both hand-maintained provisioning templates against the surfaces that own their shape.
 *
 * The Fleet seat generators emit the remote form from code and cannot drift; these two files are
 * maintained by hand and can. Every assertion here is anchored to a live authority — the credential
 * slot to `ai/services/fleet/mcpServers.mjs`, the port to the Compose binding, the Claude Desktop bridge
 * to the entrypoint on disk — so a template that goes stale fails here rather than at a resident's
 * first tool call.
 */
test.describe('Provisioning templates (#16205)', () => {
    test('both templates name the one Fleet credential slot', () => {
        for (const relativePath of ['.codex/config.template.toml', '.claude/claude_desktop_config.example.json']) {
            expect(readRepoFile(relativePath), `${relativePath} drifted from the Fleet credential slot`)
                .toContain(REMOTE_MCP_CREDENTIAL_ENV_VAR)
        }
    });

    test('neither template carries a literal credential', () => {
        for (const relativePath of ['.codex/config.template.toml', '.claude/claude_desktop_config.example.json']) {
            const source = readRepoFile(relativePath);

            // The slot may appear only as a bare name: never assigned a value, never inlined after `Bearer `.
            expect(source, `${relativePath} assigns the credential slot a value`)
                .not.toMatch(new RegExp(`${REMOTE_MCP_CREDENTIAL_ENV_VAR}\\s*[=:]\\s*["']?\\S`));
            expect(source, `${relativePath} inlines a bearer value`).not.toMatch(/Bearer\s+(?!\$)\S/)
        }
    });

    test('the Codex template carries the native remote form for both plane servers', () => {
        const
            source = readRepoFile('.codex/config.template.toml'),
            port   = publishedIngressPort();

        for (const serverName of PLANE_SERVERS) {
            const table = codexTable(source, serverName);

            expect(table).toContain(`url = "http://127.0.0.1:${port}${SUFFIXES[serverName]}"`);
            expect(table).toContain(`bearer_token_env_var = "${REMOTE_MCP_CREDENTIAL_ENV_VAR}"`);

            // A remote table that kept any stdio key would launch a local server that no longer exists.
            for (const retired of ['command', 'args', 'env_vars']) {
                expect(table, `${serverName} kept the retired stdio key '${retired}'`)
                    .not.toMatch(new RegExp(`^${retired}\\s*=`, 'm'))
            }
        }

        // Positive control: the same extraction proves the stdio shape is still present and matchable,
        // so a passing assertion above cannot be a zero-match on a broken pattern.
        for (const serverName of STDIO_SERVERS) {
            expect(codexTable(source, serverName), `${serverName} should still be stdio`).toMatch(/^command\s*=/m)
        }
    });

    test('the Claude Desktop template bridges both plane servers through Neo\'s own entrypoint', () => {
        const
            servers = JSON.parse(readRepoFile('.claude/claude_desktop_config.example.json')).mcpServers,
            port    = publishedIngressPort();

        for (const serverName of PLANE_SERVERS) {
            const {args} = servers[serverName];

            // `--env-file` must stay first: it is a Node option, and Node only applies it ahead of the
            // script path. Behind the script path it becomes a script argument and the bearer never loads.
            expect(args[0], `${serverName} lost the leading --env-file`).toMatch(/^--env-file=/);
            expect(args[1], `${serverName} does not invoke Neo's bridge`).toContain(BRIDGE_ENTRYPOINT);
            expect(args).toContain(`http://127.0.0.1:${port}${SUFFIXES[serverName]}`);
            expect(args[args.indexOf('--token-env') + 1]).toBe(REMOTE_MCP_CREDENTIAL_ENV_VAR);

            // A third-party proxy would reintroduce the OAuth, cache, and package-download surface the
            // reviewed bridge deliberately has none of.
            expect(args.join(' '), `${serverName} routes through a third-party proxy`).not.toMatch(/mcp-remote|npx/)
        }

        // Positive control: the servers that are not on the plane still run their local stdio entrypoints.
        for (const serverName of STDIO_SERVERS) {
            expect(servers[serverName].args.join(' '), `${serverName} should still be stdio`)
                .toContain('mcp-server.mjs')
        }
    });

    test('the bridge the Claude Desktop template names exists in this checkout', () => {
        expect(fs.existsSync(new URL(`../../../../../../${BRIDGE_ENTRYPOINT}`, import.meta.url))).toBe(true)
    })
});
