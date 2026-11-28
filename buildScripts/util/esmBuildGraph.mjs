import fs                                                                 from 'node:fs';
import path                                                               from 'node:path';
import {isDistAppAsset, isExcludedDistResource}                           from './distAppAssets.mjs';
import {esmDestination, literalDynamicSpecifiers, staticModuleSpecifiers} from './esmDistTransforms.mjs';

/** @summary Whether a logical filename belongs to a directory. @param {String} root @param {String} file @returns {Boolean} */
const within = (root, file) => file === root || file.startsWith(root + path.sep);

/**
 * @summary Finds the owning logical package slot, retaining scopes and nested dependency versions.
 * @param {String} workspaceRoot
 * @param {String} file
 * @returns {String|null}
 */
function packageOwner(workspaceRoot, file) {
    if (!within(workspaceRoot, file)) return null;
    const parts = path.relative(workspaceRoot, file).split(path.sep), index = parts.lastIndexOf('node_modules');
    if (index < 0 || !parts[index + 1]) return null;
    const end = index + (parts[index + 1].startsWith('@') ? 3 : 2);
    return parts.length > end ? path.join(workspaceRoot, ...parts.slice(0, end)) : null
}

/**
 * @summary Plans each emitted file once, extending workspace and declared-root admission with static package
 * reachability.
 * @description Only static imports and re-exports are discovery edges; dynamic imports retain their existing runtime
 * admission. Declared-root static and literal dynamic edges (Main addons, Canvas worker modules) are inspected
 * without extending admission; a host fallback must not reach the Engine.
 * Package-owner reachability propagates after graph construction, so cycles and pure helpers returning
 * to an admitted package cannot retain a second source copy. Ordinary libraries stay at their source location.
 * Logical paths own destinations; linked imports must agree with the package's physical peer graph.
 * @param {Object} options
 * @param {String} options.workspaceRoot
 * @param {String} options.engineRoot
 * @param {String[]} options.sourceRoots Workspace-relative source directories.
 * @param {Object[]} options.packageRoots Declared package roots (`neo.mainAddons`, `neo.canvasModules`), each naming
 * its `key`; they are copied without widening their admission.
 * @returns {{files: Map<String, Object>, excludedOutputs: Set<String>}}
 */
export function createEsmBuildPlan({workspaceRoot, engineRoot, sourceRoots, packageRoots}) {
    const files        = new Map(), excludedOutputs = new Set(), options = {workspaceRoot, engineRoot},
          engineSource = path.join(engineRoot, 'src'), engineReal = fs.realpathSync(engineRoot),
          engineOwner  = Symbol('engine'), workspaceOwner = Symbol('workspace'),
          nodes        = new Map(), parsed = new Map(), physicalOwners = new Map(), packageNames = new Map(),
          reverse      = new Map(), moduleImporters = new Map(),
          admitted     = new Set([engineOwner, workspaceOwner]);

    /** @summary Adds or promotes one logical file without giving overlapping roots a second writer. */
    const add = (sourcePath, type) => {
        const outputPath = esmDestination(sourcePath, options), prior = files.get(sourcePath);
        if (!prior || type === 'module') files.set(sourcePath, {outputPath, type});
        return outputPath
    };

    for (const directory of new Set([...sourceRoots, ...packageRoots.map(entry => entry.relativeRoot)])) {
        const input = path.join(workspaceRoot, directory);
        if (!fs.existsSync(input)) continue;
        for (const entry of fs.readdirSync(input, {recursive: true, withFileTypes: true})) {
            if (!entry.isFile()) continue;
            const sourcePath = path.join(entry.parentPath || entry.path, entry.name),
                  normalized = sourcePath.split(path.sep).join('/'), extension = path.extname(entry.name);
            if (normalized.includes('/docs/output/') || isExcludedDistResource(normalized)) {
                excludedOutputs.add(esmDestination(sourcePath, options));
                continue
            }
            const type = {'.mjs': 'module', '.json': 'json', '.html': 'html'}[extension];
            if (type) add(sourcePath, type);
            else if (isDistAppAsset(entry.name) || normalized.includes('/resources/')) add(sourcePath, 'asset')
        }
    }
    const serviceWorker = path.join(workspaceRoot, 'ServiceWorker.mjs');
    if (fs.existsSync(serviceWorker)) add(serviceWorker, 'module');

    // The built-in Circle URLs resolve from the flattened App Worker. A workspace asset
    // already admitted at the same destination keeps that destination.
    const circleDataPath = 'resources/examples/data/circles',
          circleDataRoot = path.join(engineRoot, circleDataPath);

    if (fs.existsSync(circleDataRoot)) {
        for (const entry of fs.readdirSync(circleDataRoot, {withFileTypes: true})) {
            if (entry.isFile() && entry.name.endsWith('.json') && !files.has(path.join(workspaceRoot, circleDataPath, entry.name))) {
                add(path.join(circleDataRoot, entry.name), 'asset')
            }
        }
    }

    const initialFiles = new Set(files.keys());

    /** @summary Records reverse reachability for package admission or individual module identity. */
    const connect = (graph, importer, target) => {
        if (!graph.has(target)) graph.set(target, new Set());
        graph.get(target).add(importer)
    };

    /** @summary Finds all transitive importers, including cycles, without revisiting module source. */
    const reachImporters = (graph, seeds) => {
        const reached = new Set(seeds), pending = [...reached];
        for (let index = 0; index < pending.length; index++) {
            for (const importer of graph.get(pending[index]) || []) {
                if (!reached.has(importer)) {reached.add(importer); pending.push(importer)}
            }
        }
        return reached
    };

    /** @summary Keeps unresolved package edges attributable to their importer instead of silently falling back. */
    const failure = (sourcePath, specifier, reason) =>
        `${path.relative(workspaceRoot, sourcePath)} → ${specifier}: ${reason}`;

    /** @summary Refuses unsupported package modules only after their owner is admitted to the emitted graph. */
    const validateAdmittedModule = node => {
        const edge = node.importedBy || {
            sourcePath: path.join(workspaceRoot, 'package.json'),
            specifier : path.relative(workspaceRoot, node.sourcePath)
        };
        if (node.linkedOutsidePackage) {
            throw new Error(failure(edge.sourcePath, edge.specifier, 'module leaves its package through a link'))
        }
        if (node.errors.length) throw new Error(node.errors.join('\n'));
        if (!node.packageRoot) {
            throw new Error(failure(edge.sourcePath, edge.specifier,
                'required static imports do not resolve inside the output tree; declare the workspace root in neo.esmSourceRoots'))
        }
    };

    /** @summary Detects imports targeting a second neo.mjs copy distinct from engineRoot. */
    const isDifferentEngine = targetPath => {
        const targetPackage = packageOwner(workspaceRoot, targetPath);
        if (!targetPackage) return false;
        if (!packageNames.has(targetPackage)) {
            const manifestPath = path.join(targetPackage, 'package.json');
            packageNames.set(targetPackage, fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).name : null)
        }
        return (path.basename(targetPackage) === 'neo.mjs' || packageNames.get(targetPackage) === 'neo.mjs') &&
            fs.realpathSync(targetPath) !== path.join(engineReal, path.relative(targetPackage, targetPath))
    };

    /** @summary Resolves physical Engine identity without mutating the static admission graph. */
    const engineIdentity = sourcePath => {
        const real        = fs.realpathSync(sourcePath), owner = packageOwner(workspaceRoot, sourcePath),
              ownerReal   = owner && fs.realpathSync(owner),
              engineAlias = within(path.join(engineReal, 'src'), real) || ownerReal === engineReal && within(engineReal, real),
              isEngine    = within(engineSource, sourcePath) || owner === engineRoot || engineAlias;
        return {real, owner, ownerReal, engineAlias, isEngine}
    };

    /** @summary Visits one logical module; physical ancestry bounds cycles made of ever-deeper linked aliases. */
    const visit = (sourcePath, ancestors = new Set()) => {
        if (nodes.has(sourcePath)) return nodes.get(sourcePath);
        const {real, owner, ownerReal, engineAlias, isEngine} = engineIdentity(sourcePath),
              node                                            = {sourcePath, owner: isEngine ? engineOwner : owner || (initialFiles.has(sourcePath) ? workspaceOwner : sourcePath),
                  packageRoot: owner, errors: [], imports: []};
        nodes.set(sourcePath, node);
        if (isEngine) {
            connect(moduleImporters, sourcePath, engineOwner);
            const canonical = engineAlias && path.join(engineRoot, path.relative(engineReal, real));
            if (canonical && sourcePath !== canonical) {
                files.set(sourcePath, {
                    outputPath: esmDestination(canonical, options),
                    type      : 'reference'
                })
            }
            return node
        }
        node.linkedOutsidePackage = owner && !within(ownerReal, real);
        if (!physicalOwners.has(real)) physicalOwners.set(real, []);
        const aliases = physicalOwners.get(real);
        for (const prior of aliases) {
            const error = failure(sourcePath, path.relative(workspaceRoot, prior.sourcePath), 'ambiguous linked module aliases');
            prior.errors.push(error);
            node.errors.push(error);
            connect(moduleImporters, sourcePath, prior.sourcePath);
            connect(moduleImporters, prior.sourcePath, sourcePath);
            connect(reverse, node.owner, prior.owner)
        }
        aliases.push(node);
        if (ancestors.has(real)) return node;
        if (!['.mjs', '.js'].includes(path.extname(sourcePath))) return node;
        if (!parsed.has(real)) parsed.set(real, staticModuleSpecifiers(fs.readFileSync(sourcePath, 'utf8')));
        const nextAncestors = new Set([...ancestors, real]);
        for (const specifier of parsed.get(real)) {
            const absolute = specifier.startsWith('/') && !specifier.startsWith('//');
            if (absolute) node.errors.push(failure(sourcePath, specifier, 'absolute module import has no relative emitted destination'));
            if (!absolute && !specifier.startsWith('./') && !specifier.startsWith('../')) {
                // External URL imports are not local graph edges. Bare package resolution is not a browser URL.
                if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(specifier)) continue;
                node.errors.push(failure(sourcePath, specifier, 'bare package import has no emitted browser-relative destination'));
                if (specifier === 'neo.mjs' || specifier.startsWith('neo.mjs/')) {
                    connect(reverse, node.owner, engineOwner);
                    connect(moduleImporters, sourcePath, engineOwner)
                }
                continue
            }
            const targetPath = absolute ? path.join(workspaceRoot, specifier.substring(1)) : path.resolve(path.dirname(sourcePath), specifier);
            if (isExcludedDistResource(targetPath)) {
                node.errors.push(failure(sourcePath, specifier, 'resource is excluded from browser output'));
                continue
            }
            if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
                node.errors.push(failure(sourcePath, specifier, 'required static module is missing or is not a file'));
                continue
            }
            if (owner && !absolute) {
                const physicalTarget = path.resolve(path.dirname(real), specifier);
                if (!fs.existsSync(physicalTarget) || fs.realpathSync(physicalTarget) !== fs.realpathSync(targetPath)) {
                    node.errors.push(failure(sourcePath, specifier, 'linked package peer graph differs from the workspace import'))
                }
            }
            if (isDifferentEngine(targetPath)) {
                node.errors.push(failure(sourcePath, specifier, 'import reaches a different Engine installation'));
                connect(reverse, node.owner, engineOwner);
                connect(moduleImporters, sourcePath, engineOwner);
                continue
            }
            const target = visit(targetPath, nextAncestors);
            target.importedBy ||= {sourcePath, specifier};
            node.imports.push({specifier, targetPath});
            connect(moduleImporters, sourcePath, targetPath);
            connect(reverse, node.owner, target.owner)
        }
        return node
    };

    // Declared package roots retain their declared admission. A workspace static edge may reach the same
    // files, at which point both admissions consume this one plan and the same destination for each file.
    for (const [sourcePath, entry] of files) {
        if (entry.type === 'module' && !within(engineSource, sourcePath) &&
            !packageRoots.some(root => within(root.sourceRoot, sourcePath))) visit(sourcePath)
    }
    for (const node of nodes.values()) {
        if (initialFiles.has(node.sourcePath)) admitted.add(node.owner)
    }
    const admittedOwners = reachImporters(reverse, admitted);
    for (const node of nodes.values()) {
        if (!admittedOwners.has(node.owner) || node.owner === engineOwner || node.owner === workspaceOwner) continue;
        validateAdmittedModule(node);
        const extension = path.extname(node.sourcePath),
              type      = ['.mjs', '.js'].includes(extension) ? 'module' : extension === '.json' ? 'json-data' : 'asset';
        add(node.sourcePath, type)
    }

    const rootModules = [...files].flatMap(([sourcePath, entry]) => {
              const root = entry.type === 'module' && packageRoots.find(root => within(root.sourceRoot, sourcePath));
              return root ? [{key: root.key, node: visit(sourcePath)}] : []
          }),
          dynamicVisited = new Set(),
          dynamicEdges   = new Map();

    /** @summary Extends root-reach inspection through literal dynamic imports without admitting or referencing files. */
    const inspectRootReach = (sourcePath, ancestors = new Set()) => {
        if (dynamicVisited.has(sourcePath)) return;
        dynamicVisited.add(sourcePath);
        const node             = nodes.get(sourcePath),
              {real, isEngine} = engineIdentity(sourcePath);
        if (isEngine) {
            connect(moduleImporters, sourcePath, engineOwner);
            return
        }
        if (ancestors.has(real) || !['.mjs', '.js'].includes(path.extname(sourcePath))) return;
        const code          = fs.readFileSync(sourcePath, 'utf8'),
              edges         = [],
              nextAncestors = new Set([...ancestors, real]),
              follow        = (specifier, recordEdge) => {
                  const absolute = specifier.startsWith('/') && !specifier.startsWith('//');
                  if (!absolute && !specifier.startsWith('./') && !specifier.startsWith('../')) {
                      if (specifier === 'neo.mjs' || specifier.startsWith('neo.mjs/')) {
                          connect(moduleImporters, sourcePath, engineOwner)
                      }
                      return
                  }
                  const targetPath = absolute
                      ? path.join(workspaceRoot, specifier.substring(1))
                      : path.resolve(path.dirname(sourcePath), specifier);
                  if (isExcludedDistResource(targetPath) || !fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) return;
                  if (recordEdge) edges.push({specifier, targetPath});
                  if (isDifferentEngine(targetPath)) {
                      connect(moduleImporters, targetPath, engineOwner);
                      connect(moduleImporters, sourcePath, targetPath);
                      return
                  }
                  connect(moduleImporters, sourcePath, targetPath);
                  inspectRootReach(targetPath, nextAncestors)
              };
        dynamicEdges.set(sourcePath, edges);
        if (node) {
            for (const {targetPath} of node.imports) inspectRootReach(targetPath, nextAncestors)
        } else {
            for (const specifier of parsed.get(real) || staticModuleSpecifiers(code)) follow(specifier, false)
        }
        for (const specifier of literalDynamicSpecifiers(code)) follow(specifier, Boolean(node))
    };

    for (const {node} of rootModules) inspectRootReach(node.sourcePath);
    const reachesEngine = reachImporters(moduleImporters, [engineOwner]);
    for (const {key, node} of rootModules) {
        for (const {specifier, targetPath} of node.imports) {
            if (!files.has(targetPath) && reachesEngine.has(targetPath)) {
                throw new Error(failure(node.sourcePath, specifier,
                    `outside-root helper reaches the source Engine; declare its directory in neo.${key} or move it inside a declared root`))
            }
        }
        for (const {specifier, targetPath} of dynamicEdges.get(node.sourcePath) || []) {
            if (!files.has(targetPath) && !engineIdentity(targetPath).isEngine && reachesEngine.has(targetPath)) {
                throw new Error(failure(node.sourcePath, specifier,
                    `outside-root helper reaches the source Engine; declare its directory in neo.${key} or move it inside a declared root`))
            }
        }
    }
    return {files, excludedOutputs}
}
