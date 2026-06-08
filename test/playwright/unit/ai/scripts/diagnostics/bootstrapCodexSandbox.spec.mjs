import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    buildProbePaths,
    detectSandboxMode,
    formatProbeResult,
    runCodexSandboxProbe
} from '../../../../../../ai/scripts/diagnostics/bootstrapCodexSandbox.mjs';

function makeTempRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'neo-codex-sandbox-probe-'));
}

function listProbeArtifacts(root) {
    const sqliteDir = path.join(root, '.neo-ai-data/sqlite');
    if (!fs.existsSync(sqliteDir)) return [];

    return fs.readdirSync(sqliteDir)
        .filter(name => name.startsWith('codex-sandbox-probe-'));
}

/**
 * @summary Reads the tracked Codex config template for static MCP policy guards.
 * @returns {String}
 */
function readCodexConfigTemplate() {
    return fs.readFileSync(
        new URL('../../../../../../.codex/config.template.toml', import.meta.url),
        'utf8'
    );
}

/**
 * @summary Extracts one MCP server TOML block from the Codex config template.
 * @param {String} config
 * @param {String} serverName
 * @returns {String}
 */
function getMcpServerBlock(config, serverName) {
    const header = `[mcp_servers."${serverName}"]`;
    const start  = config.indexOf(header);

    expect(start).toBeGreaterThan(-1);

    const remaining = config.slice(start + header.length);
    const nextBlock = remaining.search(/\n\[/);
    const end       = nextBlock === -1 ? config.length : start + header.length + nextBlock;

    return config.slice(start, end);
}

/**
 * @summary Extracts the env_vars array body from a single MCP server block.
 * @param {String} serverBlock
 * @returns {String}
 */
function getEnvVarsBlock(serverBlock) {
    const match = serverBlock.match(/env_vars\s*=\s*\[([\s\S]*?)\]/);

    expect(match).not.toBeNull();

    return match[1];
}

/**
 * @summary Coverage for the Codex Desktop SQLite sandbox diagnostic.
 *
 * The tests keep all file writes in OS temp dirs and inject the failure-path
 * SQLite constructor so the diagnostic can prove cleanup and remediation output
 * without depending on the current harness sandbox mode.
 */
test.describe('bootstrapCodexSandbox diagnostic (#10714)', () => {
    let tempRoot;

    test.beforeEach(() => {
        tempRoot = makeTempRoot();
    });

    test.afterEach(() => {
        fs.rmSync(tempRoot, {recursive: true, force: true});
    });

    test('creates, opens, and removes a transient sqlite probe on success', () => {
        const result = runCodexSandboxProbe({
            projectRoot: tempRoot,
            probeId    : 'success'
        });

        expect(result.ok).toBe(true);
        expect(result.paths.probePath).toContain('.neo-ai-data/sqlite/codex-sandbox-probe-success.sqlite');
        expect(listProbeArtifacts(tempRoot)).toEqual([]);

        const report = formatProbeResult(result);
        expect(report).toContain('Codex sandbox SQLite probe: ok');
        expect(report).toContain('transient SQLite probe artifacts removed');
    });

    test('reports symlink target and still cleans artifacts through the logical path', () => {
        const physicalDir = path.join(tempRoot, 'canonical-sqlite');
        const logicalDir  = path.join(tempRoot, '.neo-ai-data/sqlite');
        fs.mkdirSync(path.dirname(logicalDir), {recursive: true});
        fs.mkdirSync(physicalDir, {recursive: true});
        fs.symlinkSync(physicalDir, logicalDir, 'dir');

        const result = runCodexSandboxProbe({
            projectRoot: tempRoot,
            probeId    : 'symlink'
        });

        expect(result.ok).toBe(true);
        expect(result.paths.symlinkTarget).toBe(physicalDir);
        expect(result.paths.physicalProbePath).toBe(path.join(
            fs.realpathSync(physicalDir),
            'codex-sandbox-probe-symlink.sqlite'
        ));
        expect(fs.readdirSync(physicalDir).filter(name => name.startsWith('codex-sandbox-probe-'))).toEqual([]);

        const report = formatProbeResult(result);
        expect(report).toContain(`symlink target: ${physicalDir}`);
    });

    test('failure output includes paths, sqlite error, sandbox mode, remediation, and cleanup', () => {
        class FailingDatabase {
            constructor(filePath) {
                fs.writeFileSync(filePath, 'partial sqlite allocation');
                const error = new Error('unable to open database file');
                error.code  = 'SQLITE_CANTOPEN';
                throw error;
            }
        }

        const result = runCodexSandboxProbe({
            projectRoot  : tempRoot,
            probeId      : 'failure',
            DatabaseClass: FailingDatabase,
            env          : {CODEX_SANDBOX_MODE: 'workspace-write'}
        });

        expect(result.ok).toBe(false);
        expect(result.error).toEqual({
            code   : 'SQLITE_CANTOPEN',
            message: 'unable to open database file'
        });
        expect(listProbeArtifacts(tempRoot)).toEqual([]);

        const report = formatProbeResult(result);
        expect(report).toContain('Codex sandbox SQLite probe: failed');
        expect(report).toContain(result.paths.probePath);
        expect(report).toContain(result.paths.physicalProbePath);
        expect(report).toContain('CODEX_SANDBOX_MODE=workspace-write');
        expect(report).toContain('SQLITE_CANTOPEN: unable to open database file');
        expect(report).toContain('sandbox_permissions=require_escalated');
        expect(report).toContain('transient SQLite probe artifacts removed');
    });

    test('detectSandboxMode reports known env keys and falls back to unknown', () => {
        expect(detectSandboxMode({CODEX_SANDBOX: 'read-only'})).toBe('CODEX_SANDBOX=read-only');
        expect(detectSandboxMode({})).toBe('unknown');
    });

    test('buildProbePaths resolves missing sqlite directories without requiring them to exist first', () => {
        const paths = buildProbePaths({
            projectRoot: tempRoot,
            probeId    : 'paths'
        });

        expect(paths.logicalDir).toBe(path.join(tempRoot, '.neo-ai-data/sqlite'));
        expect(paths.physicalDir).toBe(paths.logicalDir);
        expect(paths.symlinkTarget).toBeNull();
        expect(paths.fileName).toBe('codex-sandbox-probe-paths.sqlite');
    });
});

test.describe('Codex MCP config template (#12744)', () => {
    test('keeps remote Gemini credentials opt-in for local KB and Memory Core servers', () => {
        const config = readCodexConfigTemplate();

        expect(config).toContain('Remote Gemini credentials are intentionally opt-in');

        for (const serverName of ['neo-mjs-knowledge-base', 'neo-mjs-memory-core']) {
            const serverBlock = getMcpServerBlock(config, serverName);
            const envVars     = getEnvVarsBlock(serverBlock);

            expect(envVars).not.toContain('"GEMINI_API_KEY"');
            expect(envVars).toContain('"NEO_OPENAI_COMPATIBLE_HOST"');
            expect(envVars).toContain('"NEO_OPENAI_COMPATIBLE_MODEL"');
        }
    });
});
