import {execFileSync}        from 'child_process';
import fs                    from 'fs-extra';
import path                  from 'path';
import {readReleaseSeoStamp} from '../../release/releaseNoteFrontmatter.mjs';

/**
 * @module buildScripts.docs.seo.gitLastmod
 * @summary Resolves repository-relative paths, git commit history dates, working-tree modification
 * timestamps, and YAML frontmatter dates for Portal SEO generation and sitemap verification.
 */

const ROOT_DIR              = process.cwd();
const GIT_LOG_CHUNK_SIZE    = 200;
const GIT_LOG_MAX_BUFFER    = 64 * 1024 * 1024;
const STATUS_RENAME_CODES   = new Set(['R', 'C']);
const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const FRONTMATTER_BLOCK_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * @summary Normalizes an absolute file or directory path into a repository-relative POSIX git pathspec.
 * @param {String} filePath Absolute file or directory path.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {String}
 */
export function getGitPath(filePath, root=ROOT_DIR) {
    return path.relative(root, filePath).split(path.sep).join('/');
}

/**
 * @summary Checks whether `root` owns a non-shallow `.git` directory or worktree pointer whose commit
 * history is reliable for per-route `lastmod` derivation.
 *
 * Requiring `.git` directly under `root` prevents `node_modules/neo.mjs` installs and temporary test
 * directories from inheriting an enclosing workspace's unrelated git history while supporting both
 * standard clones (`.git` directory) and git worktrees (`.git` file).
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {Boolean}
 */
export function hasReliableGitHistory(root=ROOT_DIR) {
    try {
        if (!fs.existsSync(path.join(root, '.git'))) {
            return false;
        }

        const isShallow = execFileSync(
            'git',
            ['rev-parse', '--is-shallow-repository'],
            {cwd: root, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore']}
        ).trim();

        return isShallow !== 'true';
    } catch {
        return false;
    }
}

/**
 * @summary Normalizes a raw date string or ISO timestamp into `YYYY-MM-DD`, returning `null` when invalid.
 * @param {String|null|undefined} rawValue
 * @returns {String|null}
 */
export function normalizeIsoDateOnly(rawValue) {
    if (!rawValue || typeof rawValue !== 'string') {
        return null;
    }

    const trimmed = rawValue.trim();

    if (ISO_DATE_ONLY_PATTERN.test(trimmed)) {
        return trimmed;
    }

    const ms = Date.parse(trimmed);

    return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10);
}

/**
 * @summary Extracts a normalized `YYYY-MM-DD` date from YAML frontmatter fields when present.
 * @param {String} [rawContent='']
 * @param {String[]} [fields=['publishedAt', 'updatedAt', 'createdAt']]
 * @returns {String|null}
 */
export function extractFrontmatterDateOnly(rawContent='', fields=['publishedAt', 'updatedAt', 'createdAt']) {
    const frontmatter = FRONTMATTER_BLOCK_PATTERN.exec(String(rawContent))?.[1];

    if (!frontmatter) {
        return null;
    }

    for (const field of fields) {
        const raw = new RegExp(`^${field}:\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, 'm').exec(frontmatter)?.[1];
        const iso = normalizeIsoDateOnly(raw);

        if (iso) {
            return iso;
        }
    }

    return null;
}

/**
 * @summary Reads a file at a Git revision, including an empty result when it was absent from the tree.
 * @param {String} revision
 * @param {String} file
 * @param {String} root
 * @returns {String}
 */
function readGitFile(revision, file, root) {
    try {
        return execFileSync('git', ['show', `${revision}:${file}`], {
            cwd: root, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore']
        });
    } catch {
        return ''
    }
}

/**
 * @summary Resolves cut dates only for files changed in the commit that introduced their release stamp.
 * @param {String} commit
 * @param {String[]} files Paths changed in the commit
 * @param {String} notesDir Repository-relative release-notes directory
 * @param {String} root
 * @returns {Map<String, String>}
 */
function getReleaseCommitDates(commit, files, notesDir, root) {
    const dates = new Map();

    for (const file of files) {
        if (path.posix.dirname(file) !== notesDir || !/^v[^/]+\.md$/.test(path.posix.basename(file))) continue;

        const stamp = readReleaseSeoStamp(readGitFile(commit, file, root));
        if (!stamp) continue;

        const previous = readReleaseSeoStamp(readGitFile(`${commit}^`, file, root));
        if (JSON.stringify(stamp) === JSON.stringify(previous)) continue;

        stamp.paths.forEach(source => dates.set(source, stamp.date))
    }

    return dates
}

/**
 * @summary Collects newest per-file `YYYY-MM-DD` commit dates across `scanPaths` in a single batched
 * Git log pass. A release note's stamp supplies the logical cut date for paths changed with that stamp.
 * @param {String[]} [scanPaths=[]] Repository-relative or absolute paths to include in the `git log` pass.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @param {String} [releaseNotesRoot] Absolute path to Engine release notes, when reading release stamps.
 * @returns {Map<String, String>} Map of repository-relative POSIX file path -> `YYYY-MM-DD`.
 */
export function getGitLastmodDateMap(scanPaths=[], root=ROOT_DIR, releaseNotesRoot) {
    const dateMap = new Map();

    if (!hasReliableGitHistory(root)) {
        return dateMap;
    }

    const relativeScanPaths = Array.from(new Set(
        scanPaths
            .filter(Boolean)
            .map(target => path.isAbsolute(target) ? getGitPath(target, root) : target.split(path.sep).join('/'))
            .map(relPath => relPath.replace(/\/+$/, ''))
            .filter(relPath => relPath && !relPath.startsWith('..') && fs.existsSync(path.resolve(root, relPath)))
    ));

    if (relativeScanPaths.length === 0) {
        return dateMap;
    }

    try {
        const output = execFileSync(
            'git',
            ['log', '--format=commit:%H%x09%cs', '--name-only', '--', ...relativeScanPaths],
            {cwd: root, encoding: 'utf-8', maxBuffer: GIT_LOG_MAX_BUFFER, stdio: ['pipe', 'pipe', 'ignore']}
        );

        const notesDir = releaseNotesRoot && getGitPath(releaseNotesRoot, root);
        let commit, date, files = [];

        const collect = () => {
            const pending = files.filter(file => !dateMap.has(file));
            if (!pending.length) return;

            const releaseDates = notesDir && getReleaseCommitDates(commit, files, notesDir, root);

            pending.forEach(file => dateMap.set(file, releaseDates?.get(file) || date))
        };

        for (const rawLine of output.split('\n')) {
            const line = rawLine.trim();

            if (!line) {
                continue;
            }

            if (line.startsWith('commit:')) {
                collect();
                [commit, date] = line.slice('commit:'.length).split('\t');
                files = [];
            } else if (date) {
                files.push(line)
            }
        }
        collect();
    } catch {
        // Return empty map on git execution errors so callers fall back gracefully.
    }

    return dateMap;
}

/**
 * @summary Splits an array into bounded chunks that stay below shell argument limits.
 * @param {Array} items
 * @param {Number} size
 * @returns {Array<Array>}
 */
export function chunkArray(items, size) {
    const chunks = [];

    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }

    return chunks;
}

/**
 * @summary Formats a `Date` instance as a sitemap-compatible ISO timestamp without milliseconds.
 * @param {Date} date
 * @returns {String}
 */
export function formatLastmodDate(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * @summary Gets working-tree paths changed relative to `HEAD`.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @param {Boolean} [required=false] Require a Git status read when preparing an actual release.
 * @returns {Set<String>} Repository-relative POSIX paths.
 */
export function getChangedGitPaths(root=ROOT_DIR, required=false) {
    const paths = new Set();

    if (!required && !hasReliableGitHistory(root)) {
        return paths;
    }

    try {
        const result = execFileSync(
            'git',
            ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
            {cwd: root, encoding: 'utf-8', maxBuffer: GIT_LOG_MAX_BUFFER, stdio: ['pipe', 'pipe', 'ignore']}
        );

        const entries = result.split('\0');

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];

            if (!entry) {
                continue;
            }

            const status  = entry.slice(0, 2);
            const gitPath = entry.slice(3);

            if (STATUS_RENAME_CODES.has(status[0]) || STATUS_RENAME_CODES.has(status[1])) {
                i++;
            }

            if (gitPath) {
                paths.add(gitPath);
            }
        }
    } catch (error) {
        if (required) throw error;
        // Git status is an optimization for uncommitted CI mutations; ignore if unavailable.
    }

    return paths;
}

/**
 * @summary Gets the newest working-tree `mtime` for a modified source path.
 * @param {String} gitPath Repository-relative POSIX path.
 * @param {Set<String>} changedGitPaths Changed path set from `git status`.
 * @param {Boolean} [isDirectory=false] True if `gitPath` represents a directory.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {String|null}
 */
export function getChangedLastmod(gitPath, changedGitPaths, isDirectory=false, root=ROOT_DIR) {
    let lastmod = null;

    function updateLastmod(changedGitPath) {
        try {
            const filePath = path.join(root, ...changedGitPath.split('/'));
            const mtime    = fs.statSync(filePath).mtime;

            if (!lastmod || mtime > lastmod) {
                lastmod = mtime;
            }
        } catch {
            // Deleted paths are not emitted as sitemap routes; missing files can be ignored.
        }
    }

    if (changedGitPaths.has(gitPath)) {
        updateLastmod(gitPath);
    }

    if (isDirectory) {
        const gitPathWithSlash = gitPath.endsWith('/') ? gitPath : `${gitPath}/`;

        for (const changedGitPath of changedGitPaths) {
            if (changedGitPath.startsWith(gitPathWithSlash)) {
                updateLastmod(changedGitPath);
            }
        }
    }

    return lastmod ? formatLastmodDate(lastmod) : null;
}

/**
 * @summary Gets git commit `<lastmod>` ISO timestamps for multiple files or directories in bounded batches.
 * @param {String[]} filePaths Array of absolute file paths.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {Map<String, String>} Map of `filePath` -> ISO date string.
 */
export function getGitLastModifiedBatch(filePaths, root=ROOT_DIR) {
    const dateMap     = new Map();
    const inRepoPaths = Array.from(new Set(filePaths)).filter(filePath => !getGitPath(filePath, root).startsWith('../'));

    if (inRepoPaths.length === 0 || !hasReliableGitHistory(root)) {
        return dateMap;
    }

    const pathDescriptors = inRepoPaths.map(filePath => {
        let isDirectory = false;

        try {
            isDirectory = fs.statSync(filePath).isDirectory();
        } catch {
            isDirectory = false;
        }

        return {
            filePath,
            gitPath: getGitPath(filePath, root),
            isDirectory
        };
    });

    try {
        for (const chunk of chunkArray(pathDescriptors, GIT_LOG_CHUNK_SIZE)) {
            try {
                const filePathByGitPath = new Map(
                    chunk.filter(({isDirectory}) => !isDirectory).map(({filePath, gitPath}) => [gitPath, filePath])
                );
                const directoryDescriptors = chunk
                    .filter(({isDirectory}) => isDirectory)
                    .map(descriptor => ({
                        ...descriptor,
                        gitPathWithSlash: descriptor.gitPath.endsWith('/') ? descriptor.gitPath : `${descriptor.gitPath}/`
                    }));

                const result = execFileSync(
                    'git',
                    ['log', '--format=__NEO_DATE__%cI', '--name-only', '--', ...chunk.map(({gitPath}) => gitPath)],
                    {cwd: root, encoding: 'utf-8', maxBuffer: GIT_LOG_MAX_BUFFER, stdio: ['pipe', 'pipe', 'ignore']}
                );

                let currentDate = null;

                for (const rawLine of result.split('\n')) {
                    const line = rawLine.trim();

                    if (!line) {
                        continue;
                    }

                    if (line.startsWith('__NEO_DATE__')) {
                        currentDate = line.slice('__NEO_DATE__'.length);
                        continue;
                    }

                    if (!currentDate) {
                        continue;
                    }

                    const filePath = filePathByGitPath.get(line);

                    if (filePath && !dateMap.has(filePath)) {
                        dateMap.set(filePath, currentDate);
                    }

                    for (const descriptor of directoryDescriptors) {
                        if (!dateMap.has(descriptor.filePath) && line.startsWith(descriptor.gitPathWithSlash)) {
                            dateMap.set(descriptor.filePath, currentDate);
                        }
                    }
                }
            } catch {
                continue;
            }
        }
    } catch (error) {
        console.warn('Git is not available or error occurred:', error.message);
    }

    return dateMap;
}

/**
 * @summary Resolves the newest `YYYY-MM-DD` git commit date across one or more file or directory paths
 * from a precomputed `gitDateMap`.
 * @param {Map<String, String>} gitDateMap
 * @param {String[]} [candidatePaths=[]] Absolute file or directory paths.
 * @param {String} [root=ROOT_DIR] Repository root.
 * @returns {String|null}
 */
export function lookupNewestGitDate(gitDateMap, candidatePaths=[], root=ROOT_DIR) {
    if (!gitDateMap || gitDateMap.size === 0) {
        return null;
    }

    let newest = null;

    for (const candidatePath of candidatePaths) {
        if (!candidatePath) {
            continue;
        }

        const gitPath = getGitPath(candidatePath, root).replace(/\/+$/, '');

        if (!gitPath || gitPath.startsWith('..')) {
            continue;
        }

        const exactDate = gitDateMap.get(gitPath);

        if (exactDate && (!newest || exactDate > newest)) {
            newest = exactDate;
            continue;
        }

        const prefix = `${gitPath}/`;

        for (const [trackedPath, date] of gitDateMap.entries()) {
            if (trackedPath.startsWith(prefix) && (!newest || date > newest)) {
                newest = date;
            }
        }
    }

    return newest;
}
