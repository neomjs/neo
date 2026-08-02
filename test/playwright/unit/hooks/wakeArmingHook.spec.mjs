import {expect, test}  from '@playwright/test';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {armSeatWakeRoute,
        INSTANCE_TYPE,
        resolveInstanceTuple,
        toBareIdentity}          from '../../../../ai/daemons/wake/armSeatWakeRoute.mjs';
import {readSubscriptionsOverMcp,
        readToolJson}            from '../../../../ai/daemons/wake/readSubscriptionsOverMcp.mjs';
import {armClaudeSeat,
        HOOK_TIMEOUT_MS,
        PUBLISH_MARGIN_MS,
        resolveExchangeDeadlineMs,
        resolveManifestPath}     from '../../../../.claude/hooks/wakeArmingHook.mjs';

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

    test('a publish that produces no route owned by this seat reports UNARMED (#16355)', async () => {
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-arm-home-'));
        fs.mkdirSync(path.join(homeDir, '.claude-instances', 'neo-opus-vega'), {recursive: true});

        // @neo-gpt's falsifier: a valid tuple, an EMPTY subscription set, and a builder that succeeds
        // with no routes. The builder withdraws only the caller's absent route and preserves peers', so
        // the manifest still looks healthy — reporting `armed` here recreates the exact lie this path
        // exists to remove. "The builder returned" is not "this seat is reachable".
        const empty = await armSeatWakeRoute({
            env              : {NEO_AGENT_IDENTITY: 'neo-opus-vega'},
            homeDir,
            listSubscriptions: async () => [],
            manifestPath     : path.join(homeDir, 'routes.json'),
            runBuilder       : async () => ({routeSummaries: [], skipped: []})
        });

        expect(empty.armed).toBe(false);
        expect(empty.routeCount).toBe(0);
        expect(empty.reason).toContain('NOT reachable');

        // And a peer's surviving route is not evidence of mine: `routeSummaries` is the MERGED table, so
        // a non-empty length alone would have counted someone else's reachability as my own.
        const peerOnly = await armSeatWakeRoute({
            env              : {NEO_AGENT_IDENTITY: 'neo-opus-vega'},
            homeDir,
            listSubscriptions: async () => [],
            manifestPath     : path.join(homeDir, 'routes.json'),
            runBuilder       : async () => ({
                routeSummaries: [{subscriptionId: 'WAKE_SUB:peer', agentIdentity: '@neo-gpt-emmy'}], skipped: []
            })
        });

        expect(peerOnly.armed).toBe(false);
        expect(peerOnly.routeCount).toBe(0);
    });

    test('an unconfigured plane base is a named skip, never a localhost guess (#16355)', async () => {
        let readerCalled = false;

        const result = await armClaudeSeat({
            env              : {NEO_AGENT_IDENTITY: 'neo-opus-vega'},
            config           : {planeBase: '   ', planeBearer: ''},
            listSubscriptions: async () => { readerCalled = true; return [] },
            arm              : async () => ({armed: true})
        });

        expect(result.armed).toBe(false);
        expect(result.reason).toContain('planeBase');
        expect(readerCalled).toBe(false);
    });

    test('the entrypoint injects the plane endpoint and credential into the reader (#16355)', async () => {
        let seen = null;

        await armClaudeSeat({
            env              : {NEO_AGENT_IDENTITY: 'neo-opus-vega'},
            config           : {planeBase: 'http://127.0.0.1:3102/', planeBearer: 'secret-token'},
            listSubscriptions: async options => { seen = options; return [] },
            arm              : async ({listSubscriptions}) => {
                await listSubscriptions();
                return {armed: false}
            }
        });

        // Trailing slash collapsed and the `/mc/mcp` ingress path appended, matching devFleetServer's
        // resolution of the same leaves rather than a second spelling of it.
        expect(seen.baseUrl).toBe('http://127.0.0.1:3102/mc/mcp');
        expect(seen.credential).toBe('secret-token');
    });

    test('the outer hook budget strictly exceeds the inner exchange, from one derived source (#16355)', async () => {
        // @neo-gpt's deadline finding: the registered hook timeout was 15s while the reader allowed 8s to
        // connect AND another 8s to list, so a slow plane could spend the whole caller budget and be killed
        // AFTER reading subscriptions and BEFORE publishing. Per-stage budgets do not compose.
        const exchange = resolveExchangeDeadlineMs();

        expect(exchange).toBeLessThan(HOOK_TIMEOUT_MS);
        expect(HOOK_TIMEOUT_MS - exchange).toBeGreaterThanOrEqual(PUBLISH_MARGIN_MS);

        // Never negative or zero, however the pair is later retuned — a non-positive deadline would make
        // every stage skip instantly and report a timeout that never happened.
        expect(resolveExchangeDeadlineMs(1000, 9000)).toBeGreaterThan(0);
    });

    test('the registered template timeout matches the constant the deadline is derived from (#16355)', () => {
        // Two places holding the same number drift silently, and the drift is invisible until a slow plane
        // truncates a run mid-publish. Bind them.
        const template = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude/settings.template.json'), 'utf8')),
              hook     = (template.hooks?.SessionStart || [])
                  .flatMap(entry => entry.hooks || [])
                  .find(entry => entry.command?.includes('wakeArmingHook.mjs'));

        expect(hook).toBeTruthy();
        expect(hook.timeout * 1000).toBe(HOOK_TIMEOUT_MS);
    });

    test('one shared deadline covers both MCP stages, not one budget each (#16355)', async () => {
        // The composed-boundary coverage: a connect that consumes the whole deadline must leave the LIST
        // stage nothing, rather than granting it a fresh budget of the same size.
        const started = Date.now();

        await expect(readSubscriptionsOverMcp({
            baseUrl       : 'http://127.0.0.1:9/mc/mcp',
            deadlineMs    : 300,
            TransportClass: class { async start() {} async send() {} async close() {} },
            ClientClass   : class {
                async connect() { return new Promise(() => {}) }
                async callTool() { return {content: []} }
                async close() {}
            }
        })).rejects.toThrow(/deadline/);

        // Bounded by the SHARED deadline, so nowhere near two stages' worth.
        expect(Date.now() - started).toBeLessThan(1500);
    });

    test('an already-spent deadline means the stage was never INVOKED, not merely reported skipped (#16355)', async () => {
        // @neo-gpt's probe: `bound(client.callTool(...), label)` evaluates the argument FIRST, so the stage
        // is already in flight when the guard rejects — he observed `callTool === 1` while the result claimed
        // the stage was skipped. A check that runs after the action cannot describe the action.
        //
        // Constructed with an already-spent budget rather than a slow stage: my first attempt made connect
        // consume the deadline, but then connect REJECTS and the second stage is never reached at all, so
        // the eager and thunked forms behaved identically and the test proved nothing. Mutation-testing it
        // is the only reason I found that out. A zero budget puts the FIRST stage on the wrong side of the
        // check deterministically, with no race.
        let connects = 0;

        await expect(readSubscriptionsOverMcp({
            baseUrl       : 'http://127.0.0.1:9/mc/mcp',
            deadlineMs    : 0,
            TransportClass: class { async start() {} async send() {} async close() {} },
            ClientClass   : class {
                async connect() { connects++ }
                async callTool() { return {content: [{type: 'text', text: '[]'}]} }
                async close() {}
            }
        })).rejects.toThrow(/not started/);

        // The load-bearing assertion: zero invocations, not "invoked and then disowned".
        expect(connects).toBe(0);
    });

    test('the reader resolves no config of its own and refuses an absent baseUrl (#16355)', async () => {
        // The config-SSOT repair, asserted behaviourally: the collaborator must not substitute a default.
        await expect(readSubscriptionsOverMcp({})).rejects.toThrow(/requires an injected baseUrl/);
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
                // Carries `agentIdentity` because the real builder's summaries do; without it the
                // ownership guard correctly refuses to call this seat reachable.
                return {routeSummaries: [{subscriptionId: 'WAKE_SUB:one', agentIdentity: '@neo-opus-vega'}], skipped: []}
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
            runBuilder       : async () => ({
                routeSummaries: [{subscriptionId: 'WAKE_SUB:mine', agentIdentity: '@neo-opus-vega'}], skipped: []
            })
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
