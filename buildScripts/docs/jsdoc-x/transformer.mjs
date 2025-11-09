import {getSymbolsComparer} from './sorter.mjs';
import utils                from './utils.mjs';

function identity(o) {
    return o;
}

function normalizeAccess(access) {
    // ['public', 'protected', 'private', 'package']
    if (access === 'all') return access; // 'all'
    if (typeof access !== 'string' && !Array.isArray(access)) {
        return ['public', 'protected'];
    }
    return Array.isArray(access) ? access : [access];
}

// sorts documentation symbols and properties of each symbol, if any.
function sortDocs(docs, sortType) {
    if (!sortType) return;
    const fnSorter = getSymbolsComparer(sortType, '$longname');
    const fnPropSorter = getSymbolsComparer(sortType, 'name');
    docs.sort(fnSorter);
    docs.forEach(symbol => {
        if (symbol && Array.isArray(symbol.properties)) {
            symbol.properties.sort(fnPropSorter);
        }
    });
}

function hierarchy(docs, sortType) {
    const fnSorter = getSymbolsComparer(sortType, '$longname');
    const fnPropSorter = getSymbolsComparer('alphabetic', 'name');

    // Use a reverse loop to be able to splice items without affecting the loop
    for (let i = docs.length - 1; i >= 0; i--) {
        const symbol = docs[i];
        let parent;

        // Move constructor (method definition) to class declaration symbol
        if (utils.isConstructor(symbol)) {
            parent = docs.find(o => o.$longname === symbol.$longname && utils.isClass(o));
            if (parent) {
                parent.$constructor = symbol;
                docs.splice(i, 1);
            }
        } else if (symbol.memberof && symbol.longname !== 'module.exports') {
            // first check and sort if it has properties
            if (fnPropSorter && Array.isArray(symbol.properties)) {
                symbol.properties.sort(fnPropSorter);
            }

            parent = docs.find(sym => utils._cleanName(sym.longname) === utils._cleanName(symbol.memberof));

            if (parent && !utils.isConstructor(parent)) {
                parent.$members = parent.$members || [];
                parent.$members.push(symbol);
                docs.splice(i, 1);
            }
        }
    }

    // After moving members, sort the members array of each parent
    for (const symbol of docs) {
        if (symbol.$members) {
            if (fnSorter) {
                symbol.$members.sort(fnSorter);
            } else {
                // reverse because we iterated backwards when pushing
                symbol.$members.reverse();
            }
        }
    }

    if (fnSorter) docs.sort(fnSorter);
    return docs;
}

function isSymbolComparable(symbol) {
    return typeof symbol.name === 'string'
        && typeof symbol.longname === 'string'
        && (symbol.meta !== null && typeof symbol.meta === 'object')
        && (symbol.meta.code !== null && typeof symbol.meta.code === 'object')
        && typeof symbol.meta.code.name === 'string';
}

function isDuplicateSymbol(docs, symbol) {
    if (!isSymbolComparable(symbol)) return false;

    const found = docs.find(s => {
        if (!isSymbolComparable(s)) return false;

        const meta = s.meta;
        const symMeta = symbol.meta;

        const isDup = s.name === symbol.name
            && meta.path === symMeta.path
            && meta.filename === symMeta.filename
            && meta.lineno === symMeta.lineno
            && meta.code.type === symMeta.code.type;
        if (!isDup) return false;

        if (meta.code.name.length < symMeta.code.name.length) return true;
        if (meta.code.name.length === symMeta.code.name.length) {
            return s.longname.length < symbol.longname.length;
        }

        return false;
    });

    return Boolean(found);
}

export function transform(docs, options, predicate) {
    if (!options && !predicate) return docs;
    if (!predicate && typeof options === 'function') {
        predicate = options;
        options = {};
    }

    if (typeof predicate === 'string') {
        const re = new RegExp(String(predicate));
        predicate = symbol => re.test(symbol.longname);
    } else if (typeof predicate !== 'function') {
        predicate = identity;
    }

    docs = Array.isArray(docs) ? docs : [];

    // Filter out items that do not have meta.filename, as jsdocx.mjs expects it.
    docs = docs.filter(symbol => symbol.meta?.filename);

    const defaultedOptions = {
        access: undefined,
        package: true,
        module: true,
        undocumented: true,
        undescribed: true,
        ignored: true,
        hierarchy: false,
        sort: false, // (true|"alphabetic")|"grouped"|false
        relativePath: null,
        ...options
    };

    const access = normalizeAccess(defaultedOptions.access);

    if (!defaultedOptions.undocumented) {
        docs = docs.filter(symbol => !symbol.undocumented || utils.isConstructor(symbol));
    }

    const filteredDocs = docs.reduce((memo, symbol) => {
        symbol.$longname = utils.getLongName(symbol);
        symbol.$kind = utils.getKind(symbol);

        const undoc = defaultedOptions.undocumented || symbol.undocumented !== true;
        const undesc = defaultedOptions.undescribed || utils.hasDescription(symbol);
        const pkg = defaultedOptions.package || symbol.kind !== 'package';
        const mdl = defaultedOptions.module || symbol.longname !== 'module.exports';
        const ignored = defaultedOptions.ignored || symbol.ignore !== true;
        const acc = access === 'all' || !symbol.access || access.includes(symbol.access);

        const isDup = isDuplicateSymbol(docs, symbol);
        const isCon = acc && !isDup && utils.isConstructor(symbol);

        if (isCon || (undoc && undesc && pkg && mdl && acc && ignored && !isDup)) {
            // relativePath logic can be added here if needed
            const o = predicate(symbol);
            if (o !== null && typeof o === 'object') {
                memo.push(o); // filtered symbol pushed
            } else if (o) { // boolean check
                memo.push(symbol); // original symbol pushed
            }
        }

        return memo;
    }, []);

    if (defaultedOptions.hierarchy) {
        return hierarchy(filteredDocs, defaultedOptions.sort);
    }

    if (defaultedOptions.sort) {
        sortDocs(filteredDocs, defaultedOptions.sort);
    }

    return filteredDocs;
}
