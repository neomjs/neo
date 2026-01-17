import chalk           from 'chalk';
import fs              from 'fs-extra';
import path            from 'path';
import {Command}       from 'commander/esm.mjs';
import {sanitizeInput} from '../../util/Sanitizer.mjs';

const
    __dirname   = path.resolve(),
    cwd         = process.cwd(),
    requireJson = path => JSON.parse(fs.readFileSync((path))),
    packageJson = requireJson(path.join(__dirname, 'package.json')),
    program     = new Command(),
    programName = `${packageJson.name} copySeoFiles`,
    APP_DIR     = path.resolve(cwd, 'apps'),
    DIST_DIR    = path.resolve(cwd, 'dist'),
    SEO_FILES   = ['robots.txt', 'llms.txt', 'sitemap.xml'];

/**
 * Recursively finds application root directories by looking for index.html.
 * Excludes 'examples' directory.
 * @param {string} currentDir - The directory to start searching from.
 * @param {string} baseAppDir - The base 'apps' directory to calculate relative paths from.
 * @returns {Array<{appRootPath: string, appRelativePath: string}>} Array of objects with absolute and relative paths.
 */
function findAppRoots(currentDir, baseAppDir) {
    let appRoots  = [];
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
            // Check if current directory contains index.html
            if (fs.existsSync(path.join(fullPath, 'index.html'))) {
                const appRelativePath = path.relative(baseAppDir, fullPath);
                appRoots.push({ appRootPath: fullPath, appRelativePath: appRelativePath });
            }
            // Recurse into subdirectories
            appRoots = appRoots.concat(findAppRoots(fullPath, baseAppDir));
        }
    }
    return appRoots;
}

/**
 * Copies SEO files from an app root to its corresponding dist folders.
 * @param {string} appRootPath - Absolute path to the app's root directory.
 * @param {string} appRelativePath - Relative path of the app from the base 'apps' directory.
 * @param {string} env - The build environment ('all', 'dev', 'prod').
 */
function copySeoFilesForApp(appRootPath, appRelativePath, env) {
    console.log(chalk.blue(`Copying SEO files for app: ${appRelativePath}`));

    const targetEnvs = [];
    if (env === 'all' || env === 'dev')  {targetEnvs.push('development');}
    if (env === 'all' || env === 'esm')  {targetEnvs.push('esm');}
    if (env === 'all' || env === 'prod') {targetEnvs.push('production');}

    for (const targetEnv of targetEnvs) {
        const targetDistDir = path.join(DIST_DIR, targetEnv, 'apps', appRelativePath);
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
    .option('-e, --env <value>', '"all", "dev", "esm", "prod"', sanitizeInput)
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
const appData = findAppRoots(APP_DIR, APP_DIR); // Pass APP_DIR as baseAppDir
for (const app of appData) {
    copySeoFilesForApp(app.appRootPath, app.appRelativePath, env);
}
// --- End SEO file copying logic ---

process.exit(0);
