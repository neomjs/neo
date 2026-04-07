import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

/**
 * Validates that a requested path does not traverse outside the project root.
 * @param {String} absolutePath
 * @returns {String} The resolved path if safe.
 * @throws {Error} If path traversal occurs.
 */
function ensureSandboxed(absolutePath) {
    const rootPath = path.resolve(process.cwd());
    const targetPath = path.resolve(absolutePath);

    if (!targetPath.startsWith(rootPath)) {
        throw new Error(`403 Forbidden: Path traversal detected. Operation jailed to ${rootPath}`);
    }

    return targetPath;
}

class FileSystemService {
    static async healthcheck() {
        return { status: 'OK' };
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
            await execAsync(`node --check ${safePath}`);
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
            const { stdout, stderr } = await execAsync(`npx playwright test ${safePath}`);
            return `Test Passed:\n${stdout}`;
        } catch (error) {
            return `Test Failed:\n${error.stdout}\n${error.stderr || error.message}`;
        }
    }
}

export default FileSystemService;
