import {test, expect}                                                from '@playwright/test';
import {execFileSync}                                                from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire}                                               from 'node:module';
import os                                                            from 'node:os';
import path                                                          from 'node:path';
import {fileURLToPath, pathToFileURL}                                from 'node:url';

const SAMPLES = {
    bash      : 'echo "$HOME"',
    css       : 'a { color: red; }',
    javascript: 'const answer = 42;',
    json      : '{"answer": 42}',
    markdown  : '# Title',
    plaintext : 'plain text',
    ruby      : 'def answer; 42; end',
    scss      : '$gap: 8px;',
    xml       : '<a href="#">link</a>',
    yaml      : 'answer: 42'
};

test.describe('highlightJs — the bundle comes from the installed package', () => {
    let LANGUAGES, license, root, version;

    test.beforeAll(async () => {
        let buildBundle;

        ({buildBundle, LANGUAGES} = await import('../../../../buildScripts/build/highlightJs.mjs'));

        const manifest = createRequire(import.meta.url).resolve('highlight.js/package.json');

        ({version} = JSON.parse(readFileSync(manifest, 'utf8')));
        license = readFileSync(path.join(path.dirname(manifest), 'LICENSE'), 'utf8').trim();

        root = mkdtempSync(path.join(os.tmpdir(), 'neo-highlight-bundle-'));
        await buildBundle(root)
    });

    test.afterAll(() => {
        rmSync(root, {recursive: true, force: true})
    });

    for (const file of ['highlight.custom.js', 'highlight.custom.min.js']) {
        test(`${file} registers exactly the bundled languages and highlights each`, () => {
            // Both variants are load-bearing: `Neo.util.HighlightJs` loads the unminified one while `debug` is on.
            // The bundle is imported in a plain Node process, as an ES module with no test-runner loader in between.
            const {languages, results} = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
                const hljs = (await import(${JSON.stringify(pathToFileURL(path.join(root, file)).href)})).default;

                console.log(JSON.stringify({
                    languages: hljs.listLanguages(),
                    results  : Object.fromEntries(Object.entries(${JSON.stringify(SAMPLES)}).map(([language, code]) => {
                        const {value} = hljs.highlight(code, {language});
                        return [language, value]
                    }))
                }))
            `], {encoding: 'utf8'}));

            expect(languages.sort()).toEqual([...LANGUAGES].sort());
            expect(Object.keys(SAMPLES).sort(), 'one sample per bundled language').toEqual([...LANGUAGES].sort());

            for (const language of LANGUAGES) {
                if (language === 'plaintext') {
                    expect(results.plaintext).toBe(SAMPLES.plaintext)
                } else {
                    expect(results[language], `${language} produces highlight markup`).toContain('<span class="hljs-')
                }
            }
        });

        test(`${file} opens with the installed package's license, verbatim`, () => {
            // BSD 3-Clause: the copyright notice, the conditions and the disclaimer travel with every redistributed
            // copy, and minifying must not strip them.
            const content = readFileSync(path.join(root, file), 'utf8');

            expect(content.startsWith('/*!')).toBe(true);
            expect(content).toContain(`Highlight.js v${version}`);
            expect(content).toContain(license)
        })
    }
});

test('the script runs no git clone and no second install: it imports no child_process', () => {
    expect(readFileSync('buildScripts/build/highlightJs.mjs', 'utf8')).not.toMatch(/child_process/)
});

test.describe('highlightJs — a failed build ends the process non-zero', () => {
    test('the catch in main() exits with a failure status instead of returning', () => {
        // `build-all` and `bundle-browser-deps` gate on this exit code. A catch that only logged let a
        // runner skip the bundle behind a green step, and every guide with a code fence stopped rendering.
        const
            source  = readFileSync('buildScripts/build/highlightJs.mjs', 'utf8'),
            main    = source.slice(source.indexOf('async function main')),
            handler = /\} catch \(error\) \{[\s\S]*?\n    \}/.exec(main)?.[0] ?? '';

        expect(handler, 'the catch in main() must be findable — the arm is void if the shape moved').toBeTruthy();
        expect(handler).toMatch(/process\.exit\(1\)/)
    })
});

test('the CLI checks the consumer working directory for an existing bundle', () => {
    const
        root   = mkdtempSync(path.join(os.tmpdir(), 'neo-highlight-consumer-')),
        output = path.join(root, 'dist/highlight'),
        script = fileURLToPath(new URL('../../../../buildScripts/build/highlightJs.mjs', import.meta.url));

    try {
        mkdirSync(output, {recursive: true});
        writeFileSync(path.join(output, 'highlight.custom.js'), 'consumer bundle');
        writeFileSync(path.join(output, 'highlight.custom.min.js'), 'consumer minified bundle');

        const result = execFileSync(process.execPath, [script], {cwd: root, encoding: 'utf8'});

        expect(result).toContain('bundle already exists. Skipping build');
        expect(readFileSync(path.join(output, 'highlight.custom.js'), 'utf8')).toBe('consumer bundle');
        expect(readFileSync(path.join(output, 'highlight.custom.min.js'), 'utf8')).toBe('consumer minified bundle')
    } finally {
        rmSync(root, {recursive: true, force: true})
    }
});
