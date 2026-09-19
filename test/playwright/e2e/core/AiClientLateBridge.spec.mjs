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

    await expect.poll(() => lines.some(line => line.includes('reconnecting stopped')), {
        message: 'the client gave up',
        timeout: 10000
    }).toBe(true);

    return {dials, lines, worker}
}

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
              {lines}     = await boot(page, port, {cycle: 50, after: 50}),
              gaveUp      = () => lines.filter(line => line.includes('reconnecting stopped')).length;

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

        await returnToWindow(page);
        await page.waitForTimeout(300);

        expect(connections.length, 'no second socket, while connecting or once connected').toBe(1);

        const reported = gaveUp();

        await stopBridge();

        await expect.poll(gaveUp, {message: 'a bridge lost later is reported again'}).toBe(reported + 1)
    });

    test('without a bridge, a return dials once per backoff step and the client prints nothing about it', async ({page}) => {
        const port                   = await freePort(),
              {dials, lines, worker} = await boot(page, port, {cycle: 50, after: 1500});

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
