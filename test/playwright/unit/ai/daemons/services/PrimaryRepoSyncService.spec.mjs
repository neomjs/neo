import {test, expect} from '@playwright/test';
import Neo       from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';
import PrimaryRepoSyncService, {
    buildPrimaryRepoSyncTrigger,
    parseEnabledFlag
} from '../../../../../../ai/daemons/services/PrimaryRepoSyncService.mjs';
import {
    PRIMARY_DEV_SYNC_TASK_NAME
} from '../../../../../../ai/daemons/TaskDefinitions.mjs';

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
    test('builds interval triggers and parses the enable flag', () => {
        expect(parseEnabledFlag(undefined)).toBe(true);
        expect(parseEnabledFlag('false')).toBe(false);
        expect(parseEnabledFlag('0')).toBe(false);
        expect(parseEnabledFlag('true')).toBe(true);

        expect(buildPrimaryRepoSyncTrigger({
            enabled   : true,
            now       : 600000,
            lastRunAt : 0,
            intervalMs: 600000
        })).toEqual({
            taskName: PRIMARY_DEV_SYNC_TASK_NAME,
            source  : 'periodic-sweep',
            reason  : 'periodic-sweep:600000'
        });

        expect(buildPrimaryRepoSyncTrigger({
            enabled   : false,
            now       : 600000,
            lastRunAt : 0,
            intervalMs: 600000
        })).toBeNull();
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
            cmd : 'git',
            args: ['pull', '--ff-only', 'origin', 'dev']
        }, {
            cmd : process.platform === 'win32' ? 'npm.cmd' : 'npm',
            args: ['run', 'ai:sync-kb']
        }]);

        expect(PrimaryRepoSyncService.syncPrimaryDev({
            cwd           : '/primary/neo',
            execFileSyncFn: execStub,
            writeLog      : () => {}
        })).toEqual({
            status : 'completed',
            details: {
                primaryRoot: '/primary/neo',
                behind     : 2,
                layer      : 'ff-pull',
                kbSync     : true
            }
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
            cmd : 'git',
            args: ['checkout', '--', 'resources/content/.sync-metadata.json']
        }, {
            cmd : 'git',
            args: ['pull', '--ff-only', 'origin', 'dev']
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
        expect(result.details.resolved).toBe('meta-sync');
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
            ['started', PRIMARY_DEV_SYNC_TASK_NAME, 'periodic-sweep:600000'],
            ['skipped', PRIMARY_DEV_SYNC_TASK_NAME]
        ]);
        expect(outcomes[0].status).toBe('skipped');
        expect(outcomes[0].details.reasonCode).toBe('up-to-date');
    });
});
