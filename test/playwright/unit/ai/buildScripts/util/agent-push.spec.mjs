import {test, expect} from '@playwright/test';
import {
    assertSafeRefspec,
    buildGitPushArgs,
    getCurrentBranch,
    normalizeDestination,
    parseArgs,
    resolveDestination,
    runAgentPush
} from '../../../../../../buildScripts/util/agent-push.mjs';

test.describe('agent-push utility (#14419)', () => {
    test('parses the narrow accepted argv surface', () => {
        expect(parseArgs([])).toEqual({remote: 'origin', refspec: null, setUpstream: false});
        expect(parseArgs(['-u'])).toEqual({remote: 'origin', refspec: null, setUpstream: true});
        expect(parseArgs(['origin'])).toEqual({remote: 'origin', refspec: null, setUpstream: false});
        expect(parseArgs(['-u', 'origin', 'agent/14419-agent-push'])).toEqual({
            remote     : 'origin',
            refspec    : 'agent/14419-agent-push',
            setUpstream: true
        })
    });

    test('refuses unsafe or widening push grammar before destination resolution', () => {
        const rejected = [
            ['upstream', 'agent/demo'],
            ['origin', 'agent/demo:dev'],
            ['origin', 'HEAD:refs/heads/dev'],
            ['origin', 'agent/demo', 'agent/extra'],
            ['origin', '+agent/demo'],
            ['origin', 'agent/*'],
            ['--tags'],
            ['--all'],
            ['--mirror'],
            ['--delete'],
            ['--force'],
            ['--force-with-lease'],
            ['--force-if-includes'],
            ['-f'],
            ['--porcelain']
        ];

        for (const argv of rejected) {
            expect(() => parseArgs(argv), argv.join(' ')).toThrow()
        }
    });

    test('refspec validation rejects source-destination and wildcard forms', () => {
        expect(() => assertSafeRefspec('agent/demo:dev')).toThrow(/colon refspec/u);
        expect(() => assertSafeRefspec('HEAD:refs/heads/dev')).toThrow(/colon refspec/u);
        expect(() => assertSafeRefspec('+agent/demo')).toThrow(/force refspec/u);
        expect(() => assertSafeRefspec('agent/*')).toThrow(/wildcard/u);
        expect(() => assertSafeRefspec('agent/demo')).not.toThrow()
    });

    test('normalizes refs/heads prefixes without accepting unsafe destinations', () => {
        expect(normalizeDestination('refs/heads/agent/demo')).toBe('agent/demo');
        expect(normalizeDestination('agent/demo')).toBe('agent/demo')
    });

    test('resolves the effective destination from explicit, HEAD, and implicit forms', () => {
        expect(resolveDestination({
            currentBranch: 'agent/current',
            refspec      : 'agent/explicit'
        })).toBe('agent/explicit');

        expect(resolveDestination({
            currentBranch: 'agent/current',
            refspec      : 'refs/heads/agent/full-ref'
        })).toBe('agent/full-ref');

        expect(resolveDestination({
            currentBranch: 'agent/current',
            refspec      : 'HEAD'
        })).toBe('agent/current');

        expect(resolveDestination({
            currentBranch: 'agent/current',
            refspec      : null
        })).toBe('agent/current')
    });

    test('refuses destinations outside agent branches', () => {
        expect(() => resolveDestination({
            currentBranch: 'dev',
            refspec      : null
        })).toThrow(/agent\/\*/u);

        expect(() => resolveDestination({
            currentBranch: 'agent/current',
            refspec      : 'main'
        })).toThrow(/agent\/\*/u)
    });

    test('reads the current branch through git and rejects detached HEAD', () => {
        const execFileSyncImpl = () => 'agent/current\n';

        expect(getCurrentBranch({execFileSyncImpl})).toBe('agent/current');
        expect(() => getCurrentBranch({execFileSyncImpl: () => 'HEAD\n'})).toThrow(/detached HEAD/u)
    });

    test('builds deterministic git push argv with the resolved destination', () => {
        expect(buildGitPushArgs({
            destination: 'agent/current',
            remote     : 'origin'
        })).toEqual(['push', 'origin', 'agent/current']);

        expect(buildGitPushArgs({
            destination: 'agent/current',
            remote     : 'origin',
            setUpstream: true
        })).toEqual(['push', '-u', 'origin', 'agent/current']);

        expect(buildGitPushArgs({
            destination: 'agent/current',
            refspec    : 'agent/explicit',
            remote     : 'origin'
        })).toEqual(['push', 'origin', 'agent/explicit'])
    });

    test('executes git push only after validation and propagates the git status', () => {
        const calls  = [];
        const status = runAgentPush({
            argv            : ['-u'],
            cwd             : '/repo',
            execFileSyncImpl: () => 'agent/current\n',
            spawnSyncImpl   : (cmd, args, options) => {
                calls.push({cmd, args, options});
                return {status: 7}
            },
            stderr: {write: () => {}}
        });

        expect(status).toBe(7);
        expect(calls).toEqual([{
            cmd    : 'git',
            args   : ['push', '-u', 'origin', 'agent/current'],
            options: {cwd: '/repo', stdio: 'inherit'}
        }])
    });

    test('does not invoke git when validation fails', () => {
        let   stderr = '';
        const calls  = [];

        const status = runAgentPush({
            argv            : ['origin', 'agent/current:dev'],
            execFileSyncImpl: () => 'agent/current\n',
            spawnSyncImpl   : (...args) => calls.push(args),
            stderr          : {write: value => { stderr += value }}
        });

        expect(status).toBe(1);
        expect(calls).toEqual([]);
        expect(stderr).toContain('agent-push:')
    })
});
