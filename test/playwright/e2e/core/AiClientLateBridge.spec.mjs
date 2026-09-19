import {expect, test}    from '../../fixtures.mjs';
import net               from 'node:net';
import {WebSocketServer} from 'ws';

/**
 * @summary A Neural Link client that gave up dials again when a user returns to one of its windows, and never on its own.
 *
 * Every refused WebSocket dial writes a browser-level DevTools error that no script can suppress, so a background poll
 * would print into the console of every developer who runs an app without a bridge. The witness for that output is the
 * DevTools protocol's `Log` domain, which the console API never sees.
 *
 * The client's backoff is shortened in the App Worker, so it gives up within about a second instead of fifteen. The
 * step after giving up is the gap a user's return must respect.
 *
 * Losing a bridge must end in one bounded reconnect cycle. The worker forwards its console to a connected bridge, so a
 * log line written while the client still counts as connected is a send through the failed socket, which reconnects and
 * logs again. A lost connection reaches the client either as `close` alone or as `error` before `close`, and each has an
 * arm.
 */

const APP = '/examples/button/base/index.html';

/**
 * @returns {Promise<Number>} a port nothing listens on: bound by the OS, then released
 */
const freePort = () => new Promise(resolve => {
    const server = net.createServer().listen(0, '127.0.0.1', () => {
        const {port} = server.address();

        server.close(() => resolve(port))
    })
});

/**
 * Stands in for a user returning to the window.
 * @param {Page} page
 * @returns {Promise<void>}
 */
const returnToWindow = page => page.evaluate(() => window.dispatchEvent(new Event('focus')));

/**
 * Boots the app with its client pointed at `port`, and records what the App Worker and the browser print.
 * @param {Page}   page
 * @param {Number} port
 * @param {Object} backoff
 * @param {Number} backoff.cycle The client's own reconnect steps
 * @param {Number} backoff.after The step after it gave up
 * @returns {Promise<{dials: String[], lines: String[], worker: Worker}>} `dials` are the browser's refused-connection
 * entries, `lines` the App Worker's console output
 */
async function boot(page, port, {cycle, after}) {
    const dials   = [],
          lines   = [],
          session = await page.context().newCDPSession(page);

    session.on('Log.entryAdded', ({entry}) => entry.text.includes(`127.0.0.1:${port}`) && dials.push(entry.text));
    await session.send('Log.enable');

    page.on('console', message => message.worker() && lines.push(message.text()));

    await page.route('**/examples/button/base/neo-config.json*', async route => {
        const response = await route.fetch(),
              config   = await response.json();

        await route.fulfill({response, json: {...config, neuralLinkUrl: `ws://127.0.0.1:${port}`, useAiClient: true}})
    });

    const [worker] = await Promise.all([
        page.waitForEvent('worker', worker => worker.url().includes('/worker/App.mjs')),
        page.goto(APP)
    ]);

    await expect.poll(() => worker.evaluate(() => !!globalThis.Neo?.ai?.Client?.socket), {
        message: 'the App Worker runs the client'
    }).toBe(true);

    await worker.evaluate(({cycle, after}) => {
        const {socket} = Neo.ai.Client;

        socket.backoffStrategy = attempt => attempt < socket.maxReconnectAttempts ? cycle : after
    }, {cycle, after});

    return {dials, lines, worker}
}

/**
 * @param {String[]} lines The App Worker's console output
 * @returns {Number} how often the client reported giving up
 */
const giveUps = lines => lines.filter(line => line.includes('reconnecting stopped')).length;

/**
 * @param {String[]} lines
 * @returns {Promise<void>}
 */
const expectGaveUp = lines => expect.poll(() => giveUps(lines), {message: 'the client gave up', timeout: 10000}).toBe(1);

test.describe('Neo.ai.Client late bridge', () => {
    let server;

    /**
     * Stops the bridge. close() waits for every open connection, so the client's ends first.
     * @returns {Promise<void>}
     */
    const stopBridge = () => new Promise(resolve => {
        if (!server) {
            return resolve()
        }

        server.clients.forEach(client => client.terminate());
        server.close(() => resolve());
        server = null
    });

    test.afterEach(stopBridge);

    test('an app that gave up attaches to a bridge started later, once, when a user returns to its window', async ({page}) => {
        const port        = await freePort(),
              connections = [],
              {lines}     = await boot(page, port, {cycle: 50, after: 50});

        await expectGaveUp(lines);

        server = new WebSocketServer({host: '127.0.0.1', port});

        server.on('connection', socket => {
            const connection = {messages: []};

            connections.push(connection);
            socket.on('message', data => connection.messages.push(JSON.parse(data)))
        });

        await page.waitForTimeout(100);

        // The window shows again, and reports it twice: the second report arrives while the first dial connects
        await page.evaluate(() => {
            document.dispatchEvent(new Event('visibilitychange'));
            document.dispatchEvent(new Event('visibilitychange'))
        });

        await expect.poll(() => connections[0]?.messages.find(message => message.method === 'register')?.params, {
            message: 'the client registers with the bridge'
        }).toMatchObject({appWorkerId: expect.any(String)});

        // The console lines buffered while no bridge listened arrive first, then the line announcing this connection
        const forwarded = connections[0].messages.filter(({method}) => method === 'console_log').map(({params}) => params.message),
              stopped   = forwarded.findIndex(line => line.includes('reconnecting stopped')),
              connected = forwarded.findIndex(line => line.includes('Connected to MCP Server'));

        expect(stopped, 'the buffered lines reach the bridge').toBeGreaterThanOrEqual(0);
        expect(connected, 'before the line announcing the connection').toBeGreaterThan(stopped);

        await returnToWindow(page);
        await page.waitForTimeout(300);

        expect(connections.length, 'no second socket, while connecting or once connected').toBe(1);

        await stopBridge();

        await expect.poll(() => giveUps(lines), {message: 'a bridge lost later is reported again'}).toBe(2)
    });

    test('a bridge that fails with an error before the close is reported once, and nothing re-enters', async ({page}) => {
        const port = await freePort();

        let bridgeSide = null;

        server = new WebSocketServer({host: '127.0.0.1', port});
        server.on('connection', socket => socket.on('message', data => {
            JSON.parse(data).method === 'register' && (bridgeSide = socket)
        }));

        const {lines} = await boot(page, port, {cycle: 50, after: 50});

        await expect.poll(() => !!bridgeSide, {message: 'the client registers with the bridge'}).toBe(true);

        // An invalid UTF-8 text frame makes the browser fail the connection, so `error` fires before `close`. The listener
        // stops too, without terminating the connection, so the client's own reconnect attempts are refused
        bridgeSide._socket.write(Buffer.from([0x81, 0x01, 0xff]));
        server.close();
        server = null;

        await expect.poll(() => giveUps(lines), {message: 'one reconnect cycle, reported once'}).toBe(1);

        // wall-clock-under-test: a re-entered cycle reports again within milliseconds, so the arm waits one out
        await page.waitForTimeout(300);

        expect(giveUps(lines), 'and not again').toBe(1);
        expect(lines.filter(line => line.includes('reconnect attempt')).length, "the cycle's own attempts, none re-entered")
            .toBe(4)
    });

    test('without a bridge, a return dials once per backoff step and the client prints nothing about it', async ({page}) => {
        const port                   = await freePort(),
              {dials, lines, worker} = await boot(page, port, {cycle: 50, after: 1500});

        await expectGaveUp(lines);

        const gaveUp = Date.now(),
              quiet  = {dials: dials.length, lines: lines.length};

        await page.waitForTimeout(300);
        expect({dials: dials.length, lines: lines.length}, 'nothing dials or prints after giving up').toEqual(quiet);

        await returnToWindow(page);
        await page.waitForTimeout(300);
        expect(dials.length, 'a return inside the step after giving up does not dial').toBe(quiet.dials);

        await page.waitForTimeout(Math.max(0, gaveUp + 1600 - Date.now()));
        await returnToWindow(page);

        await expect.poll(() => dials.length, {message: 'a return after the step dials once'}).toBe(quiet.dials + 1);

        await returnToWindow(page);
        await page.waitForTimeout(300);

        expect(dials.length, 'a return right after a refused dial waits for the next step').toBe(quiet.dials + 1);
        expect(lines.slice(quiet.lines), 'and the refused dial printed nothing through the console API').toEqual([]);

        expect(await worker.evaluate(() => Neo.ai.Client.isConnected)).toBe(false)
    })
});
