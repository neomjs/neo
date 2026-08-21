import {execFileSync}  from 'child_process';
import {fileURLToPath} from 'url';
import fs              from 'fs/promises';
import os              from 'os';
import path            from 'path';
import {Command}       from 'commander';
import * as terser     from 'terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const neoPath   = path.resolve(__dirname, '../../');

const languages     = ['bash', 'css', 'javascript', 'json', 'markdown', 'plaintext', 'scss', 'xml', 'yaml'];
const outputDir     = path.resolve(neoPath, 'dist/highlight');
const outputFile    = path.join(outputDir,  'highlight.custom.js');
const minOutputFile = path.join(outputDir,  'highlight.custom.min.js');
const tempDir       = path.resolve(neoPath, 'tmp/highlightjs');

const gitCmd  = os.platform().startsWith('win') ? 'git.exe'  : 'git';
const nodeCmd = os.platform().startsWith('win') ? 'node.exe' : 'node';
const npmCmd  = os.platform().startsWith('win') ? 'npm.cmd'  : 'npm';

const program = new Command();

/** The upstream repository this bundle is built from. */
export const HIGHLIGHT_JS_REPOSITORY = 'https://github.com/highlightjs/highlight.js.git';

/**
 * Windows shim extensions. A `.cmd` / `.bat` file is a script interpreted by the command processor,
 * not an executable image, so it has no entry point for `execFile` to launch.
 * @type {Set<String>}
 */
const SHIM_EXTENSIONS = new Set(['.cmd', '.bat']);

/**
 * @summary Whether a command must be dispatched through a shell to be launchable at all.
 *
 * Node cannot start a `.cmd` or `.bat` with `execFile`/`spawn` unless a shell is requested — they are
 * scripts for the command processor rather than executable images. On this build only `npm` selects a
 * shim (`npm.cmd`); `git.exe` and `node.exe` are real executables and stay shell-free.
 *
 * Encoded as a rule over the command's extension rather than as a check for "npm", so a future
 * Windows shim gets the right dispatch without anyone remembering this constraint.
 *
 * A shell here is safe because the arguments are literals — the rule this module enforces is that no
 * INTERPOLATED value reaches a shell, not that no shell exists.
 * @param {String} command Executable name as selected for the current platform.
 * @returns {Boolean}
 */
export function requiresShell(command) {
    const extension = command.slice(command.lastIndexOf('.')).toLowerCase();

    return SHIM_EXTENSIONS.has(extension)
}

/**
 * @summary Builds the git-clone argument vector, so the target path is one argument by construction.
 *
 * Exported for coverage: the property that matters is that `targetDir` arrives as a SINGLE argv
 * entry, and that is only assertable on the vector. Asserting a quoted command string instead would
 * pass for any consistent-but-wrong quoting, which is why the remedy here is argv, not escaping.
 *
 * The previous form interpolated `targetDir` into a shell string. A checkout path containing a space
 * — an ordinary macOS directory name — was split by the shell into three arguments, so this is a
 * build-breaking defect before it is a security one.
 * @param {String} targetDir Absolute clone destination.
 * @returns {String[]} Arguments for `git`, excluding the executable itself.
 */
export function buildCloneArgs(targetDir) {
    return ['clone', '--depth', '1', HIGHLIGHT_JS_REPOSITORY, targetDir]
}

async function main() {
    program
        .option('-f, --force', 'Force regeneration of the highlight.js bundle')
        .parse(process.argv);

    const options = program.opts();

    if (!options.force) {
        try {
            await fs.access(outputFile);
            await fs.access(minOutputFile);
            console.log('highlight.js bundle already exists. Skipping build. Use -f to force regeneration.');
            return;
        } catch (e) {
            // Files don't exist, proceed with build
        }
    }

    console.log('Building custom highlight.js bundle...');

    try {
        // 1. Clean up the temporary directory
        console.log(`Cleaning up ${tempDir}`);
        await fs.rm(tempDir, { recursive: true, force: true });
        await fs.mkdir(tempDir, { recursive: true });

        // 2. Clone the highlight.js repository
        console.log(`Cloning highlight.js into ${tempDir}`);
        // argv, not a shell string: no quoting question, no metacharacter question. The command needs
        // no shell feature — no pipe, redirection or glob — so reaching for one only added a parser.
        execFileSync(gitCmd, buildCloneArgs(tempDir), { shell: requiresShell(gitCmd), stdio: 'inherit' });

        // 3. Install dependencies
        console.log(`Installing dependencies in ${tempDir}`);
        execFileSync(npmCmd, ['install'], { cwd: tempDir, shell: requiresShell(npmCmd), stdio: 'inherit' });

        // 4. Run the build script
        console.log('Running build script...');
        execFileSync(nodeCmd, ['tools/build.js', '-n', ...languages], { cwd: tempDir, shell: requiresShell(nodeCmd), stdio: 'inherit' });

        // 5. Copy and minify the generated bundle
        const generatedFile = path.join(tempDir, 'build/highlight.js');
        console.log(`Copying ${generatedFile} to ${outputFile}`);
        let bundleContent = await fs.readFile(generatedFile, 'utf-8');

        // Convert to ESM
        bundleContent += '\nexport default hljs;';

        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(outputFile, bundleContent);

        console.log(`Minifying ${outputFile}`);
        const minifiedContent = await terser.minify(bundleContent);
        await fs.writeFile(minOutputFile, minifiedContent.code);


        // 6. Clean up the temporary directory
        console.log(`Cleaning up ${tempDir}`);
        await fs.rm(tempDir, { recursive: true, force: true });

        console.log(`Custom highlight.js bundle created at: ${outputFile}`);
        console.log(`Minified highlight.js bundle created at: ${minOutputFile}`);
    } catch (error) {
        console.error(`Error building highlight.js bundle: ${error}`);
        // In case of error, leave the temporary directory for inspection
    }
}

// Run only when executed directly, matching the guard `check-derived-domain.mjs` and
// `check-fixed-sleeps.mjs` already use. Without it, importing this module to test the argv builder
// would clone a repository and run a build as a side effect of the import.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    main()
}
