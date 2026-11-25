import fs                                                from 'fs-extra';
import path                                              from 'path';
import {fileURLToPath}                                   from 'node:url';
import * as Terser                                       from 'terser';
import {copyBrowserBundles}                              from '../util/browserBundles.mjs';
import {createEsmBuildPlan}                              from '../util/esmBuildGraph.mjs';
import {minifyHtml}                                      from '../util/minifyHtml.mjs';
import {canvasModulePackageRoots, mainAddonPackageRoots} from '../util/declaredPackageRoots.mjs';
import {processFileContent}                              from '../util/astTemplateProcessor.mjs';
import * as BuildId                                      from '../util/buildId.mjs';

import {
    esmOutputRoot,
    findUnresolvableImports,
    relativeSpecifiers,
    resolveSourceRoots,
    rewriteEsmImports,
    rewriteNeoConfig,
    rewritePathnameHtml
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

let plan, packageRoots;

// A rejected source root is a manifest mistake, not an engine crash: the developer who typed the
// path is the one who has to read this, and a stack trace through buildScripts tells them nothing.
try {
    // Main addons and Canvas worker modules run in this one emitted tree, so both kinds share one admission
    packageRoots = [...mainAddonPackageRoots(root), ...canvasModulePackageRoots(root)];
    plan = createEsmBuildPlan({
        workspaceRoot: root, engineRoot: insideNeo ? root : path.join(root, 'node_modules/neo.mjs'),
        sourceRoots  : resolveSourceRoots({insideNeo, packageJson}), packageRoots
    });
    for (const output of plan.excludedOutputs) fs.rmSync(output, {force: true})
} catch (error) {
    console.error(`\ndist/esm: ${error.message}`);
    process.exit(1)
}

/**
 * @summary Emits each planned logical file once, independent of how many roots or imports admitted it.
 * @returns {Promise<void>}
 */
async function emitFiles() {
    for (const [sourcePath, {outputPath, type}] of plan.files) {
        if (type === 'reference') continue;
        if (type === 'asset') {
            fs.mkdirSync(path.dirname(outputPath), {recursive: true});
            fs.copyFileSync(sourcePath, outputPath)
        } else {
            await minifyFile(fs.readFileSync(sourcePath, 'utf8'), outputPath, sourcePath, type)
        }
    }
}

/**
 * @summary Transforms one admitted file and retains its emitted imports for final identity validation.
 * @param {String} content
 * @param {String} outputPath
 * @param {String} sourcePath
 * @param {String} type
 * @returns {Promise<void>}
 */
async function minifyFile(content, outputPath, sourcePath, type) {
    fs.mkdirSync(path.dirname(outputPath), {recursive: true});

    try {
        if (outputPath.endsWith('.json')) {
            const jsonContent = JSON.parse(content);
            if (type !== 'json-data' && outputPath.endsWith('neo-config.json')) {
                rewriteNeoConfig(jsonContent, {insideNeo,
                    appSubPath: path.relative(path.join(root, esmOutputRoot), path.dirname(outputPath)).split(path.sep).join('/')})
            }
            fs.writeFileSync(outputPath, JSON.stringify(jsonContent));
            console.log(`Minified JSON: ${outputPath}`)
        } else if (outputPath.endsWith('.html')) {
            const configPath = path.join(path.dirname(sourcePath), 'neo-config.json');
            if (path.basename(sourcePath) === 'index.html' && fs.existsSync(configPath)) {
                content = rewritePathnameHtml(content, requireJson(configPath), path.relative(root, path.dirname(outputPath)))
            }
            const minifiedContent = await minifyHtml(content);
            fs.writeFileSync(outputPath, minifiedContent);
            console.log(`Minified HTML: ${outputPath}`)
        } else if (type === 'module') {
            let adjustedContent = rewriteEsmImports(content, {
                sourcePath, outputPath, workspaceRoot: root,
                engineRoot: insideNeo ? root : path.join(root, 'node_modules/neo.mjs'), packageRoots, files: plan.files
            });

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

emitFiles().then(() => {
    const docsOutputPath = path.resolve(root, 'docs/output');

    // `build-all` passes `--no-docs-output`: it runs `generate-docs-json` beside this step and copies the result itself
    if (!process.argv.includes('--no-docs-output') && fs.existsSync(docsOutputPath)) {
        fs.copySync(docsOutputPath, path.resolve(root, outputBasePath, 'docs/output'))
    }

    // These bundles belong to the engine supplying this build, not the consumer's cwd.
    // Their relative imports survive the source-tree flattening unchanged.
    copyBrowserBundles(
        fileURLToPath(new URL('../../dist', import.meta.url)),
        path.resolve(root, outputBasePath, 'dist')
    );

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
            (outputPath, specifier) => path.resolve(path.dirname(outputPath), specifier),
            root
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
    //
    // A WARNING, never fatal, because the absence has two readings and this stage cannot choose
    // between them. Inside this repository `apps`, `docs`, `examples` and `src` are all default roots
    // and all present, so the uncopied-root reading is the only one that ever applies and the arm has
    // never fired. A consuming workspace inverts it: `examples` is not among ITS default roots, so
    // `dist/esm/examples/` cannot exist, and `src/worker/Data.mjs`'s `examples/` branch is one such a
    // workspace never takes. Treated as fatal, that made every consumer build fail on a directory the
    // workspace had no reason to own and no error text told it to declare.
    //
    // The `missing` arm above is the load-bearing one and is untouched: a LITERAL specifier that does
    // not resolve is a dangling import whoever is building, which is what catches an uncopied root for
    // every module actually imported by name.
    if (computedRoot.length > 0) {
        console.warn(`\ndist/esm: ${computedRoot.length} computed import(s) read from a directory the output tree does not have:`);
        computedRoot.forEach(line => console.warn(line));
        console.warn('\nThe interpolation is never resolved — only the path before it. Either a whole source root is uncopied, or the branch that reads it is one this workspace never takes. Only the first is a defect.')
    }

    // Separate from the missing set on purpose: these DO resolve. They reach the workspace's own
    // engine source instead of the copy in dist/esm, so the app boots two disjoint module graphs —
    // a failure that looks like nothing at build time and like everything at runtime.
    if (wrongEngine.length > 0) {
        console.error(`\ndist/esm: ${wrongEngine.length} import(s) still address the workspace engine at node_modules/neo.mjs:`);
        wrongEngine.forEach(line => console.error(line));
        console.error('\nThese must be rewritten to the flattened dist/esm/src copy; two engine graphs cannot share a class registry.')
    }

    // `computed-root` is deliberately absent from this sum — see its report above. A build stays green
    // with warnings and fails only on the two arms that name a real dangling or duplicated module.
    if (missing.length + wrongEngine.length > 0) {
        process.exit(1)
    }

    // Only a successful build publishes its id. Under `build-all` (`--no-stamp`) the whole run publishes it at its end
    BuildId.stampDeferred() || BuildId.stampBuildId({buildId: BuildId.getBuildId(), distPath: path.resolve(root, esmOutputRoot)});

    const processTime = (Math.round((new Date - startDate) * 100) / 100000).toFixed(2);
    console.log(`\nTotal time for dist/esm: ${processTime}s`);
    process.exit()
}).catch(error => {
    console.error('dist/esm emission failed:', error);
    process.exit(1)
})
