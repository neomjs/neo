import {test, expect} from '@playwright/test';
import Neo       from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import PrimaryRepoSyncService, {
    DEV_SYNC_ROOTS_ENV_VAR,
    isConfigTemplateChangePath,
    isKbRelevantChangePath,
    parseDevSyncRoots
} from '../../../../../../../ai/daemons/orchestrator/services/PrimaryRepoSyncService.mjs';

function createExecStub(steps) {
    const calls = [];

    const fn = (cmd, args, options) => {
        const step = steps.shift();
        calls.push({cmd, args, cwd: options.cwd});

        expect(step).toBeTruthy();
        expect(cmd).toBe(step.cmd);
        expect(args).toEqual(step.args);

        if (step.error) {
            throw new Error(step.error);
        }

        return step.output || '';
    };

    fn.calls = calls;
    return fn;
}

function createTaskStateService(running=false) {
    const state = {
        running,
        pid          : null,
        lastRunAt    : 0,
        lastSuccessAt: null,
        lastErrorAt  : null,
        lastExitCode : null,
        lastReason   : null
    };

    return {
        state,
        events: [],
        getTaskState() {
            return state;
        },
        markStarted(taskName, reason) {
            this.events.push(['started', taskName, reason]);
            state.running = true;
            state.lastRunAt = 1;
            state.lastReason = reason;
        },
        markCompleted(taskName) {
            this.events.push(['completed', taskName]);
            state.running = false;
            state.lastExitCode = 0;
        },
        markSkipped(taskName) {
            this.events.push(['skipped', taskName]);
            state.running = false;
        },
        markFailed(taskName, code) {
            this.events.push(['failed', taskName, code]);
            state.running = false;
            state.lastExitCode = code;
        }
    };
}

test.describe('PrimaryRepoSyncService (#11017)', () => {
    test('parses explicit dev-sync roots without machine-specific defaults', () => {
        expect(parseDevSyncRoots(undefined)).toEqual({status: 'unset', roots: []});
        expect(parseDevSyncRoots('')).toEqual({status: 'unset', roots: []});
        expect(parseDevSyncRoots('["/primary/neo","/primary/neo","/agent/neo"]')).toEqual({
            status: 'configured',
            roots : ['/primary/neo', '/agent/neo']
        });
        expect(parseDevSyncRoots(['/primary/neo', '/primary/neo', '/agent/neo'], 'orchestrator.devSyncRoots')).toEqual({
            status: 'configured',
            roots : ['/primary/neo', '/agent/neo']
        });
        expect(parseDevSyncRoots('{"root":"/primary/neo"}')).toEqual({
            status    : 'invalid',
            reasonCode: 'invalid-dev-sync-roots',
            error     : `${DEV_SYNC_ROOTS_ENV_VAR} must be a JSON array of absolute paths.`
        });
        expect(parseDevSyncRoots(['relative/neo'], 'orchestrator.devSyncRoots')).toEqual({
            status    : 'invalid',
            reasonCode: 'invalid-dev-sync-roots',
            error     : 'orchestrator.devSyncRoots entries must be absolute path strings.'
        });
        expect(parseDevSyncRoots('["relative/neo"]')).toEqual({
            status    : 'invalid',
            reasonCode: 'invalid-dev-sync-roots',
            error     : `${DEV_SYNC_ROOTS_ENV_VAR} entries must be absolute path strings.`
        });
    });

    test('classifies KB-relevant change paths conservatively', () => {
        expect(isKbRelevantChangePath('src/button/Base.mjs')).toBe(true);
        expect(isKbRelevantChangePath('ai/services/knowledge-base/source/ApiSource.mjs')).toBe(true);
        expect(isKbRelevantChangePath('docs/output/class-hierarchy.json')).toBe(true);
        expect(isKbRelevantChangePath('resources/content/issues/chunk-13/issue-11783.md')).toBe(true);
        expect(isKbRelevantChangePath('resources/content/.sync-metadata.json')).toBe(false);
        expect(isKbRelevantChangePath('.codex/config.template.toml')).toBe(false);
        expect(isKbRelevantChangePath('package.json')).toBe(false);
    });

    test('classifies config-template change paths for the migrate cascade (#12854)', () => {
        // Tier-1 + per-server templates trigger the overlay reconcile; their gitignored
        // overlays and non-template siblings do not.
        expect(isConfigTemplateChangePath('ai/config.template.mjs')).toBe(true);
        expect(isConfigTemplateChangePath('ai/mcp/server/memory-core/config.template.mjs')).toBe(true);
        expect(isConfigTemplateChangePath('ai/mcp/server/github-workflow/config.template.mjs')).toBe(true);
        // The gitignored overlay itself never appears in a dev diff, but assert it is NOT a trigger.
        expect(isConfigTemplateChangePath('ai/config.mjs')).toBe(false);
        expect(isConfigTemplateChangePath('ai/mcp/server/memory-core/config.mjs')).toBe(false);
        // Deeper than one server segment, or a different template family, must not match.
        expect(isConfigTemplateChangePath('ai/mcp/server/memory-core/sub/config.template.mjs')).toBe(false);
        expect(isConfigTemplateChangePath('.codex/config.template.toml')).toBe(false);
        expect(isConfigTemplateChangePath('ai/services/knowledge-base/source/ApiSource.mjs')).toBe(false);
        expect(isConfigTemplateChangePath('')).toBe(false);
    });

    test('falls back to KB cascade when changed-path detection fails', () => {
        const execStub = createExecStub([{
            cmd  : 'git',
            args : ['diff', '--name-only', 'old-head..new-head'],
            error: 'bad revision'
        }]);

        expect(PrimaryRepoSyncService.resolveKbSyncDecision({
            root          : '/primary/neo',
            oldHead       : 'old-head',
            newHead       : 'new-head',
            execFileSyncFn: execStub
        })).toEqual({
            kbSyncRequired         : true,
            kbSyncReasonCode       : 'kb-relevance-check-failed',
            configMigrateRequired  : true,
            configMigrateReasonCode: 'config-migrate-relevance-check-failed',
            oldHead                : 'old-head',
            newHead                : 'new-head',
            error                  : 'bad revision'
        });
    });

    test('resolves primary checkout from worktree list and falls back to git-common-dir', () => {
        const worktreeExec = createExecStub([{
            cmd   : 'git',
            args  : ['worktree', 'list', '--porcelain'],
            output: 'worktree /primary/neo\nHEAD abc\nbranch refs/heads/dev\n\nworktree /tmp/neo-worktree\n'
        }]);

        expect(PrimaryRepoSyncService.resolvePrimaryRoot({
            cwd           : '/tmp/neo-worktree',
            execFileSyncFn: worktreeExec
        })).toBe('/primary/neo');

        const commonDirExec = createExecStub([{
            cmd  : 'git',
            args : ['worktree', 'list', '--porcelain'],
            error: 'not a worktree'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--git-common-dir'],
            output: '/primary/neo/.git\n'
        }]);

        expect(PrimaryRepoSyncService.resolvePrimaryRoot({
            cwd           : '/tmp/neo-worktree',
            execFileSyncFn: commonDirExec
        })).toBe('/primary/neo');
    });

    test('skips when primary checkout is not on dev', () => {
        const execStub = createExecStub([{
            cmd   : 'git',
            args  : ['worktree', 'list', '--porcelain'],
            output: 'worktree /primary/neo\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--abbrev-ref', 'HEAD'],
            output: 'feature\n'
        }]);

        const result = PrimaryRepoSyncService.syncPrimaryDev({
            cwd           : '/primary/neo',
            execFileSyncFn: execStub,
            writeLog      : () => {}
        });

        expect(result).toEqual({
            status : 'skipped',
            details: {
                reasonCode: 'not-dev-branch',
                primaryRoot: '/primary/neo',
                branch: 'feature'
            }
        });
    });

    test('runs layer 1 fast-forward pull and cascades KB sync', () => {
        const execStub = createExecStub([{
            cmd   : 'git',
            args  : ['worktree', 'list', '--porcelain'],
            output: 'worktree /primary/neo\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--abbrev-ref', 'HEAD'],
            output: 'dev\n'
        }, {
            cmd : 'git',
            args: ['fetch', 'origin', 'dev', '--quiet']
        }, {
            cmd   : 'git',
            args  : ['rev-list', '--count', 'dev..origin/dev'],
            output: '2\n'
        }, {
            cmd   : 'git',
            args  : ['status', '--porcelain'],
            output: ''
        }, {
            cmd   : 'git',
            args  : ['rev-parse', 'HEAD'],
            output: 'old-head\n'
        }, {
            cmd : 'git',
            args: ['pull', '--ff-only', 'origin', 'dev']
        }, {
            cmd   : 'git',
            args  : ['rev-parse', 'HEAD'],
            output: 'new-head\n'
        }, {
            cmd   : 'git',
            args  : ['diff', '--name-only', 'old-head..new-head'],
            output: 'src/button/Base.mjs\n'
        }, {
            cmd : process.platform === 'win32' ? 'npm.cmd' : 'npm',
            args: ['run', 'ai:sync-kb']
        }]);

        const result = PrimaryRepoSyncService.syncPrimaryDev({
            cwd           : '/primary/neo',
            execFileSyncFn: execStub,
            writeLog      : () => {}
        });

        expect(result.status).toBe('completed');
        expect(result.details).toMatchObject({
            primaryRoot        : '/primary/neo',
            behind             : 2,
            layer              : 'ff-pull',
            kbSync             : true,
            kbSyncRequired     : true,
            kbSyncReasonCode   : 'kb-relevant-changes',
            oldHead            : 'old-head',
            newHead            : 'new-head',
            changedPathCount   : 1,
            kbChangedPathCount : 1,
            kbChangedPathSample: ['src/button/Base.mjs']
        });
    });

    test('runs config-overlay migrate then KB cascade when a config template advanced (#12854)', () => {
        const execStub = createExecStub([{
            cmd   : 'git',
            args  : ['worktree', 'list', '--porcelain'],
            output: 'worktree /primary/neo\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--abbrev-ref', 'HEAD'],
            output: 'dev\n'
        }, {
            cmd : 'git',
            args: ['fetch', 'origin', 'dev', '--quiet']
        }, {
            cmd   : 'git',
            args  : ['rev-list', '--count', 'dev..origin/dev'],
            output: '1\n'
        }, {
            cmd   : 'git',
            args  : ['status', '--porcelain'],
            output: ''
        }, {
            cmd   : 'git',
            args  : ['rev-parse', 'HEAD'],
            output: 'old-head\n'
        }, {
            cmd : 'git',
            args: ['pull', '--ff-only', 'origin', 'dev']
        }, {
            cmd   : 'git',
            args  : ['rev-parse', 'HEAD'],
            output: 'new-head\n'
        }, {
            cmd   : 'git',
            args  : ['diff', '--name-only', 'old-head..new-head'],
            output: 'ai/config.template.mjs\n'
        }, {
            // config-migrate runs FIRST (per-clone overlay freshness), before the KB cascade.
            cmd : process.execPath,
            args: ['/primary/neo/ai/scripts/setup/initServerConfigs.mjs', '--migrate-config']
        }, {
            // `ai/` paths are also KB-relevant, so the KB cascade still fires from the same diff.
            cmd : process.platform === 'win32' ? 'npm.cmd' : 'npm',
            args: ['run', 'ai:sync-kb']
        }]);

        const result = PrimaryRepoSyncService.syncPrimaryDev({
            cwd           : '/primary/neo',
            execFileSyncFn: execStub,
            writeLog      : () => {}
        });

        expect(result.status).toBe('completed');
        expect(result.details).toMatchObject({
            primaryRoot            : '/primary/neo',
            behind                 : 1,
            layer                  : 'ff-pull',
            kbSync                 : true,
            configMigrate          : true,
            configMigrateRequired  : true,
            configMigrateReasonCode: 'config-template-changes',
            configChangedPathCount : 1,
            configChangedPathSample: ['ai/config.template.mjs']
        });

        // Ordering contract: the node migrate precedes the npm KB cascade.
        const migrateIdx = execStub.calls.findIndex(call => call.cmd === process.execPath);
        const kbSyncIdx  = execStub.calls.findIndex(call => call.cmd === (process.platform === 'win32' ? 'npm.cmd' : 'npm'));
        expect(migrateIdx).toBeGreaterThan(-1);
        expect(kbSyncIdx).toBeGreaterThan(migrateIdx);
    });

    test('a per-server config template advance triggers the migrate cascade (#12854)', () => {
        // A per-server template lives under ai/ too, so the KB cascade co-fires. The point of this
        // case is to pin that a *server* template (not just Tier-1) triggers the migrate.
        const execStub = createExecStub([{
            cmd   : 'git',
            args  : ['worktree', 'list', '--porcelain'],
            output: 'worktree /primary/neo\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--abbrev-ref', 'HEAD'],
            output: 'dev\n'
        }, {
            cmd : 'git',
            args: ['fetch', 'origin', 'dev', '--quiet']
        }, {
            cmd   : 'git',
            args  : ['rev-list', '--count', 'dev..origin/dev'],
            output: '1\n'
        }, {
            cmd   : 'git',
            args  : ['status', '--porcelain'],
            output: ''
        }, {
            cmd   : 'git',
            args  : ['rev-parse', 'HEAD'],
            output: 'old-head\n'
        }, {
            cmd : 'git',
            args: ['pull', '--ff-only', 'origin', 'dev']
        }, {
            cmd   : 'git',
            args  : ['rev-parse', 'HEAD'],
            output: 'new-head\n'
        }, {
            cmd   : 'git',
            args  : ['diff', '--name-only', 'old-head..new-head'],
            output: 'ai/mcp/server/memory-core/config.template.mjs\n'
        }, {
            cmd : process.execPath,
            args: ['/primary/neo/ai/scripts/setup/initServerConfigs.mjs', '--migrate-config']
        }, {
            cmd : process.platform === 'win32' ? 'npm.cmd' : 'npm',
            args: ['run', 'ai:sync-kb']
        }]);

        const result = PrimaryRepoSyncService.syncPrimaryDev({
            cwd           : '/primary/neo',
            execFileSyncFn: execStub,
            writeLog      : () => {}
        });

        expect(result.status).toBe('completed');
        expect(result.details).toMatchObject({
            configMigrate          : true,
            configMigrateRequired  : true,
            configChangedPathCount : 1,
            configChangedPathSample: ['ai/mcp/server/memory-core/config.template.mjs']
        });
    });

    test('uses layer 2 only for generated sync metadata', () => {
        const execStub = createExecStub([{
            cmd   : 'git',
            args  : ['worktree', 'list', '--porcelain'],
            output: 'worktree /primary/neo\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--abbrev-ref', 'HEAD'],
            output: 'dev\n'
        }, {
            cmd : 'git',
            args: ['fetch', 'origin', 'dev', '--quiet']
        }, {
            cmd   : 'git',
            args  : ['rev-list', '--count', 'dev..origin/dev'],
            output: '1\n'
        }, {
            cmd   : 'git',
            args  : ['status', '--porcelain'],
            output: ' M resources/content/.sync-metadata.json\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', 'HEAD'],
            output: 'old-head\n'
        }, {
            cmd : 'git',
            args: ['checkout', '--', 'resources/content/.sync-metadata.json']
        }, {
            cmd : 'git',
            args: ['pull', '--ff-only', 'origin', 'dev']
        }, {
            cmd   : 'git',
            args  : ['rev-parse', 'HEAD'],
            output: 'new-head\n'
        }, {
            cmd   : 'git',
            args  : ['diff', '--name-only', 'old-head..new-head'],
            output: 'resources/content/.sync-metadata.json\n'
        }]);

        const result = PrimaryRepoSyncService.syncPrimaryDev({
            cwd           : '/primary/neo',
            execFileSyncFn: execStub,
            writeLog      : () => {}
        });

        expect(result.status).toBe('completed');
        expect(result.details.resolved).toBe('meta-sync');
        expect(result.details).toMatchObject({
            kbSync            : false,
            kbSyncRequired    : false,
            kbSyncReasonCode  : 'no-kb-relevant-changes',
            reasonCode        : 'no-kb-relevant-changes',
            changedPathCount  : 1,
            kbChangedPathCount: 0
        });
        expect(execStub.calls.map(call => call.cmd)).not.toContain(process.platform === 'win32' ? 'npm.cmd' : 'npm');
    });

    test('syncs configured dev roots and cascades KB once from the owning checkout', () => {
        const execStub = createExecStub([{
            cmd   : 'git',
            args  : ['worktree', 'list', '--porcelain'],
            output: 'worktree /primary/neo\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--show-toplevel'],
            output: '/primary/neo\n'
        }, {
            cmd : 'git',
            args: ['fetch', 'origin', 'dev', '--quiet']
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--verify', 'origin/dev'],
            output: 'abc123\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--abbrev-ref', 'HEAD'],
            output: 'dev\n'
        }, {
            cmd   : 'git',
            args  : ['rev-list', '--count', 'dev..origin/dev'],
            output: '2\n'
        }, {
            cmd   : 'git',
            args  : ['status', '--porcelain'],
            output: ''
        }, {
            cmd   : 'git',
            args  : ['rev-parse', 'HEAD'],
            output: 'old-head\n'
        }, {
            cmd : 'git',
            args: ['pull', '--ff-only', 'origin', 'dev']
        }, {
            cmd   : 'git',
            args  : ['rev-parse', 'HEAD'],
            output: 'new-head\n'
        }, {
            cmd   : 'git',
            args  : ['diff', '--name-only', 'old-head..new-head'],
            output: 'learn/guides/testing/UnitTesting.md\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--show-toplevel'],
            output: '/agent/neo\n'
        }, {
            cmd : 'git',
            args: ['fetch', 'origin', 'dev', '--quiet']
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--verify', 'origin/dev'],
            output: 'abc123\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--abbrev-ref', 'HEAD'],
            output: 'dev\n'
        }, {
            cmd   : 'git',
            args  : ['rev-list', '--count', 'dev..origin/dev'],
            output: '0\n'
        }, {
            cmd : process.platform === 'win32' ? 'npm.cmd' : 'npm',
            args: ['run', 'ai:sync-kb']
        }]);

        const result = PrimaryRepoSyncService.syncPrimaryDev({
            cwd               : '/primary/neo',
            execFileSyncFn    : execStub,
            writeLog          : () => {},
            devSyncRootsConfig: '["/primary/neo","/agent/neo"]'
        });

        expect(result).toEqual({
            status : 'completed',
            details: {
                mode       : 'configured-roots',
                primaryRoot: '/primary/neo',
                rootCount  : 2,
                completed  : 1,
                skipped    : 1,
                failed     : 0,
                roots      : [{
                    status                 : 'completed',
                    root                   : '/primary/neo',
                    behind                 : 2,
                    layer                  : 'ff-pull',
                    kbSync                 : false,
                    configMigrate          : false,
                    kbSyncRequired         : true,
                    kbSyncReasonCode       : 'kb-relevant-changes',
                    configMigrateRequired  : false,
                    configMigrateReasonCode: 'no-config-template-changes',
                    oldHead                : 'old-head',
                    newHead                : 'new-head',
                    changedPathCount       : 1,
                    kbChangedPathCount     : 1,
                    kbChangedPathSample    : ['learn/guides/testing/UnitTesting.md'],
                    configChangedPathCount : 0,
                    configChangedPathSample: []
                }, {
                    status    : 'skipped',
                    reasonCode: 'up-to-date',
                    root      : '/agent/neo',
                    behind    : 0
                }],
                kbSync: true
            }
        });
        expect(execStub.calls.filter(call => call.cmd.includes('npm') || call.cmd === 'npm').length).toBe(1);
        expect(execStub.calls.at(-1).cwd).toBe('/primary/neo');
    });

    test('skips configured-root KB cascade when completed roots changed no KB inputs', () => {
        const execStub = createExecStub([{
            cmd   : 'git',
            args  : ['worktree', 'list', '--porcelain'],
            output: 'worktree /primary/neo\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--show-toplevel'],
            output: '/primary/neo\n'
        }, {
            cmd : 'git',
            args: ['fetch', 'origin', 'dev', '--quiet']
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--verify', 'origin/dev'],
            output: 'abc123\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--abbrev-ref', 'HEAD'],
            output: 'dev\n'
        }, {
            cmd   : 'git',
            args  : ['rev-list', '--count', 'dev..origin/dev'],
            output: '1\n'
        }, {
            cmd   : 'git',
            args  : ['status', '--porcelain'],
            output: ''
        }, {
            cmd   : 'git',
            args  : ['rev-parse', 'HEAD'],
            output: 'old-head\n'
        }, {
            cmd : 'git',
            args: ['pull', '--ff-only', 'origin', 'dev']
        }, {
            cmd   : 'git',
            args  : ['rev-parse', 'HEAD'],
            output: 'new-head\n'
        }, {
            cmd   : 'git',
            args  : ['diff', '--name-only', 'old-head..new-head'],
            output: '.codex/config.template.toml\n'
        }]);

        const result = PrimaryRepoSyncService.syncPrimaryDev({
            cwd               : '/primary/neo',
            execFileSyncFn    : execStub,
            writeLog          : () => {},
            devSyncRootsConfig: '["/primary/neo"]'
        });

        expect(result.status).toBe('completed');
        expect(result.details).toMatchObject({
            mode      : 'configured-roots',
            completed : 1,
            kbSync    : false,
            reasonCode: 'no-kb-relevant-changes'
        });
        expect(result.details.roots[0]).toMatchObject({
            status            : 'completed',
            kbSyncRequired    : false,
            kbSyncReasonCode  : 'no-kb-relevant-changes',
            reasonCode        : 'no-kb-relevant-changes',
            changedPathCount  : 1,
            kbChangedPathCount: 0
        });
        expect(execStub.calls.map(call => call.cmd)).not.toContain(process.platform === 'win32' ? 'npm.cmd' : 'npm');
    });

    test('configured non-dev roots fetch origin/dev but never switch branches', () => {
        const execStub = createExecStub([{
            cmd   : 'git',
            args  : ['worktree', 'list', '--porcelain'],
            output: 'worktree /primary/neo\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--show-toplevel'],
            output: '/agent/neo\n'
        }, {
            cmd : 'git',
            args: ['fetch', 'origin', 'dev', '--quiet']
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--verify', 'origin/dev'],
            output: 'abc123\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--abbrev-ref', 'HEAD'],
            output: 'feature/foo\n'
        }]);

        const result = PrimaryRepoSyncService.syncPrimaryDev({
            cwd               : '/primary/neo',
            execFileSyncFn    : execStub,
            writeLog          : () => {},
            devSyncRootsConfig: '["/agent/neo"]'
        });

        expect(result.status).toBe('skipped');
        expect(result.details.roots[0]).toEqual({
            status    : 'skipped',
            reasonCode: 'not-dev-branch',
            root      : '/agent/neo',
            branch    : 'feature/foo',
            fetched   : true
        });
        expect(execStub.calls.map(call => call.args[0])).not.toContain('checkout');
        expect(execStub.calls.map(call => call.args[0])).not.toContain('pull');
    });

    test('configured root failures are isolated from later roots', () => {
        const execStub = createExecStub([{
            cmd   : 'git',
            args  : ['worktree', 'list', '--porcelain'],
            output: 'worktree /primary/neo\n'
        }, {
            cmd  : 'git',
            args : ['rev-parse', '--show-toplevel'],
            error: 'not a git repo'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--show-toplevel'],
            output: '/agent/neo\n'
        }, {
            cmd : 'git',
            args: ['fetch', 'origin', 'dev', '--quiet']
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--verify', 'origin/dev'],
            output: 'abc123\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--abbrev-ref', 'HEAD'],
            output: 'dev\n'
        }, {
            cmd   : 'git',
            args  : ['rev-list', '--count', 'dev..origin/dev'],
            output: '0\n'
        }]);

        const result = PrimaryRepoSyncService.syncPrimaryDev({
            cwd               : '/primary/neo',
            execFileSyncFn    : execStub,
            writeLog          : () => {},
            devSyncRootsConfig: '["/broken/neo","/agent/neo"]'
        });

        expect(result.status).toBe('failed');
        expect(result.details).toMatchObject({
            mode       : 'configured-roots',
            primaryRoot: '/primary/neo',
            rootCount  : 2,
            completed  : 0,
            skipped    : 1,
            failed     : 1,
            reasonCode : 'configured-root-failures',
            kbSync     : false
        });
        expect(result.details.roots[0]).toMatchObject({
            status    : 'failed',
            reasonCode: 'root-verification-failed',
            root      : '/broken/neo'
        });
        expect(result.details.roots[1]).toMatchObject({
            status    : 'skipped',
            reasonCode: 'up-to-date',
            root      : '/agent/neo'
        });
    });

    test('halts before pull when non-metadata local divergence exists', () => {
        const execStub = createExecStub([{
            cmd   : 'git',
            args  : ['worktree', 'list', '--porcelain'],
            output: 'worktree /primary/neo\n'
        }, {
            cmd   : 'git',
            args  : ['rev-parse', '--abbrev-ref', 'HEAD'],
            output: 'dev\n'
        }, {
            cmd : 'git',
            args: ['fetch', 'origin', 'dev', '--quiet']
        }, {
            cmd   : 'git',
            args  : ['rev-list', '--count', 'dev..origin/dev'],
            output: '1\n'
        }, {
            cmd   : 'git',
            args  : ['status', '--porcelain'],
            output: ' M ai/daemons/Orchestrator.mjs\n'
        }]);

        const result = PrimaryRepoSyncService.syncPrimaryDev({
            cwd           : '/primary/neo',
            execFileSyncFn: execStub,
            writeLog      : () => {}
        });

        expect(result).toEqual({
            status : 'skipped',
            details: {
                reasonCode: 'local-divergence',
                primaryRoot: '/primary/neo',
                behind: 1,
                files: ['ai/daemons/Orchestrator.mjs']
            }
        });
        expect(execStub.calls.map(call => call.args[0])).not.toContain('pull');
    });

    test('reports the canonical env-var name for malformed configured roots', () => {
        const result = PrimaryRepoSyncService.syncPrimaryDev({
            cwd               : '/primary/neo',
            execFileSyncFn    : createExecStub([]),
            writeLog          : () => {},
            devSyncRootsConfig: ['relative/neo']
        });

        expect(result).toEqual({
            status : 'skipped',
            details: {
                reasonCode: 'invalid-dev-sync-roots',
                envVar    : DEV_SYNC_ROOTS_ENV_VAR,
                source    : DEV_SYNC_ROOTS_ENV_VAR,
                error     : `${DEV_SYNC_ROOTS_ENV_VAR} entries must be absolute path strings.`
            }
        });
    });

    test('records skipped outcomes without marking no-op checks successful', () => {
        const taskStateService = createTaskStateService();
        const outcomes = [];

        const result = PrimaryRepoSyncService.runTask({
            reason          : 'periodic-sweep:600000',
            taskStateService,
            healthService   : {
                recordTaskOutcome(taskName, status, details) {
                    outcomes.push({taskName, status, details});
                }
            },
            writeLog        : () => {},
            execFileSyncFn  : createExecStub([{
                cmd   : 'git',
                args  : ['worktree', 'list', '--porcelain'],
                output: 'worktree /primary/neo\n'
            }, {
                cmd   : 'git',
                args  : ['rev-parse', '--abbrev-ref', 'HEAD'],
                output: 'dev\n'
            }, {
                cmd : 'git',
                args: ['fetch', 'origin', 'dev', '--quiet']
            }, {
                cmd   : 'git',
                args  : ['rev-list', '--count', 'dev..origin/dev'],
                output: '0\n'
            }])
        });

        expect(result.status).toBe('skipped');
        expect(taskStateService.events).toEqual([
            ['started', 'primary-dev-sync', 'periodic-sweep:600000'],
            ['skipped', 'primary-dev-sync']
        ]);
        expect(outcomes[0].status).toBe('skipped');
        expect(outcomes[0].details.reasonCode).toBe('up-to-date');
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Cascade observability (Lane D):
    //   runKbSync cascade is annotated as a first-class `kbSync` task lifecycle
    //   event via TaskStateService + HealthService so monitoring agents +
    //   post-incident forensics can see cascade kbSync separately from the parent
    //   `primary-dev-sync` task (umbrella AC8).
    //
    //   Optional-chained injection: when both services are absent, runKbSync is
    //   a pure shell-out with no state mutation or outcome recording (backward-
    //   compatible for ad-hoc / test callers).
    // ─────────────────────────────────────────────────────────────────────────────

    test('runKbSync annotates cascade as kbSync lifecycle via TaskStateService + HealthService on success — STRICT TEMPORAL ORDERING (#11520 AC1+AC2+AC6+AC8)', () => {
        // Per @neo-gpt's cross-family review: the end-state
        // assertions on `events` and `outcomes` arrays prove WHAT happened but NOT WHEN.
        // AC6 mandates temporal ordering: markStarted + running outcome MUST occur BEFORE
        // execFileSyncFn begins; markCompleted + completed outcome MUST occur AFTER it
        // returns. Without ordering assertions, a future refactor that accidentally moved
        // the annotation calls inside/around execFileSyncFn could pass end-state tests
        // while violating the lifecycle contract that observability tooling depends on.
        //
        // This test pins the contract via a call-sequence array: instrumented helpers
        // push synchronous markers in execution order; the assertion is on the strict
        // sequence, not just the end state.
        const sequence = [];

        const taskStateService = {
            events: [],
            getTaskState() { return {running: false}; },
            markStarted(taskName, reason) {
                this.events.push(['started', taskName, reason]);
                sequence.push(`state-started:${taskName}:${reason}`);
            },
            markCompleted(taskName) {
                this.events.push(['completed', taskName]);
                sequence.push(`state-completed:${taskName}`);
            },
            markFailed(taskName, code) {
                this.events.push(['failed', taskName, code]);
                sequence.push(`state-failed:${taskName}:${code}`);
            }
        };
        const outcomes = [];
        const healthService = {
            recordTaskOutcome(taskName, status, details) {
                outcomes.push({taskName, status, details});
                sequence.push(`health-${status}:${taskName}`);
            }
        };
        const execFileSyncFn = (cmd, args, options) => {
            sequence.push(`exec:${cmd}:${args.join(' ')}`);
            return '';
        };

        PrimaryRepoSyncService.runKbSync('/primary/neo', execFileSyncFn, {taskStateService, healthService});

        // AC6 — STRICT TEMPORAL ORDERING (the load-bearing assertion):
        // markStarted + running outcome MUST be before exec; markCompleted + completed outcome MUST be after.
        // Any future refactor that reorders these (e.g., moves recordTaskOutcome AFTER exec instead of before)
        // breaks the observability lifecycle contract and fails this assertion.
        expect(sequence).toEqual([
            'state-started:kbSync:cascaded-from-primary-dev-sync',
            `health-running:kbSync`,
            `exec:${process.platform === 'win32' ? 'npm.cmd' : 'npm'}:run ai:sync-kb`,
            'state-completed:kbSync',
            'health-completed:kbSync'
        ]);

        // AC1: markStarted with cascaded-from-parent reason
        // AC3: markCompleted on success
        expect(taskStateService.events).toEqual([
            ['started', 'kbSync', 'cascaded-from-primary-dev-sync'],
            ['completed', 'kbSync']
        ]);

        // AC2 + AC8: recordTaskOutcome shape with parent annotation
        expect(outcomes.length).toBe(2);
        expect(outcomes[0]).toMatchObject({
            taskName: 'kbSync',
            status  : 'running',
            details : expect.objectContaining({
                reason: 'cascaded-from-primary-dev-sync',
                parent: 'primary-dev-sync'
            })
        });
        expect(outcomes[1]).toMatchObject({
            taskName: 'kbSync',
            status  : 'completed',
            details : expect.objectContaining({
                reason: 'cascaded-from-primary-dev-sync',
                parent: 'primary-dev-sync'
            })
        });
    });

    test('runKbSync annotates cascade-failure path with markFailed + outcome + rethrow (#11520 AC3 failure)', () => {
        const taskStateService = createTaskStateService();
        const outcomes         = [];
        const healthService    = {
            recordTaskOutcome(taskName, status, details) {
                outcomes.push({taskName, status, details});
            }
        };
        const execFileSyncFn = (cmd, args, options) => {
            const e   = new Error('npm ai:sync-kb failed: ENOENT');
            e.status  = 127;
            throw e;
        };

        expect(() => {
            PrimaryRepoSyncService.runKbSync('/primary/neo', execFileSyncFn, {taskStateService, healthService});
        }).toThrow('npm ai:sync-kb failed: ENOENT');

        // AC3 failure: markStarted, then markFailed (with exit code from error.status)
        expect(taskStateService.events).toEqual([
            ['started', 'kbSync', 'cascaded-from-primary-dev-sync'],
            ['failed', 'kbSync', 127]
        ]);

        // AC2 + AC8 failure: recordTaskOutcome('kbSync', 'failed', {parent, error, ...})
        expect(outcomes.length).toBe(2);
        expect(outcomes[0]).toMatchObject({
            taskName: 'kbSync',
            status  : 'running'
        });
        expect(outcomes[1]).toMatchObject({
            taskName: 'kbSync',
            status  : 'failed',
            details : expect.objectContaining({
                reason: 'cascaded-from-primary-dev-sync',
                parent: 'primary-dev-sync',
                error : 'npm ai:sync-kb failed: ENOENT'
            })
        });
    });

    test('runKbSync is no-op-annotated when no services injected (#11520 AC4 backward-compatibility)', () => {
        // No taskStateService, no healthService → pure shell-out, no annotation.
        const execFileSyncFn = createExecStub([{
            cmd : process.platform === 'win32' ? 'npm.cmd' : 'npm',
            args: ['run', 'ai:sync-kb']
        }]);

        // Should not throw despite the missing services (optional-chained).
        expect(() => {
            PrimaryRepoSyncService.runKbSync('/primary/neo', execFileSyncFn);
        }).not.toThrow();

        // Confirm shell-out actually happened (one execFileSync call recorded).
        expect(execFileSyncFn.calls.length).toBe(1);
        expect(execFileSyncFn.calls[0].cmd).toBe(process.platform === 'win32' ? 'npm.cmd' : 'npm');
    });

    test('runKbSync passes NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN env to cascade spawn when set (#11519 AC4)', () => {
        // Cross-daemon lease-inheritance contract: when the parent orchestrator process
        // has acquired the heavy-maintenance lease and exports its token via
        // `NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN`, the kbSync cascade spawned by
        // PrimaryRepoSyncService.runKbSync MUST forward that env to the child so the
        // cascade's `withHeavyMaintenanceLease` recognizes the parent's lease and runs
        // WITHOUT acquire/release (returns 'inherited').
        //
        // Without this forwarding the cascade would attempt to acquire its own lease,
        // see the parent's, and self-defer with 'held' — the self-defer bug this env-forwarding prevents.
        const taskStateService = createTaskStateService();
        const healthService    = {recordTaskOutcome() {}};
        const captured         = [];
        const execFileSyncFn   = (cmd, args, options) => {
            captured.push({cmd, args, options});
            return '';
        };

        const original = process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
        process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = 'parent-orchestrator-token';

        try {
            PrimaryRepoSyncService.runKbSync('/primary/neo', execFileSyncFn, {taskStateService, healthService});

            expect(captured).toHaveLength(1);
            const {options} = captured[0];

            expect(options.env).toBeDefined();
            expect(options.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN).toBe('parent-orchestrator-token');
            // Other process.env entries pass through (PATH, HOME, etc.) — assert at least one
            // canonical env entry is preserved to verify {...process.env} spread, not a
            // single-key replacement.
            expect(options.env.PATH || options.env.Path).toBeDefined();
        } finally {
            if (original === undefined) {
                delete process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
            } else {
                process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = original;
            }
        }
    });

    test('runKbSync omits explicit env when no inherited token is present (#11519 AC4 backward-compat)', () => {
        // When parent has NOT exported the inheritance env-var, runKbSync MUST NOT pass an
        // explicit env option — leaves spawn's default-inheritance behavior intact. Asserts
        // the change is gated on the inheritance signal rather than always-on.
        const taskStateService = createTaskStateService();
        const healthService    = {recordTaskOutcome() {}};
        const captured         = [];
        const execFileSyncFn   = (cmd, args, options) => {
            captured.push({cmd, args, options});
            return '';
        };

        const original = process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;
        delete process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN;

        try {
            PrimaryRepoSyncService.runKbSync('/primary/neo', execFileSyncFn, {taskStateService, healthService});

            expect(captured).toHaveLength(1);
            const {options} = captured[0];

            expect(options.env).toBeUndefined();
        } finally {
            if (original !== undefined) {
                process.env.NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN = original;
            }
        }
    });

    test('runKbSync honors custom parentTaskName for cascade provenance (#11520 AC2 parent annotation contract)', () => {
        // Defensive: if a future caller wraps runKbSync with a different parent context
        // (e.g., hypothetical `summary` cascade), the annotation reason + parent field
        // adapt to the parentTaskName option. Pins the convention without enumerating
        // all future parents.
        const taskStateService = createTaskStateService();
        const outcomes         = [];
        const healthService    = {
            recordTaskOutcome(taskName, status, details) {
                outcomes.push({taskName, status, details});
            }
        };
        const execFileSyncFn = createExecStub([{
            cmd : process.platform === 'win32' ? 'npm.cmd' : 'npm',
            args: ['run', 'ai:sync-kb']
        }]);

        PrimaryRepoSyncService.runKbSync('/primary/neo', execFileSyncFn, {
            taskStateService,
            healthService,
            parentTaskName: 'custom-parent-task'
        });

        expect(taskStateService.events[0]).toEqual(['started', 'kbSync', 'cascaded-from-custom-parent-task']);
        expect(outcomes[0].details.parent).toBe('custom-parent-task');
        expect(outcomes[0].details.reason).toBe('cascaded-from-custom-parent-task');
    });

    test('runConfigMigrate annotates a first-class configMigrate task with strict temporal ordering (#12854)', () => {
        // Mirrors the runKbSync lifecycle contract: markStarted + running BEFORE exec,
        // markCompleted + completed AFTER. exec is `node <root>/ai/scripts/setup/initServerConfigs.mjs --migrate-config`.
        const sequence = [];

        const taskStateService = {
            events: [],
            getTaskState() { return {running: false}; },
            markStarted(taskName, reason) {
                this.events.push(['started', taskName, reason]);
                sequence.push(`state-started:${taskName}:${reason}`);
            },
            markCompleted(taskName) {
                this.events.push(['completed', taskName]);
                sequence.push(`state-completed:${taskName}`);
            },
            markFailed(taskName, code) {
                this.events.push(['failed', taskName, code]);
                sequence.push(`state-failed:${taskName}:${code}`);
            }
        };
        const outcomes      = [];
        const healthService = {
            recordTaskOutcome(taskName, status, details) {
                outcomes.push({taskName, status, details});
                sequence.push(`health-${status}:${taskName}`);
            }
        };
        const execFileSyncFn = (cmd, args) => {
            sequence.push(`exec:${cmd}:${args.join(' ')}`);
            return '';
        };

        PrimaryRepoSyncService.runConfigMigrate('/primary/neo', execFileSyncFn, {taskStateService, healthService});

        expect(sequence).toEqual([
            'state-started:configMigrate:cascaded-from-primary-dev-sync',
            'health-running:configMigrate',
            `exec:${process.execPath}:/primary/neo/ai/scripts/setup/initServerConfigs.mjs --migrate-config`,
            'state-completed:configMigrate',
            'health-completed:configMigrate'
        ]);
        expect(outcomes[0]).toMatchObject({
            taskName: 'configMigrate',
            status  : 'running',
            details : expect.objectContaining({reason: 'cascaded-from-primary-dev-sync', parent: 'primary-dev-sync'})
        });
        expect(outcomes[1]).toMatchObject({
            taskName: 'configMigrate',
            status  : 'completed',
            details : expect.objectContaining({reason: 'cascaded-from-primary-dev-sync', parent: 'primary-dev-sync'})
        });
    });

    test('runConfigMigrate isolates failure — records failed but does NOT rethrow (#12854 AC6, contrast runKbSync)', () => {
        // A stale-overlay migrate failure must never abort the already-successful pull, the sibling
        // KB cascade, or the parent task. Unlike runKbSync, runConfigMigrate swallows + records.
        const taskStateService = createTaskStateService();
        const outcomes         = [];
        const healthService    = {
            recordTaskOutcome(taskName, status, details) {
                outcomes.push({taskName, status, details});
            }
        };
        const execFileSyncFn = () => {
            const e  = new Error('initServerConfigs failed: drift overwrite error');
            e.status = 1;
            throw e;
        };

        expect(() => {
            PrimaryRepoSyncService.runConfigMigrate('/primary/neo', execFileSyncFn, {taskStateService, healthService});
        }).not.toThrow();

        expect(taskStateService.events).toEqual([
            ['started', 'configMigrate', 'cascaded-from-primary-dev-sync'],
            ['failed', 'configMigrate', 1]
        ]);
        expect(outcomes[1]).toMatchObject({
            taskName: 'configMigrate',
            status  : 'failed',
            details : expect.objectContaining({
                parent: 'primary-dev-sync',
                error : 'initServerConfigs failed: drift overwrite error'
            })
        });
    });

    test('runConfigMigrate is a pure shell-out when no services injected (#12854 backward-compat)', () => {
        const execFileSyncFn = createExecStub([{
            cmd : process.execPath,
            args: ['/primary/neo/ai/scripts/setup/initServerConfigs.mjs', '--migrate-config']
        }]);

        expect(() => {
            PrimaryRepoSyncService.runConfigMigrate('/primary/neo', execFileSyncFn);
        }).not.toThrow();

        expect(execFileSyncFn.calls.length).toBe(1);
        expect(execFileSyncFn.calls[0].cmd).toBe(process.execPath);
    });
});
