import {Command}       from 'commander';
import fs              from 'fs-extra';
import path            from 'path';
import {sanitizeInput} from './sanitizer.mjs';

/**
 * Resolves the canonical path for `targetAbs` even when leaf directories do not exist yet.
 * @param {String} targetAbs
 * @returns {String}
 */
const resolveCanonicalTarget = targetAbs => {
    let ancestor = targetAbs;

    while (!fs.existsSync(ancestor)) {
        const parent = path.dirname(ancestor);

        if (parent === ancestor) {
            break
        }

        ancestor = parent
    }

    const ancestorReal = fs.realpathSync(ancestor),
          relSuffix    = path.relative(ancestor, targetAbs);

    return relSuffix ? path.resolve(ancestorReal, relSuffix) : ancestorReal
};

/**
 * Parses and lexically validates comma-separated `--exclude` entries as strict relative descendants.
 * @param {String} rawExclude
 * @returns {Array<{posixRel: String, raw: String, segments: String[]}>}
 */
const parseExcludedEntries = rawExclude => {
    if (!rawExclude) {
        return []
    }

    const seen    = new Set(),
          entries = [];

    for (const part of rawExclude.split(',')) {
        const raw = part.trim();

        if (!raw) {
            continue
        }

        if (
            raw.includes('\0') ||
            raw.startsWith('/') ||
            raw.startsWith('\\') ||
            /^[a-zA-Z]:/.test(raw) ||
            path.isAbsolute(raw)
        ) {
            throw new Error(`Invalid --exclude path "${raw}": absolute and root paths are forbidden`)
        }

        const posixRel = raw.replace(/\\/g, '/').replace(/\/+$/g, '');

        if (!posixRel) {
            throw new Error(`Invalid --exclude path "${raw}": target-root aliases are forbidden`)
        }

        const segments = posixRel.split('/');

        if (segments.some(seg => !seg || seg === '.' || seg === '..')) {
            throw new Error(`Invalid --exclude path "${raw}": traversal and target-root aliases are forbidden`)
        }

        if (!seen.has(posixRel)) {
            seen.add(posixRel);
            entries.push({posixRel, raw, segments})
        }
    }

    return entries
};

/**
 * Verifies that `entry` resolves strictly inside `targetAbs` and does not traverse any symlinked
 * parent escaping `targetAbs`'s canonical directory.
 * @param {String} targetAbs
 * @param {{posixRel: String, raw: String, segments: String[]}} entry
 * @returns {String} Resolved candidate path inside `targetAbs`.
 */
const assertContainedTargetDescendant = (targetAbs, entry) => {
    const candidateAbs  = path.resolve(targetAbs, ...entry.segments),
          relFromTarget = path.relative(targetAbs, candidateAbs);

    if (!relFromTarget || relFromTarget === '.' || relFromTarget.startsWith('..') || path.isAbsolute(relFromTarget)) {
        throw new Error(`Invalid --exclude path "${entry.raw}": must resolve to a strict descendant of target`)
    }

    const targetReal = resolveCanonicalTarget(targetAbs);
    let   current    = targetAbs;

    for (let i = 0; i < entry.segments.length - 1; i++) {
        current = path.join(current, entry.segments[i]);

        let stat;
        try {
            stat = fs.lstatSync(current)
        } catch (err) {
            if (err?.code === 'ENOENT') {
                break
            }
            throw err
        }

        let currentReal;
        try {
            currentReal = fs.realpathSync(current)
        } catch {
            throw new Error(`Invalid --exclude path "${entry.raw}": broken symlinked parent "${current}"`)
        }

        if (currentReal !== targetReal && !currentReal.startsWith(targetReal + path.sep)) {
            throw new Error(`Invalid --exclude path "${entry.raw}": symlinked parent escapes target directory`)
        }

        if (stat.isSymbolicLink() && currentReal === targetReal) {
            throw new Error(`Invalid --exclude path "${entry.raw}": symlinked parent aliases target root`)
        }
    }

    return candidateAbs
};

const program = new Command('copyFolder')
    .version('1.0.0')
    .option('-s, --source <value>', 'path to the source folder', sanitizeInput)
    .option('-t, --target <value>', 'path to the target folder', sanitizeInput)
    .option('-i, --include <value>', 'comma-separated paths, relative to the source, to copy instead of the whole folder')
    .option('-x, --exclude <value>', 'comma-separated paths, relative to the source, to omit when copying the folder')
    .allowUnknownOption()
    .parse(process.argv);

const programOpts = program.opts();

if (!programOpts.source) {
    throw new Error('Missing -s param')
}

if (!programOpts.target) {
    throw new Error('Missing -t param')
}

const sourceAbs       = path.resolve(programOpts.source),
      targetAbs       = path.resolve(programOpts.target),
      excludedEntries = parseExcludedEntries(programOpts.exclude),
      excluded        = new Set(excludedEntries.map(entry => entry.posixRel));

for (const entry of excludedEntries) {
    assertContainedTargetDescendant(targetAbs, entry)
}

fs.mkdirpSync(targetAbs, {recursive: true});

if (programOpts.include) {
    programOpts.include.split(',').map(item => item.trim()).filter(Boolean).forEach(item => {
        const normalizedItem = item.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

        if (!excluded.has(normalizedItem)) {
            fs.copySync(path.join(sourceAbs, item), path.join(targetAbs, item))
        }
    })
} else {
    fs.copySync(sourceAbs, targetAbs, excluded.size ? {
        filter: src => {
            const rel = path.relative(sourceAbs, src).replace(/\\/g, '/');
            return !rel || !excluded.has(rel)
        }
    } : undefined)
}

for (const entry of excludedEntries) {
    const candidateAbs = assertContainedTargetDescendant(targetAbs, entry);
    fs.removeSync(candidateAbs)
}
