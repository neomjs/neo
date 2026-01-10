import fs          from 'fs-extra';
import path        from 'path';
import {exec}      from 'child_process';
import {promisify} from 'util';
import packageJson from '../package.json' with {type: 'json'};

const execAsync = promisify(exec);
const cwd       = process.cwd();

/**
 * @summary Automates the packaging and uploading of the AI Knowledge Base to GitHub Releases.
 *
 * This script is a critical part of the release pipeline. It ensures that the ChromaDB knowledge base
 * is properly optimized (defragmented), packaged (zipped), and attached to the current GitHub release.
 *
 * Key Steps:
 * 1.  **Defragmentation**: Triggers `npm run ai:defrag-kb` to ensure the uploaded artifact is compact.
 * 2.  **Verification**: Checks that the corresponding GitHub release tag exists.
 * 3.  **Packaging**: Compresses the `chroma-neo-knowledge-base` directory.
 * 4.  **Upload**: Uses the GitHub CLI (`gh`) to upload the zip file to the release assets.
 * 5.  **Cleanup**: Removes the temporary zip file to keep the workspace clean.
 *
 * @module buildScripts/uploadKnowledgeBase
 * @see buildScripts/defragChromaDB.mjs
 * @see buildScripts/publishRelease.mjs
 */

/**
 * Executes the knowledge base upload workflow.
 *
 * This function handles the entire process from optimization to upload. It includes robustness checks
 * to ensure that the database exists and that the release tag is valid before proceeding.
 * It uses a `try...finally` block to guarantee that the large temporary zip file is deleted
 * even if the upload fails.
 *
 * @async
 * @returns {Promise<void>}
 * @keywords knowledge base, release, github, upload, automation, chromadb, deployment
 */
async function uploadKnowledgeBase() {
    const {version} = packageJson;
    const tagName   = version;
    const sourceDir = 'chroma-neo-knowledge-base';
    const zipName   = 'chroma-neo-knowledge-base.zip';
    const zipPath   = path.resolve(cwd, zipName);
    let exitCode    = 0;

    // 1. Check if DB exists
    if (!await fs.pathExists(sourceDir)) {
        console.error(`❌ Error: ${sourceDir} not found. Run 'npm run ai:sync-kb' first.`);
        process.exit(1);
    }

    // 2. Defragment Database (Ensure clean artifact)
    // We enforce defragmentation before upload to prevent distributing bloated, fragmented index files
    // to users. This keeps the download size manageable and the database performant.
    console.log(`🧹 Running Defragmentation (npm run ai:defrag-kb)...`);
    try {
        const { stdout } = await execAsync('npm run ai:defrag-kb');
        console.log(stdout);
    } catch (e) {
        console.error(`❌ Defragmentation failed: ${e.message}`);
        console.error('Ensure the AI server is running (npm run ai:server) if required by the defrag script.');
        process.exit(1);
    }

    // 3. Check if release exists (Fail fast)
    // We verify the release tag exists on GitHub before attempting strictly local operations (zipping),
    // to save time and resources in case of a configuration error.
    console.log(`🔍 Checking for GitHub Release ${tagName}...`);
    try {
        await execAsync(`gh release view ${tagName}`);
    } catch {
        console.error(`❌ Release ${tagName} not found on GitHub.`);
        console.log('Ensure you have pushed the tag or created the draft release.');
        process.exit(1);
    }

    // 4. Zip and Upload (Try/Finally for cleanup)
    try {
        // Zip
        console.log(`📦 Zipping ${sourceDir}...`);
        await execAsync(`zip -r -q "${zipName}" "${sourceDir}"`);
        const stats = await fs.stat(zipPath);
        console.log(`✅ Zipped: ${zipName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

        // Upload
        console.log(`⬆️  Uploading to GitHub Release ${tagName}...`);
        await execAsync(`gh release upload ${tagName} "${zipName}" --clobber`);
        console.log(`✅ Upload complete!`);
        console.log(`   https://github.com/neomjs/neo/releases/download/${tagName}/${zipName}`);

    } catch (e) {
        console.error('❌ Operation failed:', e.message);
        exitCode = 1;
    } finally {
        // 5. Cleanup
        // Always remove the temporary zip file, regardless of success or failure.
        if (await fs.pathExists(zipPath)) {
            await fs.remove(zipPath);
            console.log(`🧹 Cleaned up ${zipName}`);
        }
    }

    if (exitCode !== 0) {
        process.exit(exitCode);
    }
}

uploadKnowledgeBase();
