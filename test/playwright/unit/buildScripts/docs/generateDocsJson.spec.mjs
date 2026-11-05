import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const generator = fileURLToPath(new URL('../../../../../buildScripts/docs/generateDocsJson.mjs', import.meta.url));

/** @summary Runs the actual generator in small projects whose directory names cannot define their source URLs. */
test.describe('Docs generated source paths', () => {
    let tempDir;

    test.beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-paths-'))
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, {recursive: true, force: true})
    });

    for (const {directory, installed} of [
        {directory: 'neo/neo/engine', installed: false},
        {directory: 'arbitrary-checkout', installed: false},
        {directory: 'consumer', installed: true}
    ]) {
        test(`source links resolve from ${directory}`, () => {
            const root    = path.join(tempDir, directory),
                  neoPath = installed ? 'node_modules/neo.mjs/' : '',
                  sources = [
                      {file: `${neoPath}src/core/Observable.mjs`, className: 'Neo.core.Observable', name: 'Observable'},
                      {file: `${neoPath}docs/app/view/Fixture.mjs`, className: 'Docs.app.view.Fixture', name: 'Fixture'},
                      {file: 'apps/demo/MainContainer.mjs', className: 'Demo.MainContainer', name: 'MainContainer'}
                  ];

            const write = (file, content) => {
                const target = path.join(root, file);
                fs.mkdirSync(path.dirname(target), {recursive: true});
                fs.writeFileSync(target, content)
            };

            write('package.json', JSON.stringify({name: installed ? 'docs-consumer' : 'neo.mjs'}));
            write('buildScripts/myApps.json', JSON.stringify({apps: ['Demo']}));
            for (const source of sources) {
                write(source.file, `/**\n * @class ${source.className}\n */\nexport default class ${source.name} {\n` +
                    `    /** @summary A documented instance method. */\n    inspect() {}\n}\n`)
            }

            execFileSync(process.execPath, [generator], {cwd: root, timeout: 30000});
            const structure = JSON.parse(fs.readFileSync(path.join(root, 'docs/output/structure.json'), 'utf8')),
                  doclets   = JSON.parse(fs.readFileSync(path.join(root, 'docs/output/all.json'), 'utf8'));

            // Package discovery currently excludes node_modules; this arm verifies the consumer's own app.
            for (const source of sources.filter(source => !installed || source.file.startsWith('apps/'))) {
                const leaf    = structure.find(item => item.className === source.className),
                      members = doclets.filter(item => item.neoClassName === source.className);

                expect(leaf, source.className).toBeDefined();
                expect(leaf.srcPath).toBe(source.file);
                expect(fs.existsSync(path.join(root, leaf.srcPath))).toBe(true);
                expect(members.some(item => item.name === 'inspect')).toBe(true);
                expect(members.every(item => item.meta.srcPath === source.file)).toBe(true)
            }
        })
    }
});
