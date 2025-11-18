import {execSync}      from 'child_process';
import {fileURLToPath} from 'url';
import fs              from 'fs/promises';
import os              from 'os';
import path            from 'path';
import * as terser     from 'terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const neoPath   = path.resolve(__dirname, '../');

const languages     = ['bash', 'css', 'javascript', 'json', 'scss', 'xml'];
const outputDir     = path.resolve(neoPath, 'dist/highlight');
const outputFile    = path.join(outputDir,  'highlight.custom.js');
const minOutputFile = path.join(outputDir,  'highlight.custom.min.js');
const tempDir       = path.resolve(neoPath, 'tmp/highlightjs');

const gitCmd  = os.platform().startsWith('win') ? 'git.exe'  : 'git';
const nodeCmd = os.platform().startsWith('win') ? 'node.exe' : 'node';
const npmCmd  = os.platform().startsWith('win') ? 'npm.cmd'  : 'npm';

async function main() {
    console.log('Building custom highlight.js bundle...');

    try {
        // 1. Clean up the temporary directory
        console.log(`Cleaning up ${tempDir}`);
        await fs.rm(tempDir, { recursive: true, force: true });
        await fs.mkdir(tempDir, { recursive: true });

        // 2. Clone the highlight.js repository
        console.log(`Cloning highlight.js into ${tempDir}`);
        const cloneCommand = `${gitCmd} clone --depth 1 https://github.com/highlightjs/highlight.js.git ${tempDir}`;
        execSync(cloneCommand, { stdio: 'inherit' });

        // 3. Install dependencies
        console.log(`Installing dependencies in ${tempDir}`);
        const installCommand = `${npmCmd} install`;
        execSync(installCommand, { cwd: tempDir, stdio: 'inherit' });

        // 4. Run the build script
        console.log('Running build script...');
        const buildCommand = [
            nodeCmd,
            'tools/build.js',
            '-n',
            ...languages
        ].join(' ');

        execSync(buildCommand, { cwd: tempDir, stdio: 'inherit' });

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

main();
