import {expect, test}  from '@playwright/test';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {armSeatWakeRoute,
        INSTANCE_TYPE,
        resolveInstanceTuple,
        toBareIdentity}          from '../../../../ai/daemons/wake/armSeatWakeRoute.mjs';
import {readToolJson,
        resolveBearerToken}      from '../../../../ai/daemons/wake/readSubscriptionsOverMcp.mjs';
import {resolveManifestPath}     from '../../../../.claude/hooks/wakeArmingHook.mjs';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * Session-start wake arming.
 *
 * The defect this covers is not a crash — it is a chain in which every step reports success while the
 * seat stays unreachable. So the assertions target the two silent-failure surfaces specifically:
 * a tuple that would be a guess must be a NAMED skip, and an unverifiable subscription set must never
 * be treated as an empty one.
 */
test.describe('Neo.ai.daemons.wake session-start arming', () => {
    test('a tuple is derived only when the seat directory actually exists', async () => {
        const homeDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-arm-home-')),
              identity = 'neo-opus-vega';

        fs.mkdirSync(path.join(homeDir, '.claude-instances', identity), {recursive: true});

        const tuple = await resolveInstanceTuple({env: {NEO_AGENT_IDENTITY: identity}, homeDir});

        expect(tuple.skipped).toBeUndefined();
        expect(tuple.identity).toBe('@neo-opus-vega');
        expect(tuple.instanceType).toBe(INSTANCE_TYPE);
        expect(tuple.instanceAddress).toBe(path.join(homeDir, '.claude-instances', identity));
    });

    test('an absent seat directory is a named skip, never a guessed address', async () => {
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-arm-home-'));

        // The parent exists and holds a NON-identity directory — the real fleet has `Neo` sitting
        // beside the seats, so "the convention is present" proves nothing about a given seat.
        fs.mkdirSync(path.join(homeDir, '.claude-instances', 'Neo'), {recursive: true});

        const tuple = await resolveInstanceTuple({env: {NEO_AGENT_IDENTITY: 'neo-absent-seat'}, homeDir});

        expect(tuple.skipped).toBe(true);
        expect(tuple.reason).toContain('does not exist');
        expect(tuple.instanceAddress).toBeUndefined();
    });

    test('a missing identity is a named skip rather than a default seat', async () => {
        const tuple = await resolveInstanceTuple({env: {}, homeDir: os.tmpdir()});

        expect(tuple.skipped).toBe(true);
        expect(tuple.reason).toContain('NEO_AGENT_IDENTITY');
    });

    test('arming publishes with the derived tuple and reports the route count', async () => {
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-arm-home-'));
        fs.mkdirSync(path.join(homeDir, '.claude-instances', 'neo-opus-vega'), {recursive: true});

        let seen = null;

        const result = await armSeatWakeRoute({
            env              : {NEO_AGENT_IDENTITY: 'neo-opus-vega'},
            homeDir,
            listSubscriptions: async () => [{id: 'WAKE_SUB:one'}],
            manifestPath     : path.join(homeDir, 'routes.json'),
            runBuilder       : async config => {
                seen = config;
                return {routeSummaries: [{id: 'WAKE_SUB:one'}], skipped: []}
            }
        });

        expect(result.armed).toBe(true);
        expect(result.routeCount).toBe(1);
        expect(seen.identity).toBe('@neo-opus-vega');
        expect(seen.instanceType).toBe(INSTANCE_TYPE);
        expect(seen.instanceAddress).toBe(path.join(homeDir, '.claude-instances', 'neo-opus-vega'));
        // The builder reads subscriptions from a path, so one must have been written for it.
        expect(typeof seen.subscriptionsPath).toBe('string');
    });

    test('the temp subscriptions file is removed after a publish', async () => {
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-arm-home-'));
        fs.mkdirSync(path.join(homeDir, '.claude-instances', 'neo-opus-vega'), {recursive: true});

        let writtenPath = null;

        await armSeatWakeRoute({
            env              : {NEO_AGENT_IDENTITY: 'neo-opus-vega'},
            homeDir,
            listSubscriptions: async () => [{id: 'WAKE_SUB:one'}],
            manifestPath     : path.join(homeDir, 'routes.json'),
            runBuilder       : async config => {
                writtenPath = config.subscriptionsPath;
                expect(fs.existsSync(writtenPath)).toBe(true);
                return {routeSummaries: [], skipped: []}
            }
        });

        expect(writtenPath).toBeTruthy();
        expect(fs.existsSync(writtenPath)).toBe(false);
    });

    test('a non-array subscription read is unverifiable and never publishes', async () => {
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-arm-home-'));
        fs.mkdirSync(path.join(homeDir, '.claude-instances', 'neo-opus-vega'), {recursive: true});

        let published = false;

        const result = await armSeatWakeRoute({
            env              : {NEO_AGENT_IDENTITY: 'neo-opus-vega'},
            homeDir,
            listSubscriptions: async () => ({unexpected: 'shape'}),
            manifestPath     : path.join(homeDir, 'routes.json'),
            runBuilder       : async () => { published = true; return {routeSummaries: []} }
        });

        expect(result.armed).toBe(false);
        expect(result.reason).toContain('unverifiable');
        // The load-bearing half: publishing an empty set would WITHDRAW this seat's own route on an
        // absence that was never established. Reporting unarmed is the safe outcome, not a fallback.
        expect(published).toBe(false);
    });

    test('subscriptions owned by another seat are refused, never published against this address', async () => {
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-arm-home-'));
        fs.mkdirSync(path.join(homeDir, '.claude-instances', 'neo-opus-vega'), {recursive: true});

        let published = false;

        // Reproduces a measured live failure: the subscription set is scoped by the AUTHENTICATED
        // identity while the tuple comes from this seat's environment. Holding a peer's credential
        // returned the PEER's subscription, which was then published pointed at MY userDataDir — the
        // wrong-seat mis-wake the builder refuses a guessed tuple specifically to prevent. The run
        // reported "armed" while doing it, so only an identity-agreement check catches this.
        const result = await armSeatWakeRoute({
            env              : {NEO_AGENT_IDENTITY: 'neo-opus-vega'},
            homeDir,
            listSubscriptions: async () => [{id: 'WAKE_SUB:peer', agentIdentity: '@neo-gpt-emmy'}],
            manifestPath     : path.join(homeDir, 'routes.json'),
            runBuilder       : async () => { published = true; return {routeSummaries: [{}]} }
        });

        expect(result.armed).toBe(false);
        expect(result.reason).toContain('@neo-gpt-emmy');
        expect(result.reason).toContain('@neo-opus-vega');
        expect(published).toBe(false);
    });

    test('a matching owner still publishes, so the identity guard is not a blanket refusal', async () => {
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-arm-home-'));
        fs.mkdirSync(path.join(homeDir, '.claude-instances', 'neo-opus-vega'), {recursive: true});

        // The positive control for the guard above: with agreement, arming proceeds. Without this, the
        // guard could reject everything and the refusal test would still pass.
        const result = await armSeatWakeRoute({
            env              : {NEO_AGENT_IDENTITY: 'neo-opus-vega'},
            homeDir,
            listSubscriptions: async () => [{id: 'WAKE_SUB:mine', agentIdentity: '@neo-opus-vega'}],
            manifestPath     : path.join(homeDir, 'routes.json'),
            runBuilder       : async () => ({routeSummaries: [{id: 'WAKE_SUB:mine'}], skipped: []})
        });

        expect(result.armed).toBe(true);
        expect(result.routeCount).toBe(1);
    });

    test('a throwing publish is reported, never propagated', async () => {
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-arm-home-'));
        fs.mkdirSync(path.join(homeDir, '.claude-instances', 'neo-opus-vega'), {recursive: true});

        const result = await armSeatWakeRoute({
            env              : {NEO_AGENT_IDENTITY: 'neo-opus-vega'},
            homeDir,
            listSubscriptions: async () => [{id: 'WAKE_SUB:one'}],
            manifestPath     : path.join(homeDir, 'routes.json'),
            runBuilder       : async () => { throw new Error('manifest lock held') }
        });

        expect(result.armed).toBe(false);
        expect(result.reason).toContain('manifest lock held');
    });

    test('an unrecognised MCP payload throws rather than yielding an empty set', () => {
        expect(() => readToolJson({content: [{type: 'text', text: '{"subscriptions":[]}'}]}))
            .not.toThrow();
        expect(() => readToolJson({content: []})).toThrow(/no text content/);
        expect(() => readToolJson({})).toThrow(/no text content/);
    });

    test('an empty bearer-token file is rejected rather than sent as no credential', () => {
        const dir   = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-arm-token-')),
              empty = path.join(dir, 'empty-token');

        fs.writeFileSync(empty, '   \n');

        expect(() => resolveBearerToken(empty)).toThrow(/no credential/);
        expect(resolveBearerToken(null)).toBeNull();
    });

    test('toBareIdentity strips the handle sigil and rejects non-strings', () => {
        expect(toBareIdentity('@neo-opus-vega')).toBe('neo-opus-vega');
        expect(toBareIdentity('neo-opus-vega')).toBe('neo-opus-vega');
        expect(toBareIdentity('   ')).toBeNull();
        expect(toBareIdentity(undefined)).toBeNull();
    });

    test('the manifest path honours the environment and otherwise matches the receiver default', () => {
        expect(resolveManifestPath({env: {NEO_WAKE_RECEIVER_MANIFEST: '/tmp/custom.json'}}))
            .toBe('/tmp/custom.json');
        expect(resolveManifestPath({env: {}, homeDir: '/Users/example'}))
            .toBe('/Users/example/Library/Application Support/Neo/AgentOS/wake/routes.json');
    });

    test('the TRACKED settings template carries the SessionStart hook', () => {
        // Asserted against the tracked template, not `.claude/settings.json` — that file is gitignored,
        // so a hook registered only there arms one seat and reaches no other maintainer while still
        // reporting success. This assertion is what makes the fix portable.
        const template = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude/settings.template.json'), 'utf8')),
              commands = (template.hooks?.SessionStart || []).flatMap(entry => entry.hooks || []).map(hook => hook.command);

        expect(commands.some(command => command.includes('wakeArmingHook.mjs'))).toBe(true);
    });

    test('the arming path opens no graph database by file path', () => {
        // The falsified design: a host process cannot reach the containerized Memory Core's SQLite,
        // so a path read lands on a diverged store and SUCCEEDS with a stale route set. A green suite
        // cannot see that, which is why the prohibition is asserted structurally on the source.
        for (const relative of [
            'ai/daemons/wake/armSeatWakeRoute.mjs',
            'ai/daemons/wake/readSubscriptionsOverMcp.mjs',
            '.claude/hooks/wakeArmingHook.mjs'
        ]) {
            const source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');

            expect(source, `${relative} must not open a database directly`).not.toContain('better-sqlite3');
            expect(source, `${relative} must not resolve a graph db path`).not.toContain('memory-core-graph.sqlite');
        }
    });
});
