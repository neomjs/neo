import fs           from 'fs/promises';
import path         from 'path';
import { execFile } from 'child_process';
import util         from 'util';

/**
 * `execFile`, not `exec`. `exec` spawns a shell, which would make every argument a fragment of a
 * command string — and the only untrusted input here is a caller-supplied path. Passing argv keeps
 * a path a path: `;`, `&&`, `$(…)` and spaces reach the child process as literal characters of one
 * argument, so command injection is unrepresentable rather than filtered.
 */
const execFileAsync = util.promisify(execFile);

/**
 * Resolves a path to the filesystem object it actually names, following symlinks.
 *
 * `fs.realpath` requires the path to exist, but `writeFile` legitimately targets files that do not
 * yet. So the deepest ancestor that DOES exist is canonicalized and the not-yet-created remainder is
 * re-appended — which is the security-relevant part anyway: a create target can only escape through
 * a parent that already exists and already points outside.
 *
 * @param {String} targetPath An absolute, lexically-resolved path.
 * @returns {Promise<String>} The canonical path.
 */
async function canonicalize(targetPath) {
    const tail    = [];
    let   current = targetPath,
          hops    = 0;

    for (;;) {
        try {
            return path.join(await fs.realpath(current), ...tail.slice().reverse())
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;

            // ENOENT from `realpath` has TWO causes and they are NOT the same security state: the
            // entry is absent, or the entry EXISTS as a symlink whose target is missing. Collapsing
            // them treats a dangling alias as "not yet created" — and a write FOLLOWS a dangling
            // symlink, creating the file wherever it points. `lstat` is what tells them apart,
            // because it reports on the link itself rather than on what it fails to reach.
            const entry = await fs.lstat(current).catch(() => null);

            if (entry?.isSymbolicLink()) {
                // Follow the link's declared target and keep canonicalizing from there. `realpath`
                // would have done this for us if the target existed; it does not, so we do it.
                if (++hops > 40) {
                    throw new Error(`ELOOP: symlink chain too long while canonicalizing ${targetPath}`)
                }

                current = path.resolve(path.dirname(current), await fs.readlink(current));
                continue
            }

            const parent = path.dirname(current);

            // Reached the filesystem root without finding anything that exists.
            if (parent === current) throw error;

            tail.push(path.basename(current));
            current = parent
        }
    }
}

/**
 * Validates that a requested path does not reach a filesystem object outside the project root.
 *
 * **Canonical containment, not lexical.** `path.resolve`/`path.relative` normalize *segments*; they
 * do not dereference symlinks. An in-root alias pointing outside produces a perfectly in-root
 * spelling, so a lexical check answers *"is this path spelled inside the root"* when the security
 * contract is *"is the object this reaches inside the root"* — an adjacent question with a confident
 * answer. Both sides are canonicalized before comparison so the alias cannot survive it.
 *
 * **Containment only — this is not a shell-safety guard.** A path can be perfectly inside the root
 * and still contain shell metacharacters. Callers must never treat the return value as safe to
 * interpolate into a command string; use argv.
 *
 * @param {String} absolutePath
 * @returns {Promise<String>} The canonical path if safe — callers operate on the verified object.
 * @throws {Error} If the canonical target lies outside the root.
 */
async function ensureSandboxed(absolutePath) {
    let rootPath, targetPath;

    // THREE states, not two: contained · outside · **could not establish**. A resolution failure —
    // EACCES on an ancestor, ELOOP, a vanished parent — leaves containment UNPROVEN, and unproven
    // must be refused, not surfaced as a raw fs error. A bare `EACCES` reads to a caller (and to an
    // agent reading the tool result) as an I/O problem worth retrying, when the truth is that the
    // jail could not answer. The guard therefore fails closed with its own classification rather
    // than letting the ambiguity escape wearing a different error's name.
    try {
        rootPath   = await fs.realpath(path.resolve(process.cwd()));
        targetPath = await canonicalize(path.resolve(absolutePath))
    } catch (error) {
        throw new Error(
            `403 Forbidden: Canonical containment could not be established (${error?.code ?? 'unknown'}). ` +
            `Refusing the operation — this is NOT a verdict that the path is safe.`
        );
    }

    // Compared on a path boundary, not a string prefix: `startsWith` admitted any sibling directory
    // whose name merely begins with the root's, so `<root>-evil/x` passed a jail meant to exclude it.
    // `path.relative` answers containment directly — an escaping path is either absolute or starts
    // with a `..` segment.
    const relative = path.relative(rootPath, targetPath);

    if (relative !== '' && (path.isAbsolute(relative) || relative.split(path.sep)[0] === '..')) {
        // "jailed to <root>" described a containment this surface does not have. The jail binds this
        // ARGUMENT; it does not bind the process. `run_playwright_test` executes a spec, a spec is
        // arbitrary JavaScript, and its read set is therefore the whole host — so `write_file` plus
        // `run_playwright_test` reaches outside the root without either call violating a guard
        // — reported externally and reproduced from source.
        //
        // The message now says what it enforces. A caller who reads "jailed" and infers containment
        // is being misled by us, and a false boundary is worse than a stated absence of one: it is
        // trusted. Real containment needs process isolation for the executor and does not exist yet.
        throw new Error(`403 Forbidden: Path traversal detected. This ARGUMENT is jailed to ${rootPath}; execution tools are not.`);
    }

    return targetPath;
}

class FileSystemService {
    static async healthcheck() {
        return { status: 'healthy' };
    }

    static async readFile({absolutePath}) {
        const safePath = await ensureSandboxed(absolutePath);
        const buffer   = await fs.readFile(safePath);
        return { content: buffer.toString('utf-8') };
    }

    static async writeFile({absolutePath, content}) {
        const safePath = await ensureSandboxed(absolutePath);
        await fs.writeFile(safePath, content, 'utf-8');
        return 'success';
    }

    static async listDirectory({absolutePath}) {
        const safePath = await ensureSandboxed(absolutePath);
        const entries  = await fs.readdir(safePath, { withFileTypes: true });

        return entries.map(entry => ({
            name       : entry.name,
            isDirectory: entry.isDirectory(),
            isFile     : entry.isFile()
        }));
    }

    static async checkSyntax({absolutePath}) {
        const safePath = await ensureSandboxed(absolutePath);

        try {
            // --check runs the syntax parser without executing
            await execFileAsync('node', ['--check', safePath]);
            return 'Syntax OK';
        } catch (error) {
            // Returning the stderr which contains the compilation error
            return `Syntax Error Detected:\n${error.stderr || error.message}`;
        }
    }

    /**
     * @summary Runs one Playwright spec only when its canonical path is inside the project suite.
     * @param {Object} options
     * @param {String} options.absolutePath The caller-selected spec path.
     * @returns {Promise<String>} The Playwright runner output.
     * @throws {Error} If the canonical path is outside the project or Playwright suite.
     */
    static async runPlaywrightTest({absolutePath}) {
        const
            safePath  = await ensureSandboxed(absolutePath),
            suiteRoot = await fs.realpath(path.resolve(process.cwd(), 'test/playwright')),
            relative  = path.relative(suiteRoot, safePath);

        // `safePath` and `suiteRoot` are both canonical. Compare on a segment boundary so a sibling
        // such as `/atest/playwright/` cannot impersonate the suite, and keep the suite root itself
        // excluded because it is a directory rather than a spec.
        if (relative === '' || path.isAbsolute(relative) || relative.split(path.sep)[0] === '..') {
            throw new Error('403 Forbidden: Can only execute Playwright specs within the test/playwright/ directory.');
        }

        try {
            // Run exactly that file natively using the npm script mapping or direct npx command
            const { stdout, stderr } = await execFileAsync('npx', ['playwright', 'test', safePath]);
            return `Test Passed:\n${stdout}`;
        } catch (error) {
            return `Test Failed:\n${error.stdout}\n${error.stderr || error.message}`;
        }
    }
}

export default FileSystemService;
