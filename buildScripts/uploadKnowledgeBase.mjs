import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import packageJson from '../package.json' with { type: 'json' };

const execAsync = promisify(exec);
const cwd = process.cwd();

async function uploadKnowledgeBase() {
    const version = packageJson.version;
    const tagName = version;
    const sourceDir = 'chroma-neo-knowledge-base';
    const zipName = 'chroma-neo-knowledge-base.zip';
    const zipPath = path.resolve(cwd, zipName);

    // 1. Check if DB exists
    if (!await fs.pathExists(sourceDir)) {
        console.error(`❌ Error: ${sourceDir} not found. Run 'npm run ai:sync-kb' first.`);
        process.exit(1);
    }

    // 2. Zip the folder
    console.log(`📦 Zipping ${sourceDir}...`);
    try {
        // -r: recursive
        // -q: quiet
        await execAsync(`zip -r -q "${zipName}" "${sourceDir}"`);
        const stats = await fs.stat(zipPath);
        console.log(`✅ Zipped: ${zipName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (e) {
        console.error('❌ Failed to zip:', e.message);
        console.log('Ensure "zip" command is available in your PATH.');
        process.exit(1);
    }

    // 3. Upload to GitHub
    console.log(`⬆️  Uploading to GitHub Release ${tagName}...`);
    try {
        // Check if release exists
        try {
            await execAsync(`gh release view ${tagName}`);
        } catch {
            console.error(`❌ Release ${tagName} not found on GitHub.`);
            console.log('Ensure you have pushed the tag or created the draft release.');
            process.exit(1);
        }

        // Upload
        // --clobber: overwrite if exists
        await execAsync(`gh release upload ${tagName} "${zipName}" --clobber`);
        console.log(`✅ Upload complete!`);
        console.log(`   https://github.com/neomjs/neo/releases/download/${tagName}/${zipName}`);

    } catch (e) {
        console.error('❌ Upload failed:', e.message);
        console.log('Ensure "gh" CLI is installed and authenticated.');
        process.exit(1);
    } finally {
        // 4. Cleanup
        if (await fs.pathExists(zipPath)) {
            await fs.remove(zipPath);
            console.log(`🧹 Cleaned up ${zipName}`);
        }
    }
}

uploadKnowledgeBase();
