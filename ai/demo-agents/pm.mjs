#!/usr/bin/env node

/**
 * Neo.mjs PM Agent (MVP)
 *
 * This script acts as a "Headless Project Manager Agent".
 * It reads a GitHub Epic, breaks it down into technical tasks (using the Protocol),
 * and creates the corresponding child issues.
 *
 * Usage:
 * node ai/agents/pm.mjs --epic <issue_number>
 */

import {Command}       from 'commander';
import yaml            from 'js-yaml';
import dotenv          from 'dotenv';
import path            from 'path';
import {fileURLToPath} from 'url';
import {sanitizeInput} from '../../buildScripts/util/Sanitizer.mjs';
import {
    GH_IssueService,
    GH_HealthService,
    GH_LocalFileService,
    KB_QueryService,
    KB_DatabaseService
} from '../services.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const program = new Command();

program
    .name('pm-agent')
    .description('Autonomous PM Agent for breaking down Epics into Tickets')
    .requiredOption('-e, --epic <number>', 'Epic Issue Number to process', sanitizeInput)
    .option('-d, --dry-run', 'Simulate execution without creating issues')
    .parse(process.argv);

const options = program.opts();

/**
 * Simulates the LLM "Reasoning" step.
 */
async function generateBreakdown(epic, contextDocs) {
    console.log('🤖 Thinking... (Simulating LLM Breakdown)');

    const contextRefs = contextDocs.map(doc => doc.source).filter(Boolean);

    const task1 = {
        version: 1.0,
        type: 'implementation',
        role: 'dev',
        goal: `Implement the core logic for "${epic.title}"`,
        context: {
            epic_issue: epic.number,
            files: ["src/Main.mjs"],
            knowledge_base_refs: contextRefs.length > 0 ? contextRefs : ["N/A"]
        },
        requirements: [
            "Must follow Neo.mjs class config standards",
            "Must include unit tests"
        ]
    };

    const task2 = {
        version: 1.0,
        type: 'implementation',
        role: 'dev',
        goal: `Update documentation for "${epic.title}"`,
        context: {
            epic_issue: epic.number
        },
        requirements: [
            "Update Markdown guides",
            "Add JSDoc to new classes"
        ]
    };

    return [
        { title: `Task: Implement Core Logic for "${epic.title}"`, body: yaml.dump(task1) },
        { title: `Task: Update Documentation for "${epic.title}"`, body: yaml.dump(task2) }
    ];
}

/**
 * Simple frontmatter parser to extract title and body from markdown.
 */
function parseIssueContent(rawContent) {
    const parts = rawContent.split('---');
    if (parts.length < 3) {
        // Fallback if no frontmatter
        return { title: 'Unknown Title', body: rawContent };
    }

    const frontmatter = parts[1];
    const body = parts.slice(2).join('---').trim();

    let title = 'Unknown Title';
    const titleMatch = frontmatter.match(/^title:\s*(.*)$/m);
    if (titleMatch) {
        title = titleMatch[1].trim().replace(/^['"](.*)['"]$/, '$1'); // Remove quotes if present
    }

    return { title, body };
}

async function run() {
    try {
        console.log('🚀 PM Agent Starting...');

        // 1. Initialize Services
        const ghHealth = await GH_HealthService.healthcheck({});
        if (!ghHealth.githubCli.authenticated) {
            throw new Error('GitHub Authentication failed. Check GH_TOKEN.');
        }

        // Ensure Database is ready for querying
        console.log('🔌 Connecting to Knowledge Base...');
        await KB_DatabaseService.ready();

        // 2. Fetch Epic (Local First)
        const epicId = options.epic; // Keep as string for getIssueById
        console.log(`📥 Fetching Epic #${epicId} (Local)...`);

        // Calling raw method because SDK mapping failed (getIssueById vs get_local_issue_by_id)
        const result = await GH_LocalFileService.getIssueById(String(epicId));

        if (result.error) {
            throw new Error(`Failed to fetch Epic: ${result.message}`);
        }

        const { title, body } = parseIssueContent(result.content);
        const epic = { number: parseInt(epicId), title, body };

        console.log(`   -> Found: "${epic.title}"`);

        // 3. Gather Context
        console.log('📚 Querying Knowledge Base for context...');
        const context = await KB_QueryService.queryDocuments({
            query: epic.title,
            limit: 2
        });

        // 4. Generate Breakdown
        const tasks = await generateBreakdown(epic, context.results || []);

        // 5. Create Tickets
        const createdIds = [];
        for (const task of tasks) {
            console.log(`✨ Creating Ticket: ${task.title}`);

            let issue;
            if (options.dryRun) {
                console.log(`[Dry Run] Would create ticket with body:\n${task.body}`);
                issue = { issueNumber: 0 }; // Mock ID
            } else {
                issue = await GH_IssueService.createIssue({
                    title: task.title,
                    body: task.body, // YAML string
                    labels: ['agent-task:pending', 'agent-role:dev', 'ai-generated']
                });
            }

            if (issue.error) {
                console.error('❌ Failed to create ticket:', issue);
            } else {
                console.log(`   -> Created #${issue.issueNumber}`);
                createdIds.push(issue.issueNumber);
            }
        }

        // 6. Link back to Epic
        if (createdIds.length > 0) {
            console.log('🔗 Linking tickets to Epic...');
            const summary = `🤖 **PM Agent Report**\n\nI have broken this Epic down into the following tasks:\n\n` +
                createdIds.map(id => `- #${id}`).join('\n');

            if (options.dryRun) {
                console.log(`[Dry Run] Would post comment to Epic #${epicId}:\n${summary}`);
            } else {
                await GH_IssueService.createComment({
                    issue_number: parseInt(epicId),
                    body: summary,
                    agent: 'Neo PM Agent'
                });
            }
        }

        console.log('✅ PM Agent finished successfully.');
        process.exit(0);

    } catch (error) {
        console.error('❌ PM Agent Failed:', error);
        process.exit(1);
    }
}

run();
