#!/usr/bin/env node

/**
 * Neo.mjs Dev Agent (MVP)
 *
 * This script acts as a "Headless Developer Agent".
 * It picks up a technical ticket (Issue), reads the requirements,
 * modifies the code using GenAI, and submits a Pull Request.
 *
 * Usage:
 * node ai/agents/dev.mjs --issue <number>
 */

import { Command }           from 'commander';
import fs                    from 'fs-extra';
import path                  from 'path';
import { fileURLToPath }     from 'url';
import yaml                  from 'js-yaml';
import dotenv                from 'dotenv';
import { exec }              from 'child_process';
import { promisify }         from 'util';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

import {
    GH_LocalFileService,
    GH_HealthService,
    KB_QueryService,
    KB_DatabaseService
} from '../services.mjs';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// --- Configuration ---
const MODEL_NAME = 'gemini-2.5-flash'; // Consistent with Memory Core config
const GENERATION_CONFIG = {
    temperature: 0.2, // Low temperature for code precision
    responseMimeType: "application/json",
    responseSchema: {
        type: SchemaType.ARRAY,
        items: {
            type: SchemaType.OBJECT,
            properties: {
                filePath: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING },
                summary: { type: SchemaType.STRING }
            },
            required: ["filePath", "content"]
        }
    }
};

const program = new Command();

program
    .name('dev-agent')
    .description('Autonomous Developer Agent -> Ticket to PR')
    .requiredOption('-i, --issue <number>', 'Issue Number to process')
    .option('-d, --dry-run', 'Simulate execution without pushing/PR')
    .parse(process.argv);

const options = program.opts();

// --- Helpers ---

async function runGit(command) {
    try {
        const { stdout } = await execAsync(command);
        return stdout.trim();
    } catch (error) {
        throw new Error(`Git command failed: ${command}\n${error.message}`);
    }
}

function parseIssueContent(rawContent) {
    const parts = rawContent.split('---');
    if (parts.length < 3) return { title: 'Unknown', body: rawContent };
    
    const frontmatter = parts[1];
    const body = parts.slice(2).join('---').trim();
    
    let title = 'Unknown';
    const titleMatch = frontmatter.match(/^title:\s*(.*)$/m);
    if (titleMatch) title = titleMatch[1].trim().replace(/^['"](.*)['"]$/, '$1');
    
    return { title, body };
}

async function parseYamlBody(body) {
    try {
        // Try to extract content inside ```yaml ... ``` blocks first
        const yamlMatch = body.match(/```yaml([\s\S]*?)```/);
        if (yamlMatch) {
            return yaml.load(yamlMatch[1]);
        }

        // Fallback: Remove all code fences and try to parse the whole string
        const cleanBody = body.replace(/```yaml/g, '').replace(/```/g, '');
        return yaml.load(cleanBody);
    } catch (e) {
        throw new Error('Failed to parse Issue Body as YAML. Is it a valid Agent Protocol ticket?');
    }
}

// --- AI Logic ---

async function generateCode(rawIssueContent, task, contextFiles, kbContext) {
    console.log('🧠 Dev Agent is thinking...');
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: GENERATION_CONFIG
    });

    const prompt = `
You are an expert Senior Developer for the Neo.mjs framework.
Your task is to implement the requirements defined in a technical ticket.

### TICKET (ISSUE)
${rawIssueContent}

### GOAL
${task.goal}

### REQUIREMENTS
${task.requirements.map(r => `- ${r}`).join('\n')}

### KNOWLEDGE BASE CONTEXT
${kbContext}

### SOURCE FILES
${contextFiles.map(f => `
---
START FILE: ${f.path} ---
${f.content}
--- END FILE: ${f.path} ---
`).join('\n')}

### INSTRUCTIONS
1. Analyze the requirements and the provided source files.
2. Modify the files (or create new ones) to meet the goal.
3. Ensure the code follows Neo.mjs standards (class-based, config system).
4. Return a JSON array of file objects. Each object must have:
   - "filePath": The relative path of the file.
   - "content": The FULL new content of the file.
   - "summary": A one-sentence summary of changes.

DO NOT output Markdown. Output ONLY the JSON array.
`;

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
}

// --- Main Workflow ---

async function run() {
    try {
        console.log('🚀 Dev Agent Starting...');

        // 1. Health Checks
        const ghHealth = await GH_HealthService.healthcheck({});
        if (!ghHealth.githubCli.authenticated) throw new Error('GitHub Auth failed.');
        if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set.');
        await KB_DatabaseService.ready();

        // 2. Fetch Issue (Local)
        const issueId = String(options.issue);
        console.log(`📥 Fetching Issue #${issueId}...`);
        
        const issueFile = await GH_LocalFileService.getIssueById(issueId);
        if (issueFile.error) throw new Error(`Issue #${issueId} not found locally.`);

        const { title, body } = parseIssueContent(issueFile.content);
        const task = await parseYamlBody(body);

        console.log(`   -> Found: "${title}"`);
        console.log(`   -> Role: ${task.role}, Type: ${task.type}`);

        if (task.role !== 'dev') {
            console.warn('⚠️  This ticket is not assigned to role: dev. Exiting.');
            process.exit(0);
        }

        // 3. Prepare Git Branch
        const branchName = `feat/issue-${issueId}`;
        if (!options.dryRun) {
            console.log(`🌿 Checking out branch: ${branchName}`);
            // Ensure we are on main/master first and pull? For now, assume user base.
            // Try to create branch, if exists, checkout.
            try {
                await runGit(`git checkout -b ${branchName}`);
            } catch (e) {
                await runGit(`git checkout ${branchName}`);
            }
        }

        // 4. Gather Context (Files + KB)
        const contextFiles = [];
        if (task.context?.files) {
            for (const filePath of task.context.files) {
                if (await fs.pathExists(filePath)) {
                    const content = await fs.readFile(filePath, 'utf-8');
                    contextFiles.push({ path: filePath, content });
                } else {
                    console.warn(`⚠️  Context file not found: ${filePath}`);
                }
            }
        }

        let kbContext = "";
        if (task.context?.knowledge_base_refs) {
             // Simple KB lookup based on refs (filenames)
             // For MVP, we skip strict ref lookup and just query the goal
             const query = await KB_QueryService.queryDocuments({
                 query: task.goal,
                 limit: 2
             });
             kbContext = query.results.map(r => r.content).join('\n\n');
        }

        // 5. Generate Code
        const changes = await generateCode(issueFile.content, task, contextFiles, kbContext);

        // 6. Apply Changes
        for (const change of changes) {
            console.log(`✍️  Writing: ${change.filePath}`);
            if (options.dryRun) {
                console.log(`[Dry Run] Content Preview:\n${change.content.substring(0, 200)}...`);
            } else {
                await fs.ensureDir(path.dirname(change.filePath));
                await fs.writeFile(change.filePath, change.content);
            }
        }

        // 7. Commit, Push, PR
        if (!options.dryRun) {
            console.log('📦 Committing changes...');
            await runGit('git add .');
            await runGit(`git commit -m "feat: ${title}"`);
            
            console.log('⬆️  Pushing branch...');
            // Construct authenticated URL for push
            // Format: https://x-access-token:<TOKEN>@github.com/owner/repo.git
            let remoteUrl = await runGit('git remote get-url origin');
            
            // Strip existing auth if present (e.g. https://user:pass@...) and ensure .git suffix
            remoteUrl = remoteUrl.replace(/^https?:\/\/([^@]*@)?/, 'https://');
            
            const authenticatedUrl = remoteUrl.replace('https://', `https://x-access-token:${process.env.GH_TOKEN}@`);
            
            await runGit(`git push -u "${authenticatedUrl}" ${branchName}`);

            console.log('🔀 Creating Pull Request...');
            const prBody = `Closes #${issueId}\n\n**AI Generated PR**\n${changes.map(c => `- ${c.filePath}: ${c.summary}`).join('\n')}`;
            // Create PR
            const prUrl = await runGit(`gh pr create --title "feat: ${title}" --body "${prBody}" --head ${branchName}`);
            console.log(`✅ PR Created: ${prUrl}`);

            // 8. Update Issue
            console.log('🏷️  Updating Issue Label...');
            await runGit(`gh issue edit ${issueId} --add-label "agent-task:review" --remove-label "agent-task:pending"`);
            await runGit(`gh issue comment ${issueId} --body "PR Created: ${prUrl}"`);
        } else {
            console.log('[Dry Run] Skipping Git/PR steps.');
        }

        console.log('🎉 Dev Agent Finished.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Dev Agent Failed:', error.message);
        process.exit(1);
    }
}

run();
