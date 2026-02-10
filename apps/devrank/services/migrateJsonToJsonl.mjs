import fs from 'fs/promises';
import path from 'path';
import Neo from '../../../src/Neo.mjs'; // Ensure Neo is globally available
import config from './config.mjs';

/**
 * Migration script to convert users.json to users.jsonl
 */
async function run() {
    const jsonPath = config.paths.users.replace('.jsonl', '.json');
    const jsonlPath = config.paths.users;

    console.log(`[Migration] Checking for legacy file: ${jsonPath}`);

    try {
        await fs.access(jsonPath);
    } catch {
        console.log('[Migration] No legacy users.json found. Skipping.');
        return;
    }

    console.log('[Migration] Reading users.json...');
    const content = await fs.readFile(jsonPath, 'utf-8');
    const data = JSON.parse(content);

    if (!Array.isArray(data)) {
        console.error('[Migration] users.json is not an array. Aborting.');
        return;
    }

    console.log(`[Migration] Converting ${data.length} records to JSONL...`);
    const jsonlContent = data.map(item => JSON.stringify(item)).join('\n');

    console.log(`[Migration] Writing to ${jsonlPath}...`);
    await fs.writeFile(jsonlPath, jsonlContent, 'utf-8');

    console.log('[Migration] Verifying...');
    const verifyContent = await fs.readFile(jsonlPath, 'utf-8');
    const verifyLines = verifyContent.trim().split('\n');
    
    if (verifyLines.length !== data.length) {
        console.error(`[Migration] Mismatch! Original: ${data.length}, JSONL: ${verifyLines.length}. Keeping original file.`);
        return;
    }

    console.log('[Migration] Verification successful. Deleting legacy file...');
    await fs.unlink(jsonPath);

    console.log('[Migration] Done.');
}

run().catch(console.error);
