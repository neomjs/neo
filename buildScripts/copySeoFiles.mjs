import chalk     from 'chalk';
import fs        from 'fs-extra';
import path      from 'path';
import {Command} from 'commander/esm.mjs';

const
    __dirname   = path.resolve(),
    cwd         = process.cwd(),
    requireJson = path => JSON.parse(fs.readFileSync((path))),
    packageJson = requireJson(path.join(__dirname, 'package.json')),
    program     = new Command(),
    programName = `${packageJson.name} copySeoFiles`;

const APP_DIR   = path.resolve(cwd, 'apps');
const DIST_DIR  = path.resolve(cwd, 'dist');
const SEO_FILES = ['robots.txt', 'llm.txt', 'sitemap.xml'];

/**
 * Recursively finds application root directories by looking for index.html.
 * Excludes 'examples' directory.
 * @param {string} currentDir
 * @returns {string[]} Array of absolute paths to app roots.
 */
function findAppRoots(currentDir) {
    let appRoots  = [];
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
            // Check if current directory contains index.html
            if (fs.existsSync(path.join(fullPath, 'index.html'))) {
                appRoots.push(fullPath);
            }
            // Recurse into subdirectories
            appRoots = appRoots.concat(findAppRoots(fullPath));
        }
    }
    return appRoots;
}

/**
 * Copies SEO files from an app root to its corresponding dist folders.
 * @param {string} appRootPath - Absolute path to the app's root directory.
 * @param {string} env - The build environment ('all', 'dev', 'prod').
 */
function copySeoFilesForApp(appRootPath, env) {
    const appName = path.basename(appRootPath);
    console.log(chalk.blue(`Copying SEO files for app: ${appName}`));

    const targetEnvs = [];
    if (env === 'all' || env === 'dev') {
        targetEnvs.push('development');
    }
    if (env === 'all' || env === 'prod') {
        targetEnvs.push('production');
    }

    for (const targetEnv of targetEnvs) {
        const targetDistDir = path.join(DIST_DIR, targetEnv, appName);
        if (!fs.existsSync(targetDistDir)) {
            console.warn(chalk.yellow(`  Warning: Target directory ${targetDistDir} does not exist. Skipping SEO file copy.`));
            continue;
        }

        for (const seoFile of SEO_FILES) {
            const sourceFilePath = path.join(appRootPath, seoFile);
            const targetFilePath = path.join(targetDistDir, seoFile);

            if (fs.existsSync(sourceFilePath)) {
                fs.copySync(sourceFilePath, targetFilePath);
                console.log(chalk.gray(`    Copied ${seoFile} to ${targetDistDir}`));
            }
        }
    }
}

program
    .name(programName)
    .version(packageJson.version)
    .option('-e, --env <value>', '"all", "dev", "esm", "prod"')
    .allowUnknownOption()
    .on('--help', () => {
        console.log('\nIn case you have any issues, please create a ticket here:');
        console.log(chalk.cyan(packageJson.bugs.url));
    })
    .parse(process.argv);

const programOpts = program.opts();
const env         = programOpts.env || 'all';

console.log(chalk.green(programName));

// --- Start SEO file copying logic ---
console.log(chalk.blue('Copying SEO files for applications...'));
const appRoots = findAppRoots(APP_DIR);
for (const appRoot of appRoots) {
    copySeoFilesForApp(appRoot, env);
}
// --- End SEO file copying logic ---

process.exit(0);
