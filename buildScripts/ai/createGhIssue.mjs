import { exec } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const filePath = process.argv[2];

if (!filePath) {
    console.error('Please provide a path to the markdown ticket file.');
    process.exit(1);
}

const absolutePath = resolve(filePath);
const content = readFileSync(absolutePath, 'utf-8');

const titleMatch = content.match(/^#\s+(.*)/);
const title = titleMatch ? titleMatch[1] : 'New Issue';

const body = content;
const tempBodyPath = resolve('.gh-issue-body.md');
writeFileSync(tempBodyPath, body);

const command = `gh issue create --title "${title}" --body-file "${tempBodyPath}"`;

exec(command, (error, stdout, stderr) => {
    unlinkSync(tempBodyPath); 

    if (error) {
        console.error(`Error creating GitHub issue: ${stderr}`);
        process.exit(1);
    }

    const issueUrl = stdout.trim();
    const issueId = issueUrl.split('/').pop();

    const newContent = content.replace(
        /GH ticket id: #\d+/,
        `GH ticket id: #${issueId}\nGH ticket url: ${issueUrl}`
    );

    writeFileSync(absolutePath, newContent);

    console.log(`Successfully created GitHub issue: ${issueUrl}`);
    console.log(`Updated markdown ticket with issue URL.`);
});
