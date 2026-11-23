import {test, expect}        from '@playwright/test';
import {execFileSync, spawn} from 'node:child_process';
import fs                    from 'node:fs';
import http                  from 'node:http';
import net                   from 'node:net';
import os                    from 'node:os';
import path                  from 'node:path';
import {fileURLToPath}       from 'node:url';

import {
    contentType,
    createFileServer,
    isAllowedHost,
    listen,
    main,
    openBrowser,
    parseOptions,
    run
} from '../../../../../buildScripts/util/fileServer.mjs';

const SCRIPT = fileURLToPath(new URL('../../../../../buildScripts/util/fileServer.mjs', import.meta.url));

/**
 * @summary Resolves a port nothing listens on.
 * @returns {Promise<Number>}
 */
const freePort = () => new Promise(resolve => {
    const probe = net.createServer().listen(0, () => {
        const {port} = probe.address();
        probe.close(() => resolve(port))
    })
});

/**
 * @summary Requests a raw path, which `fetch` would normalize first, optionally under another `Host`.
 * @param {String} base
 * @param {String} rawPath
 * @param {String} [host]
 * @returns {Promise<Number>} The status code.
 */
const rawStatus = (base, rawPath, host) => new Promise((resolve, reject) => {
    http.get(base + rawPath, host ? {headers: {host}} : {}, response => {
        response.resume();
        resolve(response.statusCode)
    }).on('error', reject)
});

/**
 * @summary Pins the development server behind `npm run server-start`: what it serves, what it refuses,
 * and how it reads its port and browser flags.
 */
test.describe('buildScripts/util/fileServer (#21215)', () => {
    const createFreshness = () => ({
        listening: 0,
        requests : [],
        onListening() {this.listening++},
        onRequest(pathname) {this.requests.push(pathname)}
    });

    let base, freshness, root, server;

    test.beforeAll(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-file-server-'));

        const write = (file, content) => {
            fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
            fs.writeFileSync(path.join(root, file), content)
        };

        write('app/index.html', '<!doctype html><title>app</title>');
        write('listed/a.mjs', 'export default 1;');
        write('listed/sub dir/b.txt', 'b');
        write('listed/.hidden', 'secret');
        write('module.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
        write('range.txt', '0123456789');
        write('.git/config', 'secret');
        write('.env', 'TOKEN=secret');
        write('.github/RELEASE_NOTES/v14.0.0.md', '# 14.0.0');
        write('.github/RELEASE_NOTES/.draft.md', 'draft');

        // Playwright can run this hook again in a worker reused for another test group.
        freshness = createFreshness();
        server    = createFileServer({root, freshness});
        base      = `http://localhost:${await listen(server, {port: 0, strict: true})}`
    });

    test.afterAll(() => {
        server.closeAllConnections();
        server.close();
        fs.rmSync(root, {force: true, recursive: true})
    });

    test('serves modules and wasm with their MIME types', async () => {
        const module = await fetch(`${base}/listed/a.mjs`),
              wasm   = await fetch(`${base}/module.wasm`);

        expect(module.status).toBe(200);
        expect(module.headers.get('content-type')).toMatch(/^text\/javascript/);
        expect(await module.text()).toBe('export default 1;');
        expect(wasm.headers.get('content-type')).toBe('application/wasm')
    });

    test('answers a range with 206, a suffix range from the end, and an unsatisfiable one with 416', async () => {
        const range  = await fetch(`${base}/range.txt`, {headers: {Range: 'bytes=2-5'}}),
              suffix = await fetch(`${base}/range.txt`, {headers: {Range: 'bytes=-3'}}),
              beyond = await fetch(`${base}/range.txt`, {headers: {Range: 'bytes=20-'}});

        expect(range.status).toBe(206);
        expect(range.headers.get('content-range')).toBe('bytes 2-5/10');
        expect(await range.text()).toBe('2345');
        expect(await suffix.text()).toBe('789');
        expect(beyond.status).toBe(416);
        expect(beyond.headers.get('content-range')).toBe('bytes */10')
    });

    test('revalidates: If-None-Match by weak comparison or *, else If-Modified-Since', async () => {
        const first    = await fetch(`${base}/range.txt`),
              etag     = first.headers.get('etag'),
              modified = first.headers.get('last-modified'),
              earlier  = new Date(Date.parse(modified) - 60000).toUTCString(),
              status   = async headers => (await fetch(`${base}/range.txt`, {headers})).status;

        expect(first.headers.get('cache-control')).toBe('no-cache');
        expect(await status({'If-None-Match': etag})).toBe(304);
        expect(await status({'If-None-Match': `"other", ${etag.slice(2)}`})).toBe(304);
        expect(await status({'If-None-Match': '*'})).toBe(304);
        expect(await status({'If-Modified-Since': modified})).toBe(304);
        expect(await status({'If-Modified-Since': earlier})).toBe(200);
        expect(await status({'If-Modified-Since': 'not a date'})).toBe(200);
        // If-None-Match decides alone: a date that would answer 304 does not count beside a tag that does not match
        expect(await status({'If-None-Match': '"other"', 'If-Modified-Since': modified})).toBe(200)
    });

    test('a range under If-Range answers the whole current file: no validator of this server is strong', async () => {
        const file   = path.join(root, 'resume.txt'),
              time   = new Date('2026-01-01T00:00:00Z'),
              resume = headers => fetch(`${base}/resume.txt`, {headers: {Range: 'bytes=2-', ...headers}}),
              write  = content => {fs.writeFileSync(file, content); fs.utimesSync(file, time, time)};

        write('abcdefghij');

        const held = await fetch(`${base}/resume.txt`);

        // A second revision of the same size and time carries the same tag and the same date
        write('ABCDEFGHIJ');

        for (const ifRange of [held.headers.get('etag'), held.headers.get('last-modified')]) {
            const response = await resume({'If-Range': ifRange});

            expect(response.status, ifRange).toBe(200);
            expect(await response.text()).toBe('ABCDEFGHIJ')
        }

        expect((await resume()).status).toBe(206)
    });

    test('a client that leaves mid-transfer closes the file the server was reading', async () => {
        const {createReadStream} = fs,
              opened             = [],
              size               = 32 * 1024 * 1024;

        fs.writeFileSync(path.join(root, 'large.bin'), Buffer.alloc(size));
        fs.createReadStream = (...args) => {
            const stream = createReadStream(...args);
            opened.push(stream);
            return stream
        };

        try {
            await new Promise((resolve, reject) => {
                const request = http.get(`${base}/large.bin`, response => {
                    response.once('data', () => {
                        request.destroy();
                        resolve()
                    })
                });

                request.on('error', error => error.code !== 'ECONNRESET' && reject(error))
            });

            const [stream] = opened;

            expect(stream.bytesRead, 'the client left before the file was read').toBeLessThan(size);

            await new Promise((resolve, reject) => {
                if (stream.closed) return resolve();

                const timer = setTimeout(() => reject(new Error('the file stream is still open')), 2000);

                stream.once('close', () => {
                    clearTimeout(timer);
                    resolve()
                })
            });

            expect(stream.destroyed).toBe(true)
        } finally {
            fs.createReadStream = createReadStream
        }
    });

    test('a directory answers with its index.html, or else a listing; without its slash it redirects', async () => {
        const redirect = await fetch(`${base}/app?x=1`, {redirect: 'manual'}),
              index    = await fetch(`${base}/app/`),
              listing  = await (await fetch(`${base}/listed/`)).text();

        expect(redirect.status).toBe(301);
        expect(redirect.headers.get('location')).toBe('/app/?x=1');
        expect(await index.text()).toContain('<title>app</title>');
        expect(listing).toContain('href="a.mjs"');
        expect(listing).toContain('href="sub%20dir/"');
        expect(listing).toContain('href="../"');
        expect(listing).not.toContain('.hidden')
    });

    test('serves the release notes at their own path and no other dot-path', async () => {
        const notes = await fetch(`${base}/.github/RELEASE_NOTES/v14.0.0.md`);

        expect(notes.status).toBe(200);
        expect(await notes.text()).toBe('# 14.0.0');

        for (const closed of ['/.github/RELEASE_NOTES/.draft.md', '/.git/config', '/.env', '/listed/.hidden']) {
            expect((await fetch(base + closed)).status, closed).toBe(404)
        }

        expect(await rawStatus(base, '/..%2f..%2fetc%2fpasswd')).toBe(404);
        expect(await rawStatus(base, '/listed/%2e%2e/%2e%2e/etc/passwd')).toBe(404)
    });

    test('answers an IP, localhost or *.localhost, and refuses any other Host with 403', async () => {
        const port = new URL(base).port;

        expect(await rawStatus(base, '/range.txt', 'rebind.example')).toBe(403);
        expect(await rawStatus(base, '/range.txt', `rebind.example:${port}`)).toBe(403);

        for (const host of [`localhost:${port}`, 'app.localhost', `127.0.0.1:${port}`, `[::1]:${port}`, '192.168.1.20']) {
            expect(await rawStatus(base, '/range.txt', host), host).toBe(200)
        }

        expect(isAllowedHost('LOCALHOST')).toBe(true);
        expect(isAllowedHost('localhost.example')).toBe(false);
        expect(isAllowedHost('')).toBe(false)
    });

    test('every extension the served tree holds, tracked or built, has a type of its own', () => {
        // Derived from the tree, never from the table it checks: a file type the repository adds
        // tomorrow reds here until it is mapped. Dot-paths are never served; extensionless files
        // (licenses) have no extension to map.
        const engineRoot = fileURLToPath(new URL('../../../../../', import.meta.url)),
              tracked    = execFileSync('git', ['ls-files'], {cwd: engineRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}).split('\n'),
              dist       = path.join(engineRoot, 'dist'),
              built      = fs.existsSync(dist) ? fs.readdirSync(dist, {recursive: true, withFileTypes: true})
                  .filter(entry => entry.isFile())
                  .map(entry => path.relative(dist, path.join(entry.parentPath, entry.name))) : [],
              extensions = new Set([...tracked, ...built]
                  .filter(file => file && !/(^|[\\/])\./.test(file))
                  .map(file => path.extname(file).toLowerCase())
                  .filter(Boolean));

        expect(extensions.size).toBeGreaterThan(10);

        for (const extension of extensions) {
            expect(contentType(`file${extension}`), extension).not.toBe('application/octet-stream')
        }
    });

    test('answers GET and HEAD only', async () => {
        const post = await fetch(`${base}/range.txt`, {method: 'POST'}),
              head = await fetch(`${base}/range.txt`, {method: 'HEAD'});

        expect(post.status).toBe(405);
        expect(post.headers.get('allow')).toBe('GET, HEAD');
        expect(head.status).toBe(200);
        expect(head.headers.get('content-length')).toBe('10');
        expect(await head.text()).toBe('')
    });

    test('starts the freshness check on listening and hands it every request path', async () => {
        await fetch(`${base}/dist/development/css/src/Global.css?theme=dark`);

        expect(freshness.listening).toBe(1);
        expect(freshness.requests).toContain('/dist/development/css/src/Global.css')
    });

    test('a taken port fails when it was asked for, and is skipped when it was not', async () => {
        const blocker = net.createServer(),
              taken   = await new Promise(resolve => blocker.listen(0, () => resolve(blocker.address().port))),
              strict  = createFileServer({root, freshness: createFreshness()}),
              lenient = createFileServer({root, freshness: createFreshness()});

        try {
            await expect(listen(strict, {port: taken, strict: true})).rejects.toMatchObject({code: 'EADDRINUSE'});
            expect(await listen(lenient, {port: taken})).toBeGreaterThan(taken)
        } finally {
            lenient.close();
            blocker.close()
        }
    });

    test('reads --port, then PORT, then 8080; the last open flag wins', () => {
        const argv = (...args) => ['node', SCRIPT, ...args];

        expect(parseOptions(argv('--port', '4321'), {PORT: '4400'})).toEqual({open: undefined, port: 4321, strict: true});
        expect(parseOptions(argv(), {PORT: '4400'})).toMatchObject({port: 4400, strict: true});
        expect(parseOptions(argv(), {})).toMatchObject({port: 8080, strict: false});
        expect(parseOptions(argv('--open', '--port', '1', '--no-open'), {}).open).toBe(false);
        expect(parseOptions(argv('--open', '--open', 'apps/portal/'), {}).open).toBe('apps/portal/');
        expect(() => parseOptions(argv('--port', 'x'), {})).toThrow('invalid port: x')
    });

    test('opens the browser with the platform opener, without waiting for it', () => {
        const calls = [],
              run   = (command, args, options) => {
                  calls.push([command, args, options.detached]);
                  return {on() {}, unref() {}}
              };

        openBrowser('http://localhost:1/a/', {platform: 'darwin', run});
        openBrowser('http://localhost:1/a/', {platform: 'linux',  run});
        openBrowser('http://localhost:1/a/', {platform: 'win32',  run});

        expect(calls).toEqual([
            ['open',     ['http://localhost:1/a/'], true],
            ['xdg-open', ['http://localhost:1/a/'], true],
            ['cmd',      ['/c', 'start', '""', '"http://localhost:1/a/"'], true]
        ])
    });

    test('--open <path> opens that path under the served root, and --open alone the root', async () => {
        for (const [open, expected] of [[['--open', 'apps/portal/'], 'apps/portal/'], [['--open', './app/'], 'app/'], [['--open'], '']]) {
            const port   = await freePort(),
                  opened = [],
                  served = await main({argv: ['node', SCRIPT, '--port', String(port), ...open], env: {}, root, opener: url => opened.push(url)});

            served.close();
            expect(opened).toEqual([`http://localhost:${port}/${expected}`])
        }
    });

    test('a workspace script\'s open path is a default the command line overrides', async () => {
        for (const [flags, expected] of [[[], 'app/'], [['--no-open'], null], [['--open', 'other/'], 'other/']]) {
            const port   = await freePort(),
                  opened = [],
                  served = await run({argv: ['node', SCRIPT, '--port', String(port), ...flags], open: 'app/', opener: url => opened.push(url)});

            served.close();
            expect(opened).toEqual(expected === null ? [] : [`http://localhost:${port}/${expected}`])
        }
    });

    for (const [flag, args, env] of [['--port', port => ['--port', String(port)], () => ({})], ['PORT', () => [], port => ({PORT: String(port)})]]) {
        test(`the script listens on the port ${flag} names`, async () => {
            const port  = await freePort(),
                  child = spawn(process.execPath, [SCRIPT, ...args(port), '--no-open'], {cwd: root, env: {...process.env, ...env(port)}});

            try {
                await new Promise((resolve, reject) => {
                    child.stdout.on('data', chunk => String(chunk).includes(`localhost:${port}/`) && resolve());
                    child.on('exit', code => reject(new Error(`exited with ${code}`)))
                });

                expect((await fetch(`http://localhost:${port}/range.txt`)).status).toBe(200)
            } finally {
                child.kill()
            }
        })
    }
});
