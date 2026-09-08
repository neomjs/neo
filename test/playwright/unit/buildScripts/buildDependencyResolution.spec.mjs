import {spawnSync}     from 'node:child_process';
import fs              from 'fs-extra';
import os              from 'node:os';
import path            from 'node:path';
import {pathToFileURL} from 'node:url';
import {test, expect}  from '@playwright/test';

const engineRoot = path.resolve(import.meta.dirname, '../../../..');

test.describe('build programs resolve dependencies from their own module', () => {
    let root, workspace, installedEngine;

    test.beforeEach(() => {
        root            = fs.mkdtempSync(path.join(os.tmpdir(), 'neo dependencies '));
        workspace       = path.join(root, 'consumer app');
        installedEngine = path.join(workspace, 'node_modules/neo.mjs');
        fs.outputJsonSync(path.join(workspace, 'package.json'), {name: 'consumer', version: '1.0.0'});
        fs.outputJsonSync(path.join(installedEngine, 'package.json'), {name: 'neo.mjs', type: 'module'});

        for (const name of ['chalk', 'commander', 'envinfo', 'fs-extra', 'inquirer', 'esbuild', 'parse5', 'marked']) {
            fs.ensureDirSync(path.join(root, 'node_modules'));
            fs.symlinkSync(path.join(engineRoot, 'node_modules', name), path.join(root, 'node_modules', name), 'junction')
        }

        for (const file of ['webpack/buildThreads.mjs', 'util/sanitizer.mjs', 'build/parse5.mjs', 'build/marked.mjs']) {
            fs.copySync(path.join(engineRoot, 'buildScripts', file), path.join(installedEngine, 'buildScripts', file))
        }
    });

    test.afterEach(() => fs.removeSync(root));

    /**
     * @summary Installs an observable bin with no .bin shim, to measure executable and argv selection.
     * @param {String} nodeModules Package installation directory.
     */
    function installWebpack(nodeModules) {
        const packageRoot = path.join(nodeModules, 'webpack');

        fs.outputJsonSync(path.join(packageRoot, 'package.json'), {
            name: 'webpack', bin: {webpack: './cli/entry.cjs'}
        });
        fs.outputFileSync(path.join(packageRoot, 'cli/entry.cjs'),
            "require('node:fs').appendFileSync(process.env.NEO_TEST_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');\n" +
            'process.exit(Number(process.env.NEO_TEST_BUILD_EXIT || 0));\n');
    }

    /**
     * @summary Runs the actual CLI from the consumer directory without shell argument processing.
     * @param {String[]} args CLI selection.
     * @param {Object} env Optional child overrides.
     * @returns {Object} Child result and observed webpack calls.
     */
    function runThreads(args, env={}) {
        const log    = path.join(root, 'calls.jsonl'),
              result = spawnSync(process.execPath,
                  [path.join(installedEngine, 'buildScripts/webpack/buildThreads.mjs'), '-n', ...args], {
                      cwd: workspace, encoding: 'utf8',
                      env: {...process.env, NEO_TEST_ARGV_LOG: log, ...env}
                  });

        return {...result, calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : []}
    }

    for (const layout of ['hoisted', 'nested']) {
        test(`thread selections and env arguments survive a ${layout} install with spaces`, () => {
            installWebpack(path.join(layout === 'hoisted' ? root : installedEngine, 'node_modules'));

            const result   = runThreads(['-e', 'all', '-t', 'all']),
                  expected = [];

            for (const mode of ['development', 'production']) {
                for (const [suffix, extra] of [
                    ['main', []], ['appworker', ['--env', 'insideNeo=false']],
                    ...['canvas', 'data', 'service', 'task', 'vdom'].map(worker =>
                        ['worker', ['--env', 'insideNeo=false', `worker=${worker}`]])
                ]) {
                    expected.push(['--config', path.join(installedEngine, `buildScripts/webpack/${mode}/webpack.config.${suffix}.mjs`), ...extra])
                }
            }

            expect(result.status, result.stderr).toBe(0);
            expect(result.calls).toEqual(expected)
        })
    }

    test('a failed selected build exits nonzero without starting the next thread', () => {
        installWebpack(path.join(root, 'node_modules'));

        const result = runThreads(['-f', '-e', 'dev', '-t', 'app'], {NEO_TEST_BUILD_EXIT: '7'});

        expect(result.status).toBe(7);
        expect(result.calls).toHaveLength(1);
        expect(result.calls[0].slice(-2)).toEqual(['--env', 'insideNeo=true'])
    });

    test('both browser bundles are generated from an unrelated cwd and execute without node_modules', async () => {
        for (const name of ['parse5', 'marked']) {
            const result = spawnSync(process.execPath, [path.join(installedEngine, `buildScripts/build/${name}.mjs`)], {
                cwd: workspace, encoding: 'utf8'
            });

            expect(result.status, result.stderr).toBe(0)
        }

        const output = path.join(root, 'standalone');
        fs.copySync(path.join(installedEngine, 'dist'), output);
        fs.removeSync(path.join(root, 'node_modules'));

        const marked = await import(pathToFileURL(path.join(output, 'marked.mjs')).href),
              parse5 = await import(pathToFileURL(path.join(output, 'parse5.mjs')).href);

        expect(marked.marked.parse('**portable**')).toBe('<p><strong>portable</strong></p>\n');
        expect(parse5.parseFragment('<b>portable</b>').childNodes[0].tagName).toBe('b');
        expect(fs.readFileSync(path.join(output, 'marked.mjs'), 'utf8')).toContain('Permission is hereby granted')
    })
});
