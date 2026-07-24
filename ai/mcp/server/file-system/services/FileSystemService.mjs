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
 * Validates that a requested path does not traverse outside the project root.
 *
 * **Containment only — this is not a shell-safety guard.** It answers "is this path inside the
 * root", and a path can be perfectly inside the root while containing shell metacharacters. Callers
 * must never treat its return value as safe to interpolate into a command string; use argv.
 *
 * @param {String} absolutePath
 * @returns {String} The resolved path if safe.
 * @throws {Error} If path traversal occurs.
 */
function ensureSandboxed(absolutePath) {
    const rootPath   = path.resolve(process.cwd());
    const targetPath = path.resolve(absolutePath);

    // Compared on a path boundary, not a string prefix: `startsWith` admitted any sibling directory
    // whose name merely begins with the root's, so `<root>-evil/x` passed a jail meant to exclude it.
    // `path.relative` answers the containment question directly — an escaping path is either
    // absolute or starts with a `..` segment.
    const relative = path.relative(rootPath, targetPath);

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
        const safePath = ensureSandboxed(absolutePath);
        const buffer = await fs.readFile(safePath);
        return { content: buffer.toString('utf-8') };
    }

    static async writeFile({absolutePath, content}) {
        const safePath = ensureSandboxed(absolutePath);
        await fs.writeFile(safePath, content, 'utf-8');
        return 'success';
    }

    static async listDirectory({absolutePath}) {
        const safePath = ensureSandboxed(absolutePath);
        const entries = await fs.readdir(safePath, { withFileTypes: true });

        return entries.map(entry => ({
            name: entry.name,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile()
        }));
    }

    static async checkSyntax({absolutePath}) {
        const safePath = ensureSandboxed(absolutePath);

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
        const safePath = ensureSandboxed(absolutePath);

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
