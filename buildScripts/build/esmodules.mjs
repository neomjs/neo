import fs                   from 'fs-extra';
import path                 from 'path';
import * as Terser          from 'terser';
import {isDistAppAsset}     from '../util/distAppAssets.mjs';
import {minifyHtml}         from '../util/minifyHtml.mjs';
import {processFileContent} from '../util/astTemplateProcessor.mjs';

import {
    esmOutputRoot,
    findUnresolvableImports,
    relativeSpecifiers,
    resolveSourceRoots,
    rewriteImportPaths,
    rewriteNeoConfig
} from '../util/esmDistTransforms.mjs';

const
    outputBasePath = `${esmOutputRoot}/`,
    root           = path.resolve(),
    requireJson    = path => JSON.parse(fs.readFileSync(path, 'utf-8')),
    packageJson    = requireJson(path.join(root, 'package.json')),
    insideNeo      = packageJson.name.includes('neo.mjs'),
    startDate      = new Date();

const
    /** `{outputPath, specifiers}` per emitted module, checked once the whole tree exists. */
    emittedModules = [],
    /** Files that threw. Collected rather than logged, so the build can refuse to exit 0. */
    failures       = [];

let inputDirectories;

// A rejected source root is a manifest mistake, not an engine crash: the developer who typed the
// path is the one who has to read this, and a stack trace through buildScripts tells them nothing.
try {
    inputDirectories = resolveSourceRoots({insideNeo, packageJson})
} catch (error) {
    console.error(`\ndist/esm: ${error.message}`);
    process.exit(1)
}

async function minifyDirectory(inputDir, outputDir) {
    if (fs.existsSync(inputDir)) {
        fs.mkdirSync(outputDir, {recursive: true});
        const dirents = fs.readdirSync(inputDir, {recursive: true, withFileTypes: true});
        for (const dirent of dirents) {
            if (!dirent.isFile()) {
                continue;
            }

            const currentPath     = dirent.parentPath || dirent.path;
            const inputPath       = path.join(currentPath, dirent.name);
            const normalizedInput = inputPath.replace(/\\/g, '/');

            if (normalizedInput.includes('/docs/output/')) {
                continue;
            }

            const relativePath = path.relative(inputDir, inputPath);
            const outputPath   = path.join(outputDir, relativePath);

            if (dirent.name.endsWith('.mjs') || dirent.name.endsWith('.json') || dirent.name.endsWith('.html')) {
                const content = fs.readFileSync(inputPath, 'utf8');
                await minifyFile(content, outputPath);
            } else if (isDistAppAsset(dirent.name) || normalizedInput.includes('/resources/')) {
                fs.mkdirSync(path.dirname(outputPath), {recursive: true});
                fs.copyFileSync(inputPath, outputPath);
            }
        }
    }
}

async function minifyFile(content, outputPath) {
    fs.mkdirSync(path.dirname(outputPath), {recursive: true});

    try {
        if (outputPath.endsWith('.json')) {
            const jsonContent = JSON.parse(content);
            if (outputPath.endsWith('neo-config.json')) {
                rewriteNeoConfig(jsonContent, {insideNeo})
            }
            fs.writeFileSync(outputPath, JSON.stringify(jsonContent));
            console.log(`Minified JSON: ${outputPath}`)
        } else if (outputPath.endsWith('.html')) {
            const minifiedContent = await minifyHtml(content);
            fs.writeFileSync(outputPath, minifiedContent);
            console.log(`Minified HTML: ${outputPath}`)
        } else if (outputPath.endsWith('.mjs')) {
            let adjustedContent = rewriteImportPaths(content);

            // AST-based processing for html templates
            const result = processFileContent(adjustedContent, outputPath);

            const minifiedResult = await Terser.minify(result.content, {
                module  : true,
                compress: {dead_code: true},
                mangle  : {toplevel: true}
            });

            fs.writeFileSync(outputPath, minifiedResult.code);

            // Recorded from the emitted code, not the source: Terser normalizes quoting, so this is
            // the only text that reflects what the browser will actually request.
            emittedModules.push({outputPath, specifiers: relativeSpecifiers(minifiedResult.code)});

            console.log(`Minified JS: ${outputPath}`)
        }
    } catch (e) {
        // Recorded, not merely logged. This catch used to swallow: a file that threw was simply
        // ABSENT from dist/esm and the build still exited 0 — the same silent-success failure mode
        // as an unrewritten import, on the error path instead of the transform path.
        failures.push({outputPath, error: e});
        console.error(`Error minifying ${outputPath}:`, e)
    }
}

const promises = [];
const swPath   = path.resolve(root, 'ServiceWorker.mjs');

if (fs.existsSync(swPath)) {
    promises.push(minifyFile(fs.readFileSync(swPath, 'utf8'), path.resolve(root, outputBasePath, 'ServiceWorker.mjs')));
}

inputDirectories.forEach(folder => {
    const outputPath = path.resolve(root, outputBasePath, folder.replace('node_modules/neo.mjs/', ''));
    promises.push(minifyDirectory(path.resolve(root, folder), outputPath)
        .catch(err => {
            console.error('dist/esm Minification failed:', err);
            process.exit(1)
        })
    )
});

Promise.all(promises).then(() => {
    const docsOutputPath = path.resolve(root, 'docs/output');
    if (fs.existsSync(docsOutputPath)) {
        fs.copySync(docsOutputPath, path.resolve(root, outputBasePath, 'docs/output'))
    }

    // `src/functional/util/HtmlTemplateProcessor.mjs` imports `../../../dist/parse5.mjs`, an esbuild
    // artifact from `npm run bundle-parse5` that no source root carries — so the copied source
    // reached a file the output tree never had. Copied here, beside `docs/output`, because it is the
    // same shape: an artifact the tree needs and the minifier does not produce.
    //
    // Unconditional, with no existence check, because THIS SCRIPT cannot run without it: the
    // `astTemplateProcessor` import above reaches `templateBuildProcessor`, which imports the same
    // bundle at module scope. Absent, the build dies at load with ERR_MODULE_NOT_FOUND naming the
    // path — louder than any check here could be, and a guarded copy would be unreachable code
    // pretending the file is optional.
    fs.copySync(path.resolve(root, 'dist/parse5.mjs'), path.resolve(root, outputBasePath, 'dist/parse5.mjs'));

    if (failures.length > 0) {
        console.error(`\ndist/esm: ${failures.length} file(s) failed to build:`);
        failures.forEach(({outputPath}) => console.error(`  ${path.relative(root, outputPath)}`));
        process.exit(1)
    }

    // Runs only once the whole tree exists, because a forward reference to a file another root has
    // not emitted yet is not a defect. `dist/esm` ships without a resolver, so this is the only
    // stage that can tell a working output from one that merely finished.
    const
        unresolvable = findUnresolvableImports(
            emittedModules,
            fs.existsSync,
            (outputPath, specifier) => path.resolve(path.dirname(outputPath), specifier)
        ),
        describe     = ({outputPath, specifier}) => `  ${path.relative(root, outputPath)} → ${specifier}`,
        report       = (reason, format = describe) => unresolvable.filter(entry => entry.reason === reason).map(format),
        missing      = report('missing'),
        computedRoot = report('computed-root',
            entry => `${describe(entry)}  (directory ${path.relative(root, entry.resolved)}/ is absent)`),
        wrongEngine  = report('engine-identity');

    if (missing.length > 0) {
        console.error(`\ndist/esm: ${missing.length} import(s) do not resolve inside the output tree:`);
        missing.forEach(line => console.error(line));
        console.error('\nA source root the app imports may be missing from package.json "neo.esmSourceRoots".')
    }

    // Reported apart from the missing set because the instruction differs: these specifiers are
    // computed at runtime and are not broken. The directory their family loads from is the thing that
    // is not in the output tree, so that is what the line names — telling a developer "this import
    // does not resolve" would send them to inspect a template literal that is doing nothing wrong.
    if (computedRoot.length > 0) {
        console.error(`\ndist/esm: ${computedRoot.length} computed import(s) read from a directory the output tree does not have:`);
        computedRoot.forEach(line => console.error(line));
        console.error('\nThe interpolation is never resolved — only the path before it. A whole source root is likely uncopied.')
    }

    // Separate from the missing set on purpose: these DO resolve. They reach the workspace's own
    // engine source instead of the copy in dist/esm, so the app boots two disjoint module graphs —
    // a failure that looks like nothing at build time and like everything at runtime.
    if (wrongEngine.length > 0) {
        console.error(`\ndist/esm: ${wrongEngine.length} import(s) still address the workspace engine at node_modules/neo.mjs:`);
        wrongEngine.forEach(line => console.error(line));
        console.error('\nThese must be rewritten to the flattened dist/esm/src copy; two engine graphs cannot share a class registry.')
    }

    if (unresolvable.length > 0) {
        process.exit(1)
    }

    const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
    console.log(`\nTotal time for dist/esm: ${processTime}s`);
    process.exit()
})
