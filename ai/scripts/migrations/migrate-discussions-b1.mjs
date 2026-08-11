/**
 * @plane in-plane
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const discussionsDir = path.join(projectRoot, 'resources/content/discussions');

async function migrate() {
    console.log(`Starting discussion migration in ${discussionsDir}...`);

    try {
        const entries = await fs.readdir(discussionsDir, { withFileTypes: true });

        let movedCount = 0;
        let dirsRemoved = 0;

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const dirPath = path.join(discussionsDir, entry.name);
                console.log(`Processing directory: ${entry.name}`);

                const subEntries = await fs.readdir(dirPath, { withFileTypes: true });
                let allFilesMoved = true;

                for (const subEntry of subEntries) {
                    if (subEntry.isFile() && subEntry.name.endsWith('.md')) {
                        const oldPath = path.join(dirPath, subEntry.name);
                        const newPath = path.join(discussionsDir, subEntry.name);

                        try {
                            await fs.rename(oldPath, newPath);
                            console.log(`  Moved: ${subEntry.name}`);
                            movedCount++;
                        } catch (e) {
                            console.error(`  Failed to move ${oldPath}:`, e);
                            allFilesMoved = false;
                        }
                    } else if (subEntry.isDirectory()) {
                         console.log(`  Found unexpected nested directory: ${subEntry.name}`);
                         allFilesMoved = false;
                    }
                }

                if (allFilesMoved) {
                    try {
                        await fs.rmdir(dirPath);
                        console.log(`  Removed empty directory: ${entry.name}`);
                        dirsRemoved++;
                    } catch (e) {
                        console.error(`  Failed to remove directory ${dirPath}:`, e);
                    }
                }
            }
        }

        console.log(`Migration complete. Moved ${movedCount} files and removed ${dirsRemoved} directories.`);
    } catch (e) {
        console.error('Error during migration:', e);
    }
}

migrate().catch(console.error);
