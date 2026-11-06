import {execFileSync}                                from 'node:child_process';
import {createHash}                                  from 'node:crypto';
import fs                                            from 'node:fs';
import os                                            from 'node:os';
import path                                          from 'node:path';
import {getThemeNamespace}                           from '../../src/util/Theme.mjs';
import {checkBundledReferences}                      from './moveBundledReferences.mjs';
import {rewriteData, rewriteDocument}                from './moveDataTransforms.mjs';
import {nativeReferenceSites}                        from './moveNativeReferences.mjs';
import {classifyReferences}                          from './moveReferenceScopes.mjs';
import {runtimeReferenceEdits}                       from './moveRuntimeReferences.mjs';
import {applySourceEdits, moduleInfo, rewriteModule} from './moveSourceTransforms.mjs';
import {rewriteStyle}                                from './moveStyleTransforms.mjs';

/**
 * @module buildScripts/util/movePlan
 * @summary Read-only relocation planning and freshness-checked application with rollback for handled write failures.
 */

const excludedDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage', 'test-results', 'playwright-report']);

/**
 * @summary Checks path containment on segment boundaries, including equality.
 * @param {String} directory Absolute containing directory.
 * @param {String} file Absolute candidate.
 * @returns {Boolean}
 */
function contains(directory, file) {
    const relative = path.relative(directory, file);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

/**
 * @summary Rejects external, generated and dependency writes, including traversal through symbolic links.
 * @param {String} root Owned repository root.
 * @param {String} file Candidate absolute path.
 * @returns {void}
 */
function validatePath(root, file) {
    if (file === root || !contains(root, file)) throw new Error(`Path must be below the owned root: ${file}`);
    const parts = path.relative(root, file).split(path.sep);
    if (parts.some(part => excludedDirectories.has(part))) throw new Error(`Read-only path: ${file}`);

    let current = root;
    for (const part of parts) {
        current = path.join(current, part);
        let stat;
        try { stat = fs.lstatSync(current); } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        if (stat?.isSymbolicLink()) {
            throw new Error(`Symbolic link in move path: ${current}`)
        }
    }
}

/**
 * @summary Ensures a folder move cannot silently carry ignored files or symbolic links outside the scan.
 * @param {String} source Physical file or folder to relocate.
 * @param {Set<String>} files Scanned ordinary files.
 * @returns {void}
 */
function validateSourceTree(source, files) {
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) throw new Error(`Symbolic link in source: ${source}`);
    if (stat.isDirectory()) {
        for (const name of fs.readdirSync(source)) validateSourceTree(path.join(source, name), files);
    } else if (!stat.isFile() || !files.has(source)) {
        throw new Error(`Source includes a file outside the owned scan: ${source}`)
    }
}

/**
 * @summary Lists owned files using Git's ignore boundary, or a bounded source walk for an unpacked workspace.
 * @param {String} root Repository or workspace root.
 * @returns {String[]} Sorted absolute paths, including symlinks without following them.
 */
function inventory(root) {
    let files;
    try {
        const top = fs.realpathSync(execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'],
            {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim());
        if (top === root) files = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
            {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}).split('\0').filter(Boolean).map(file => path.join(root, file));
    } catch {}

    if (!files) {
        files = [];
        const visit = directory => {
            for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
                if (excludedDirectories.has(entry.name) || entry.name.startsWith('.')) continue;
                const file = path.join(directory, entry.name);
                if (entry.isDirectory()) visit(file);
                else files.push(file);
            }
        };
        visit(root);
    }

    return [...new Set(files)].filter(file =>
        !path.relative(root, file).split(path.sep).some(part => excludedDirectories.has(part))).sort()
}

/**
 * @summary Captures file inventory and content identities, including missing tracked files and symlink targets.
 * @param {String} root Owned root.
 * @returns {Object[]} File, kind, mode and content hash records.
 */
function snapshot(root) {
    return inventory(root).map(file => {
        let stat;
        try { stat = fs.lstatSync(file); } catch (error) {
            if (error.code === 'ENOENT') return {file, kind: 'missing'};
            throw error
        }
        const link = stat.isSymbolicLink();
        return {file, kind: link ? 'symlink' : 'file', mode: stat.mode,
            hash: createHash('sha256').update(link ? fs.readlinkSync(file) : fs.readFileSync(file)).digest('hex')}
    })
}

/**
 * @summary Derives a canonical namespace from explicit root ownership, preferring the most specific root.
 * @param {String} file Absolute class module.
 * @param {Object[]} roots Namespace root declarations.
 * @returns {String|null}
 */
function classAt(file, roots) {
    const owner = roots.filter(entry => contains(entry.path, file)).sort((a, b) => b.path.length - a.path.length)[0];
    if (!owner) return null;
    const suffix = path.relative(owner.path, file).replace(/\.mjs$/, '').split(path.sep).join('.');
    return `${owner.namespace}.${suffix}`
}

/**
 * @summary Produces a complete path map and source rewrite plan without changing the filesystem.
 * Namespace roots declare ownership, not lookup search paths. Ambiguous/computed edges are blockers;
 * callers must not describe a blocked plan as a complete migration. Known data and boot references use
 * their readers' URL bases rather than the location of the JSON file carrying the value.
 * @param {Object} options
 * @param {String} options.root Owned repository or workspace root.
 * @param {String} options.source Root-relative file or folder to move.
 * @param {String} options.destination Root-relative exact destination, not a parent directory.
 * @param {Object[]} [options.namespaceRoots] Root-relative path, namespace and optional appThemeFolder entries.
 * @param {Object[]} [options.referenceScopes] Exact-source declarations for disjoint dynamic-reference families.
 * @returns {Object} Moves, rewrites, snapshot, class names, unresolved references and scan boundary.
 */
export function planMove({root, source, destination, namespaceRoots=[], referenceScopes=[]}) {
    root = fs.realpathSync(root);
    source = path.resolve(root, source);
    destination = path.resolve(root, destination);
    validatePath(root, source);
    validatePath(root, destination);
    if (contains(source, destination) || contains(destination, source)) throw new Error('Source and destination overlap');
    if (!fs.existsSync(source)) throw new Error(`Source does not exist: ${source}`);
    if (fs.existsSync(destination)) throw new Error(`Destination already exists: ${destination}`);

    const state = snapshot(root), files = new Set(state.filter(entry => entry.kind === 'file').map(entry => entry.file)),
        roots   = [...new Map([{path: 'src', namespace: 'Neo'}, {path: 'examples', namespace: 'Neo.examples'}, ...namespaceRoots]
            .map(entry => [path.resolve(root, entry.path), {...entry, path: path.resolve(root, entry.path)}])).values()],
        moves = [{from: source, to: destination}], classNames = new Map(), blockers = [], rewrites = [], referenceLedger = [],
        modules = new Map(), appRoots = new Map(), themeFolders = new Map(), unknownThemes = [], readOnlyInputs = [], bundledReferences = [],
        packageFile = path.join(root, 'package.json'),
        engineRoot = files.has(packageFile) && JSON.parse(fs.readFileSync(packageFile, 'utf8')).name !== 'neo.mjs'
            ? path.join(root, 'node_modules/neo.mjs') : root,
        mapPath = file => {
            const move = moves.find(entry => contains(entry.from, file));
            return move ? path.join(move.to, path.relative(move.from, file)) : file
        };

    if (![...files].some(file => contains(source, file))) throw new Error('Source contains no owned files');
    validateSourceTree(source, files);

    for (const file of files) {
        if (!file.endsWith('.mjs')) continue;
        let info;
        try { info = moduleInfo(fs.readFileSync(file, 'utf8'), {file, engineRoot}); }
        catch { continue; } // The rewrite pass reports the parser error with its file.
        modules.set(file, info);

        const relative = path.relative(root, file).split(path.sep), app = relative.slice(0, 2).join('/'),
            suffix     = relative.slice(2).join('.').replace(/\.mjs$/, '');
        if (relative[0] === 'apps' && suffix) {
            for (const name of info.classNames) {
                if (name.endsWith(`.${suffix}`)) {
                    if (!appRoots.has(app)) appRoots.set(app, new Set());
                    appRoots.get(app).add(name.slice(0, -suffix.length - 1));
                }
            }
        }
        for (const application of info.applications) {
            if (application.hasThemeFolder && application.name && typeof application.appThemeFolder === 'string') {
                if (themeFolders.has(application.name) && themeFolders.get(application.name) !== application.appThemeFolder) {
                    blockers.push({file, reason: 'Application has conflicting theme-folder projections'});
                }
                themeFolders.set(application.name, application.appThemeFolder);
            } else if (application.hasThemeFolder) {
                unknownThemes.push({file, name: application.name});
            }
        }
    }
    for (const [directory, names] of appRoots) {
        if (names.size === 1 && !roots.some(entry => entry.path === path.join(root, directory))) {
            roots.push({path: path.join(root, directory), namespace: [...names][0]});
        }
    }
    for (const owner of roots) {
        if (owner.appThemeFolder !== undefined) themeFolders.set(owner.namespace, owner.appThemeFolder);
    }
    const stylePath = name => getThemeNamespace(name, themeFolders.get(name.split('.')[0]))
        .replace(/^Neo\./, '').split('.').join('/') + '.scss';
    const readSource = file => {
        const code = fs.existsSync(file) ? fs.readFileSync(file) : null;
        if (!files.has(file) && !readOnlyInputs.some(input => input.file === file)) {
            readOnlyInputs.push({file, hash: code ? createHash('sha256').update(code).digest('hex') : null});
        }
        return code?.toString('utf8') ?? null
    };
    const getModule = file => {
        if (modules.has(file)) return modules.get(file);
        if (!contains(engineRoot, file) || !file.endsWith('.mjs')) return null;
        const code = readSource(file);
        if (code === null) return null;
        const info = moduleInfo(code, {file, engineRoot});
        modules.set(file, info);
        return info
    };

    for (const [file, info] of modules) {
        if (!contains(source, file)) continue;
        const declared = info.classNames;
        if (!declared.length) continue;
        const before = classAt(file, roots), after = classAt(mapPath(file), roots);

        if (declared.length !== 1 || declared[0] !== before || !after ||
            !/^[$A-Z_a-z][$\w]*(?:\.[$A-Z_a-z][$\w]*)+$/.test(after)) {
            blockers.push({file, reason: 'Class namespace does not match an unambiguous declared root'});
            continue
        }

        classNames.set(before, after);
        if (engineRoot !== root && after.startsWith('Neo.')) {
            const relative = after.startsWith('Neo.examples.') ? after.slice(4) : `src.${after.slice(4)}`,
                installed  = path.join(engineRoot, relative.split('.').join('/') + '.mjs');
            if (getModule(installed)?.classNames.includes(after)) {
                blockers.push({file, reason: `Destination class name is already declared by ${installed}`});
            }
        }
        const oldStyle = stylePath(before), newStyle = stylePath(after);

        if (!before.startsWith('Neo.')) {
            for (const application of unknownThemes) {
                if (!application.name || application.name === before.split('.')[0]) {
                    blockers.push({file, reason: `Application theme-folder projection is computed in ${application.file}`});
                }
            }
        }

        for (const [other, otherInfo] of modules) {
            if (contains(source, other)) continue;
            if (otherInfo.classNames.includes(after)) blockers.push({file, reason: `Destination class name is already declared by ${other}`});
            if (oldStyle !== newStyle && otherInfo.classNames.some(name => stylePath(name) === oldStyle)) {
                blockers.push({file, reason: `Theme sheet is shared with an unmoved class in ${other}`});
            }
        }

        for (const style of files) {
            const relative = path.relative(root, style).split(path.sep).join('/');
            if (!relative.startsWith('resources/scss/')) continue;
            const parts = relative.split('/'), surface = parts[2];
            if ((surface === 'src' || surface.startsWith('theme-')) && parts.slice(3).join('/') === oldStyle) {
                const target = path.join(root, 'resources/scss', surface, newStyle);
                if (target !== style && mapPath(style) === style) moves.push({from: style, to: target});
            }
        }
    }

    for (const move of moves) {
        validatePath(root, move.from);
        validatePath(root, move.to);
        if (fs.existsSync(move.to)) throw new Error(`Destination already exists: ${move.to}`);
    }
    if (new Set(moves.map(move => move.to)).size !== moves.length) throw new Error('Multiple sources share a destination');

    const documents = [], html = new Map();
    for (const file of files) {
        if (!file.endsWith('.html')) continue;
        try {
            const result = rewriteDocument({code: fs.readFileSync(file, 'utf8'), from: file, to: mapPath(file), mapPath, classNames});
            documents.push(result.context);
            html.set(file, result);
            blockers.push(...result.unresolved.map(reference => ({file, ...reference})));
        } catch (error) {
            blockers.push({file, reason: `Cannot transform document: ${error.message}`});
        }
    }

    for (const file of files) {
        const target = mapPath(file), original = fs.readFileSync(file), extension = path.extname(file);
        let result;

        if (['.mjs', '.js'].includes(extension)) {
            let runtime;
            try {
                const code = original.toString('utf8'), info = modules.get(file) ?? moduleInfo(code, {file, engineRoot});
                result = rewriteModule({code, from: file, to: target, mapPath, classNames});
                runtime = runtimeReferenceEdits({code, file, root, engineRoot, info, getModule, mapPath, classNames});
                result.code = applySourceEdits(code, [...result.edits, ...runtime.edits]);
                bundledReferences.push(...runtime.bundledReferences.map(reference => ({file, ...reference})));
            }
            catch (error) { blockers.push({file, reason: `Cannot parse module: ${error.message}`}); continue; }

            const classified = classifyReferences({root, file, to: target, code: original.toString('utf8'),
                references : [...result.unresolved, ...runtime.unresolved], moves, scopes: referenceScopes,
                nativeSites: nativeReferenceSites({code: original.toString('utf8'), file, root, engineRoot, mapPath})});
            referenceLedger.push(...classified);
            blockers.push(...classified.filter(reference => reference.status === 'blocked'));
        } else if (extension === '.scss') {
            result = rewriteStyle({code: original.toString('utf8'), from: file, to: target, mapPath, exists: name => files.has(name)});
            blockers.push(...result.unresolved.map(reference => ({file, ...reference})));
        } else if (extension === '.html') {
            result = html.get(file);
        } else if (extension === '.json') {
            try {
                result = rewriteData({code: original.toString('utf8'), file, root, mapPath, engineRoot, documents, classNames});
                blockers.push(...result.unresolved.map(reference => ({file, ...reference})));
                bundledReferences.push(...result.bundledReferences.map(reference => ({file, ...reference})));
            } catch (error) {
                blockers.push({file, reason: `Cannot transform data: ${error.message}`});
            }
        }

        if (result && result.code !== original.toString('utf8')) {
            rewrites.push({from: file, to: target, before: original, after: Buffer.from(result.code)})
        }
    }

    blockers.push(...checkBundledReferences({references: bundledReferences, root, engineRoot, mapPath, readSource}));

    for (const scope of referenceScopes) {
        if (!referenceLedger.some(reference => path.relative(root, reference.file).split(path.sep).join('/') === scope.file &&
            reference.start === scope.start)) blockers.push({file: scope.file, reason: 'Reference scope names no current expression'});
    }

    return {root, moves, rewrites, classNames: [...classNames], snapshot: state, readOnlyInputs, blockers, referenceLedger,
        boundary: 'Owned Git files (including nonignored untracked files); dependencies, generated output and external consumers are excluded'}
}

/**
 * @summary Applies a still-current blocker-free plan, restoring originals if a handled write fails.
 * Backups survive a failed rollback and their location is attached to the thrown error. This is not a
 * crash-atomic transaction, and callers must serialize writers for the duration of application.
 * @param {Object} plan Result of planMove().
 * @returns {Object} Counts of moved paths and rewritten files.
 */
export function applyMove(plan) {
    if (plan.blockers.length) throw new Error(`Move has ${plan.blockers.length} unresolved reference(s)`);
    if (JSON.stringify(snapshot(plan.root)) !== JSON.stringify(plan.snapshot)) throw new Error('Move plan is stale; plan again');
    for (const input of plan.readOnlyInputs) {
        const hash = fs.existsSync(input.file) ? createHash('sha256').update(fs.readFileSync(input.file)).digest('hex') : null;
        if (hash !== input.hash) {
            throw new Error(`Move dependency changed; plan again: ${input.file}`)
        }
    }
    for (const move of plan.moves) {
        validatePath(plan.root, move.from);
        validatePath(plan.root, move.to);
        if (fs.existsSync(move.to)) throw new Error(`Destination already exists: ${move.to}`);
    }
    for (const rewrite of plan.rewrites) validatePath(plan.root, rewrite.to);

    const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-move-')), journal = [], created = [];
    try {
        for (let i = 0; i < plan.rewrites.length; i++) fs.writeFileSync(path.join(backup, String(i)), plan.rewrites[i].before);
        fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({moves: plan.moves,
            rewrites: plan.rewrites.map((rewrite, index) => ({from: rewrite.from, to: rewrite.to, backup: String(index)}))}));
    } catch (error) {
        fs.rmSync(backup, {recursive: true, force: true});
        throw error
    }

    const mkdir = directory => {
        if (fs.existsSync(directory)) return;
        mkdir(path.dirname(directory));
        fs.mkdirSync(directory);
        created.push(directory);
    };

    try {
        for (const move of plan.moves) {
            mkdir(path.dirname(move.to));
            fs.renameSync(move.from, move.to);
            journal.push(() => fs.renameSync(move.to, move.from));
        }
        for (const rewrite of plan.rewrites) {
            journal.push(() => fs.writeFileSync(rewrite.to, rewrite.before));
            fs.writeFileSync(rewrite.to, rewrite.after);
        }
    } catch (error) {
        const failures = [];
        for (const undo of journal.reverse()) {
            try { undo(); } catch (failure) { failures.push(failure.message); }
        }
        for (const directory of created.reverse()) {
            try { fs.rmdirSync(directory); } catch (failure) { failures.push(failure.message); }
        }
        if (failures.length) {
            error.message += `; rollback failed: ${failures.join('; ')}. Original rewrite bytes retained at ${backup}`;
            error.recoveryDirectory = backup;
        } else fs.rmSync(backup, {recursive: true});
        throw error
    }

    fs.rmSync(backup, {recursive: true});
    return {moved: plan.moves.length, rewritten: plan.rewrites.length}
}
