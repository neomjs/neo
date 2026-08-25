import {test, expect}     from '@playwright/test';
import {execFileSync}     from 'node:child_process';
import fs                 from 'node:fs';
import path               from 'node:path';
import process            from 'node:process';
import {load as yamlLoad} from 'js-yaml';

const
    repoRoot      = path.resolve(process.cwd()),
    deployDir     = path.join(repoRoot, 'ai/deploy'),
    basePath      = path.join(deployDir, 'docker-compose.yml'),
    overlayPath   = path.join(deployDir, 'docker-compose.local-agent-os.yml'),
    baseSource    = fs.readFileSync(basePath, 'utf8'),
    overlaySource = fs.readFileSync(overlayPath, 'utf8'),
    cloudCaddy    = fs.readFileSync(path.join(deployDir, 'Caddyfile'), 'utf8'),
    localCaddy    = fs.readFileSync(path.join(deployDir, 'Caddyfile.local-agent-os'), 'utf8'),
    compose       = yamlLoad(baseSource),
    fleet         = compose.services['fleet-server'];

test.describe('optional Fleet server composition', () => {
    test('the base fleet profile owns one entrypoint, root, volume, secret, and authenticated healthcheck', () => {
        expect(fleet.profiles).toEqual(['fleet']);
        expect(fleet.build.args.SERVICE_ENTRYPOINT).toBe('ai/services/fleet/fleetServer.mjs');
        expect(fleet.environment).toContain('NEO_MCP_LISTEN_HOST=0.0.0.0');
        expect(fleet.environment).toContain('NEO_FLEET_DATA_DIR=/app/.neo-ai-data/fleet');
        expect(fleet.environment).toContain('NEO_AUTH_MODE=${NEO_AUTH_MODE:-github-pat}');
        expect(fleet.environment).toContain('NEO_AUTH_PROVIDER_BOOTSTRAP_PAT_FILE=/run/secrets/mcp-auth-token');
        expect(fleet.environment).toContain('NEO_MCP_HEALTHCHECK_TOKEN_FILE=/run/secrets/mcp-auth-token');
        // Restart-durable admission cache: fleet owns its path exclusively — the
        // one-writer-per-path deployment contract, pinned here so it cannot silently regress.
        expect(fleet.environment).toContain('NEO_AUTH_PAT_DISK_CACHE_PATH=/app/.neo-ai-data/auth/fleet-pat-validation-cache.json');
        expect(fleet.volumes).toEqual([
            'fleet-data:/app/.neo-ai-data/fleet',
            'auth-cache-data:/app/.neo-ai-data/auth'
        ]);
        expect(fleet.secrets).toEqual(['mcp-auth-token']);
        expect(fleet.expose).toEqual(['8083']);
        expect(fleet).not.toHaveProperty('ports');
        expect(compose.volumes).toHaveProperty('fleet-data');
        expect(compose.volumes).toHaveProperty('auth-cache-data');
        expect(compose.secrets['mcp-auth-token']).toEqual({environment: 'NEO_MCP_HEALTHCHECK_TOKEN'});
        expect(fleet.healthcheck.test).toContain('./ai/scripts/diagnostics/fleetHealthcheck.mjs');
        expect(fleet.healthcheck.test).toContain('/app/.neo-ai-data/fleet')
    });

    test('ingress stays independent of Fleet and both Caddy variants preserve exact paths', () => {
        expect(compose.services.ingress.depends_on).not.toContain('fleet-server');

        for (const source of [cloudCaddy, localCaddy]) {
            expect(source).toContain('@fleet path /fleet /fleet/probe');
            expect(source).toContain('reverse_proxy @fleet fleet-server:8083');
            expect(source).not.toMatch(/handle_path\s+\/fleet/);
            expect(source).toMatch(/handle_errors\s+502\s*\{[\s\S]*?respond @fleet 404/);
            expect(source).toMatch(/request_header -X-Preferred-Username[\s\S]*?@fleet path/);
            expect(source).toMatch(/respond 404\s*\n\s*\}/)
        }
    });

    test('the local profile elects Fleet without changing the ingress dependency gate', () => {
        expect(overlaySource).toMatch(/\n  fleet-server:\n    restart: unless-stopped/);
        expect(overlaySource).toMatch(/fleet-server:[\s\S]*?<<: \*local-auth/);
        expect(overlaySource).toMatch(/fleet-server:[\s\S]*?NEO_PUBLIC_URL: http:\/\/127\.0\.0\.1:3102\/fleet/);
        expect(overlaySource).toMatch(/fleet-server:[\s\S]*?secrets:\n      - mcp-auth-token/);

        const ingressBlock = overlaySource.split('\n  ingress:')[1];
        expect(ingressBlock).not.toMatch(/fleet-server:\s*\n\s+condition:/)
    });

    test('local MCP receivers admit only the Compose Host names their callers use', () => {
        let composeAvailable = true;

        try {
            execFileSync('docker', ['compose', 'version'], {stdio: 'ignore'})
        } catch {
            composeAvailable = false
        }

        if (!composeAvailable) {
            test.skip(true, 'docker compose CLI unavailable');
            return
        }

        const rendered = JSON.parse(execFileSync('docker', [
            'compose',
            '--env-file', '/dev/null',
            '-f', basePath,
            '-f', overlayPath,
            '--profile', 'cloud',
            '--profile', 'fleet',
            'config', '--format', 'json'
        ], {
            cwd     : repoRoot,
            encoding: 'utf8',
            env     : {
                PATH                      : process.env.PATH,
                NEO_MCP_AUTH_TOKEN_FILE   : '/dev/null',
                NEO_FLEET_PLANE_TOKEN_FILE: '/dev/null',
                NEO_DEPLOY_PROJECT_NAME   : 'neo-fleet-host-allowlist-spec'
            }
        }));

        const kbHosts = rendered.services['kb-server'].environment.NEO_MCP_ALLOWED_HOSTS,
              mcHosts = rendered.services['mc-server'].environment.NEO_MCP_ALLOWED_HOSTS;

        expect(kbHosts).toBe('kb-server');
        expect(mcHosts).toBe('mc-server,ingress');
        expect([kbHosts, mcHosts]).not.toContain('*')
    });

    test('Compose profile membership excludes Fleet headlessly and includes it only when selected', () => {
        let composeAvailable = true;

        try {
            execFileSync('docker', ['compose', 'version'], {stdio: 'ignore'})
        } catch {
            composeAvailable = false
        }

        if (!composeAvailable) {
            test.skip(true, 'docker compose CLI unavailable');
            return
        }

        const render = profiles => execFileSync('docker', [
            'compose',
            '--env-file', '/dev/null',
            '-f', basePath,
            ...profiles.flatMap(profile => ['--profile', profile]),
            'config', '--format', 'json'
        ], {
            cwd     : repoRoot,
            encoding: 'utf8',
            env     : {
                PATH                     : process.env.PATH,
                NEO_MCP_HEALTHCHECK_TOKEN: 'composition-fixture-token',
                NEO_DEPLOY_PROJECT_NAME  : 'neo-fleet-composition-spec'
            }
        });

        const headless  = JSON.parse(render([])),
              withFleet = JSON.parse(render(['fleet'])),
              fleetEnv  = withFleet.services['fleet-server'].environment;

        expect(headless.services).not.toHaveProperty('fleet-server');
        expect(withFleet.services).toHaveProperty('fleet-server');
        expect(fleetEnv.NEO_AUTH_MODE).toBe('github-pat');
        expect(fleetEnv.NEO_AUTH_PROVIDER_BOOTSTRAP_PAT_FILE).toBe('/run/secrets/mcp-auth-token');
        expect(fleetEnv.NEO_MCP_HEALTHCHECK_TOKEN_FILE).toBe('/run/secrets/mcp-auth-token');
        expect(JSON.stringify(withFleet)).not.toContain('composition-fixture-token')
    })
});
