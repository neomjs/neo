import path    from 'path';
import webpack from 'webpack';

/**
 * @summary Does this context root resolve inside the installed `neo.mjs` package?
 *
 * Worker roots fall into two kinds. **Package-local** roots (`src/data`, and the connection,
 * parser and normalizer trees beneath it) ship with the framework, so they resolve as authored no
 * matter who installed it. Everything else is **app space** — the consumer's `apps`, `examples`
 * and `docs/app` trees — which live outside the package and must be rebased.
 *
 * Both separators are accepted, and a bare root counts: a context request carries no trailing
 * separator, so `../data` and `../data/connection` are equally package-local.
 *
 * @param {String} request A context request, relative to the worker's directory.
 * @returns {Boolean}
 * @private
 */
function isPackageLocal(request) {
    return request === '../data'  || request.startsWith('../data/') ||
           request === '..\\data' || request.startsWith('..\\data\\')
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
 * @param {Boolean} insideNeo Building the framework repository itself, where no rebasing applies.
 * @returns {webpack.ContextReplacementPlugin}
 */
export default function workerContextRebasePlugin(insideNeo) {
    return new webpack.ContextReplacementPlugin(/.*/, context => {
        // afterResolve repeats the callback with the request already rebased.
        if (context.resource !== undefined) return;

        const con = context.context;

        if (insideNeo || !con || !(con.includes('/src/worker') || con.includes('\\src\\worker'))) return;

        if (!isPackageLocal(context.request)) {
            context.request = path.join('../../', context.request)
        }
    })
}
