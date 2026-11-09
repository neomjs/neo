import {createHash}                   from 'node:crypto';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

/**
 * @module buildScripts/util/moveReferenceScopes
 * @summary Binds caller-supplied dynamic-reference scopes to exact source and checks them against a relocation.
 */

/**
 * @summary Computes the source identity carried by a reference-scope record.
 * @param {String|Buffer} source Original module bytes.
 * @returns {String}
 */
export function sourceHash(source) {
    return createHash('sha256').update(source).digest('hex')
}

/**
 * @summary Tests containment without accepting adjacent directory names as descendants.
 * @param {String} root Absolute root.
 * @param {String} file Absolute candidate.
 * @returns {Boolean}
 */
function contains(root, file) {
    const relative = path.relative(root, file);
    return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/**
 * @summary Classifies unresolved source references, admitting only unchanged, disjoint declared local scopes.
 * Declarations are invocation inputs rather than source annotations. A declaration must identify one exact
 * expression and its source hash; it never authorizes rewriting a computed expression. Protocol declarations
 * describe only remote or built-in targets, and local roots must remain disjoint from every moved subtree.
 * @param {Object} options
 * @param {String} options.root Owned repository root.
 * @param {String} options.file Original module file.
 * @param {String} options.to Final module file.
 * @param {String} options.code Original source.
 * @param {Object[]} options.references Unresolved references from rewriteModule().
 * @param {Object[]} options.moves Complete old/new path pairs.
 * @param {Object[]} [options.scopes] File/start/expression/sourceHash plus roots and/or protocols records.
 * @param {Map<Number,String>} [options.nativeSites] Inspected native reader offsets and their transformed carrier families.
 * @returns {Object[]} Reference records with status, reason and source identity.
 */
export function classifyReferences({root, file, to, code, references, moves, scopes=[], nativeSites=new Map()}) {
    const hash     = sourceHash(code), relative = path.relative(root, file).split(path.sep).join('/'),
        intersects = directory => moves.some(move => contains(directory, move.from) || contains(move.from, directory) ||
            contains(directory, move.to) || contains(move.to, directory));

    return references.map(reference => {
        const expression = code.slice(reference.start, reference.end),
            matches      = scopes.filter(scope => scope.file === relative && scope.start === reference.start),
            result       = {...reference, file, expression, sourceHash: hash, status: 'blocked'},
            origin       = reference.origin ?? file,
            originMove   = moves.find(move => contains(move.from, origin)),
            nextOrigin   = origin === file ? to : originMove ? path.join(originMove.to, path.relative(originMove.from, origin)) : origin,
            directory    = reference.prefix ? fileURLToPath(new URL(reference.prefix, pathToFileURL(origin))) : null;

        if (reference.reason) return {...result, reason: reference.reason};
        if (matches.length && (matches.length !== 1 || matches[0].expression !== expression || matches[0].sourceHash !== hash)) {
            return {...result, reason: 'Reference scope is stale or ambiguous'}
        }
        if (nativeSites.has(reference.start)) return {...result, status: 'carrier-resolved', carrier: nativeSites.get(reference.start),
            reason: 'Pinned native reader; owned inputs are checked by the carrier transforms'};
        if (reference.externalProtocol) return {...result, status: 'external', reason: 'Fixed external protocol'};

        if (matches.length) {
            const scope = matches[0];
            const roots = scope.roots ?? [], protocols = scope.protocols ?? [];
            if (!Array.isArray(roots) || !Array.isArray(protocols) || !roots.length && !protocols.length ||
                roots.some(value => typeof value !== 'string' || !value) ||
                protocols.some(value => !['https:', 'http:', 'data:', 'node:'].includes(value))) {
                return {...result, reason: 'Reference scope needs concrete roots or external protocols'}
            }
            if (origin !== nextOrigin && roots.length) return {...result, reason: 'Moving a computed importer requires an origin-aware rewrite'};
            if (roots.some(value => intersects(path.resolve(root, value)))) {
                return {...result, reason: 'Declared reference scope intersects the move'}
            }
            return {...result, status: 'declared', reason: 'Exact-source declaration is disjoint from the move',
                scope: {roots, protocols}};
        }

        return {...result, candidateDirectory: directory,
            reason: 'Computed import scope intersects the move or is unknown'}
    })
}
