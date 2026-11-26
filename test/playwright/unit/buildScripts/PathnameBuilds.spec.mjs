import {test, expect}             from '@playwright/test';
import {execFileSync}             from 'node:child_process';
import fs                         from 'node:fs';
import os                         from 'node:os';
import path                       from 'node:path';
import {pathToFileURL}            from 'node:url';
import {parse}                    from 'parse5';
import {createFileServer, listen} from '../../../../buildScripts/util/fileServer.mjs';

const repo = path.resolve(import.meta.dirname, '../../../..');

// Exercise real build entry points with a tiny installed Engine, so no full app bundle or private services are needed.
for (const tier of ['esm', 'development', 'production']) {
    test(`${tier} emits matching pathname mounts and keeps hash output unchanged`, async () => {
        test.setTimeout(60000);
        const root   = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-pathname-build-')),
              engine = path.join(root, 'node_modules/neo.mjs'),
              write  = (file, text) => {
                  fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
                  fs.writeFileSync(path.join(root, file), text)
              },
              link = (source, target) => {
                  fs.mkdirSync(path.dirname(path.join(engine, target)), {recursive: true});
                  fs.symlinkSync(path.join(repo, source), path.join(engine, target), 'file')
              },
              read = file => fs.readFileSync(path.join(root, `dist/${tier}`, file), 'utf8');
        let server;
        try {
            write('package.json', JSON.stringify({name: 'pathname-build-fixture', dependencies: {'neo.mjs': '0.0.0'}}));
            write('node_modules/neo.mjs/package.json', '{"name":"neo.mjs","version":"0.0.0","type":"module"}');
            write('node_modules/neo.mjs/src/worker/App.mjs', 'self.buildFixture = true;');
            write('src/MicroLoader.mjs', 'export const fixture = true;');
            for (const name of ['portal', 'camelCase', 'spaRootApp', 'hash']) {
                const html = '<!DOCTYPE html><html><head><base href="/source/"><title>build fixture</title></head><body></body></html>';
                write(`apps/${name}/index.html`, html);
                write(`apps/${name}/app.mjs`, 'export default {};');
                write(`apps/${name}/neo-config.json`, JSON.stringify({
                    appPath   : `../../apps/${name}/app.mjs`,
                    basePath  : '../../',
                    routerMode: name === 'hash' ? 'hash' : 'pathname',
                    ...(name === 'spaRootApp' ? {} : {routerBasePath: '/source'})
                }))
            }
            if (tier === 'esm') {
                execFileSync(process.execPath, [path.join(repo, 'buildScripts/build/esmodules.mjs')],
                    {cwd: root, stdio: 'pipe', timeout: 50000})
            } else {
                for (const relative of [`buildScripts/webpack/${tier}/buildTarget.json`,
                    'buildScripts/webpack/json/build.json', 'buildScripts/webpack/loader/template-loader.mjs']) link(relative, relative);
                const script = `
                    const {default: factory} = await import(${JSON.stringify(pathToFileURL(path.join(repo, `buildScripts/webpack/${tier}/webpack.config.appworker.mjs`)).href)});
                    const {default: webpack} = await import(${JSON.stringify(pathToFileURL(path.join(repo, 'node_modules/webpack/lib/index.js')).href)});
                    const config = await factory({insideNeo: 'false'});
                    await new Promise((resolve, reject) => {
                        const compiler = webpack(config);
                        compiler.run((error, stats) => compiler.close(() => error || stats?.hasErrors()
                            ? reject(error || new Error(stats.toString({all: false, errors: true}))) : resolve()));
                    });`;
                execFileSync(process.execPath, ['--input-type=module', '-e', script], {cwd: root, stdio: 'pipe', timeout: 50000})
            }
            for (const name of ['portal', 'camelCase', 'spaRootApp', 'hash']) {
                const config   = JSON.parse(read(`apps/${name}/neo-config.json`)),
                      document = parse(read(`apps/${name}/index.html`)),
                      head     = document.childNodes.find(node => node.tagName === 'html').childNodes.find(node => node.tagName === 'head'),
                      href     = head.childNodes.find(node => node.tagName === 'base').attrs.find(attr => attr.name === 'href').value;
                if (name === 'spaRootApp') {
                    expect(Object.hasOwn(config, 'routerBasePath')).toBe(false)
                } else {
                    expect(config.routerBasePath).toBe(name === 'hash' ? '/source' : `/dist/${tier}/apps/${name}`)
                }
                expect(href).toBe(name === 'hash' ? '/source/' : `/dist/${tier}/apps/${name}/`)
            }
            server = createFileServer({root, freshness: {onListening() {}, onRequest() {}}});
            const port     = await listen(server, {port: 0, strict: true}),
                  response = await fetch(`http://localhost:${port}/dist/${tier}/apps/portal/learn?view=compact`);
            expect(response.status).toBe(200);
            expect(await response.text()).toContain('build fixture');
            expect((await fetch(`http://localhost:${port}/dist/${tier}/apps/portal/Missing.mjs`)).status).toBe(404)
        } finally {
            server?.closeAllConnections(); server?.close();
            fs.rmSync(root, {recursive: true, force: true})
        }
    })
}
