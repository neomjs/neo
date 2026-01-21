import fs          from 'fs-extra';
import path        from 'path';
import {exec}      from 'child_process';
import {promisify} from 'util';
import packageJson from '../../package.json' with {type: 'json'};

const execAsync = promisify(exec);
const cwd       = process.cwd();

async function downloadKnowledgeBase() {
    const version   = packageJson.version;
    const zipName   = 'chroma-neo-knowledge-base.zip';
    const url       = `https://github.com/neomjs/neo/releases/download/${version}/${zipName}`;
    const targetDir = path.resolve(cwd);
    const zipPath   = path.resolve(targetDir, zipName);
    const kbDir     = path.resolve(targetDir, 'chroma-neo-knowledge-base');

    console.log(`Checking for existing Knowledge Base...`);
    if (await fs.pathExists(kbDir)) {
        // Simple check: exists.
        // Future improvement: Check version/hash?
        console.log(`✅ Knowledge Base found at ${kbDir}`);
        console.log(`   Skipping download. Run 'npm run ai:sync-kb' to update incrementally.`);
        return;
    }

    console.log(`⬇️  Downloading Knowledge Base artifact for v${version}...`);
    console.log(`   URL: ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) {
                // This is expected for Dev versions or before the artifact is uploaded.
                console.warn(`⚠️  Artifact not found (404). This might be a development version.`);
                console.log(`   You can build the Knowledge Base locally with 'npm run ai:sync-kb' (takes ~25 mins).`);
                return; // Soft fail (don't break npm install)
            }
            throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        await fs.writeFile(zipPath, Buffer.from(arrayBuffer));
        console.log(`✅ Download complete (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB).`);

        console.log(`📦 Unzipping...`);
        try {
            // Try native unzip command (macOS/Linux)
            await execAsync(`unzip -o "${zipPath}" -d "${targetDir}"`);
        } catch (e) {
            // Fallback for Windows PowerShell
            if (process.platform === 'win32') {
                 await execAsync(`powershell -command "Expand-Archive -Force '${zipPath}' '${targetDir}'"`);
            } else {
                throw new Error('Failed to unzip. Please install "unzip" or manually unzip the file.');
            }
        }

        console.log(`✅ Unzip complete.`);

        // Cleanup
        await fs.remove(zipPath);
        console.log(`🧹 Cleaned up zip file.`);

        console.log(`
🎉 Knowledge Base is ready!`);

    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        // Do not exit(1) to avoid breaking npm install for standard users if fetch fails
    }
}

downloadKnowledgeBase();
