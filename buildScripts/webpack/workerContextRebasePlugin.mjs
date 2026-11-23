import fs      from 'fs';
import path    from 'path';
import webpack from 'webpack';

/**
 * @summary A pattern that matches nothing, used to empty an optional root's context.
 * @private
 */
const MATCHES_NOTHING = /(?!)/;

/**
 * @summary Worker context roots that ship inside the package: the Canvas worker's engine renderers
 * (`src/canvas`) and the Data worker's `src/data` tree.
 * @private
 */
const PACKAGE_LOCAL_ROOTS = ['../canvas', '../data'];

/**
 * @summary Does this context root resolve inside the installed `neo.mjs` package?
 *
 * Worker roots fall into two kinds. **Package-local** roots (`PACKAGE_LOCAL_ROOTS`, and the trees
 * beneath them) ship with the framework, so they resolve as authored no matter who installed it.
 * Everything else is **app space** — the consumer's `apps`, `examples` and `docs/app` trees — which
 * live outside the package and must be rebased.
 *
 * Both separators are accepted, and a bare root counts: a context request carries no trailing
 * separator, so `../data` and `../data/connection` are equally package-local.
 *
 * @param {String} request A context request, relative to the worker's directory.
 * @returns {Boolean}
 * @private
 */
function isPackageLocal(request) {
    const root = request.replaceAll('\\', '/');

    return PACKAGE_LOCAL_ROOTS.some(local => root === local || root.startsWith(`${local}/`))
}

/**
 * @summary Rebases one app-space context root onto the workspace the build was started in.
 *
 * A request is authored relative to the worker's own directory, so the path it names inside the package
 * is the same one it names inside the workspace: `../..` is the package root here and the workspace root
 * there, and `../../apps/probe` is `<package>/apps/probe` here and `<workspace>/apps/probe` there.
 * Resolving it against the package root and re-pointing that relative path at the workspace root holds
 * for an installed, a linked and a pnpm-stored package alike, because nothing is derived from where the
 * package happens to resolve to.
 *
 * Answers `undefined` when the request names a tree outside the package, which no app-space root
 * does. The caller then empties the root, exactly as it does for an optional root the consumer does
 * not have.
 *
 * A call that supplies no workspace root keeps the original one-argument contract: the package is
 * assumed to sit at `<workspace>/node_modules/neo.mjs`, so the workspace is four directories above
 * the worker. Every consumer config passes `cwd`, so the assumption survives only for callers that
 * never had a workspace to name — and it reproduces the `'../../' + request` prefix those callers
 * used to get.
 *
 * @param {String} workerDir The worker's own directory, as webpack resolved it.
 * @param {String} request A context request, relative to the worker's directory.
 * @param {String} [workspaceRoot] The consumer workspace the build was started in.
 * @returns {String|undefined}
 * @private
 */
function rebaseToWorkspace(workerDir, request, workspaceRoot) {
    const root        = workspaceRoot ? path.resolve(workspaceRoot) : path.resolve(workerDir, '../../../..'),
          packageRoot = path.resolve(workerDir, '../..'),
          inPackage   = path.relative(packageRoot, path.resolve(workerDir, request.replaceAll('\\', '/')));

    if (inPackage.startsWith('..')) return;

    const target  = path.join(root, inPackage),
          rebased = path.relative(path.resolve(workerDir), target).split(path.sep).join('/');

    return rebased.startsWith('.') ? rebased : `./${rebased}`
}

/**
 * @summary Rebases a worker's lazy context roots from the installed package out to the consumer workspace.
 *
 * A worker authors its dynamic-import roots relative to its own directory, which is correct while
 * the repository *is* the thing being built. Once `neo.mjs` is a dependency, the same relative root
 * points inside `node_modules/neo.mjs`, where the consumer's application code does not live. This
 * plugin supplies the missing half of that contract: app-space roots step out to the consumer
 * workspace, package-local roots stay where they are.
 *
 * **Why the phase gate.** `ContextReplacementPlugin` taps both `beforeResolve` and `afterResolve`,
 * so this callback runs twice for every context; only the first carries an unresolved request.
 * Gating on that phase keeps the rebase idempotent, which frees the request test to mean exactly one
 * thing — "is this root package-local?" — rather than doubling as an already-rebased marker. A
 * marker built from the request string cannot tell an authored `../../apps` from a rebased one, and
 * would silently leave the former pointing into the package.
 *
 * **Optional roots.** App-space roots are optional for a consumer: most workspaces have `apps` and
 * no `examples` or `docs/app`. A rebased root that does not exist would fail the build, so an absent
 * one keeps its package-relative request — which always resolves, since the published package ships
 * all of them — and has its match emptied instead. Resolving it to the framework's own tree without
 * emptying it would pull the engine's examples into a consumer bundle, which is the bloat this
 * change exists to remove.
 *
 * @param {Boolean} insideNeo Building the framework repository itself, where no rebasing applies.
 * @param {String} [workspaceRoot] The consumer workspace the build was started in, as its configs already
 * hold it in `cwd`. Path arithmetic from where the package resolves cannot know the workspace, and a linked
 * package does not resolve into the workspace at all. Omitted, the caller falls back to the fixed installed
 * depth (`<workspace>/node_modules/neo.mjs`), which is what one-argument callers were always given.
 * @returns {webpack.ContextReplacementPlugin}
 */
export default function workerContextRebasePlugin(insideNeo, workspaceRoot) {
    return new webpack.ContextReplacementPlugin(/.*/, context => {
        // afterResolve repeats the callback with the request already rebased.
        if (context.resource !== undefined) return;

        const con = context.context;

        if (insideNeo || !con || !(con.includes('/src/worker') || con.includes('\\src\\worker'))) return;

        if (isPackageLocal(context.request)) return;

        const rebased = rebaseToWorkspace(con, context.request, workspaceRoot);

        if (rebased !== undefined && fs.existsSync(path.resolve(con, rebased))) {
            context.request = rebased
        } else {
            context.regExp = MATCHES_NOTHING
        }
    })
}
