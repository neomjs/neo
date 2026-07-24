import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import util from 'util';

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
    let   current = targetPath;

    for (;;) {
        try {
            return path.join(await fs.realpath(current), ...tail.slice().reverse())
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;

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
    const
        rootPath   = await fs.realpath(path.resolve(process.cwd())),
        targetPath = await canonicalize(path.resolve(absolutePath)),
        // Compared on a path boundary, not a string prefix: `startsWith` admitted any sibling
        // directory whose name merely begins with the root's, so `<root>-evil/x` passed a jail meant
        // to exclude it. `path.relative` answers containment directly — an escaping path is either
        // absolute or starts with a `..` segment.
        relative   = path.relative(rootPath, targetPath);

    if (relative !== '' && (path.isAbsolute(relative) || relative.split(path.sep)[0] === '..')) {
        throw new Error(`403 Forbidden: Path traversal detected. Operation jailed to ${rootPath}`);
    }

    return targetPath;
}

class FileSystemService {
    static async healthcheck() {
        return { status: 'healthy' };
    }

    static async readFile({absolutePath}) {
        const safePath = await ensureSandboxed(absolutePath);
        const buffer = await fs.readFile(safePath);
        return { content: buffer.toString('utf-8') };
    }

    static async writeFile({absolutePath, content}) {
        const safePath = await ensureSandboxed(absolutePath);
        await fs.writeFile(safePath, content, 'utf-8');
        return 'success';
    }

    static async listDirectory({absolutePath}) {
        const safePath = await ensureSandboxed(absolutePath);
        const entries = await fs.readdir(safePath, { withFileTypes: true });

        return entries.map(entry => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile()
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

    static async runPlaywrightTest({absolutePath}) {
        const safePath = await ensureSandboxed(absolutePath);

        // Strict guard: ensure it's actually a test file in the playwright directory
        if (!safePath.includes('test/playwright/')) {
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
