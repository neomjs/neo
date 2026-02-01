import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const CACHE_FILE = 'apps/devrank/resources/data.json';
const PROCESSED_USERS_FILE = 'apps/devrank/resources/processed.json';
const BATCH_SIZE = 10; // Process 10 users at a time to be kind to the rate limit

// Ensure directories exist
const ensureDir = (filePath) => {
    const dirname = path.dirname(filePath);
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
};

ensureDir(CACHE_FILE);

// Load existing data
let results = [];
let processedUsers = new Set();

if (fs.existsSync(CACHE_FILE)) {
    results = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    results.forEach(r => processedUsers.add(r.login));
}

// Helper: Run Shell Command
const run = (cmd) => {
    try {
        return JSON.parse(execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }));
    } catch (e) {
        // console.error(`Command failed: ${cmd}`); // Too noisy
        return null;
    }
};

// 1. Discovery: Fetch Top Repos (Stars > 20k for this test run)
console.log('🔍 Discovering top repositories...');
const searchCmd = `gh api "search/repositories?q=stars:>20000&sort=stars&per_page=20"`;
const searchRes = run(searchCmd);

if (!searchRes) {
    console.error("Failed to search repositories.");
    process.exit(1);
}

const repos = searchRes.items;
let candidateQueue = new Set(['tobiu']); // Start with Seed

// Add top contributors from these repos
repos.forEach(repo => {
    // console.log(`  Scanning repo: ${repo.full_name}`);
    const contribsCmd = `gh api "repos/${repo.full_name}/contributors?per_page=5"`;
    const contributors = run(contribsCmd);
    
    if (contributors) {
        contributors.forEach(c => {
            if (c.type === 'User' && !c.login.includes('[bot]')) {
                candidateQueue.add(c.login);
            }
        });
    }
});

console.log(`✅ Candidates found: ${candidateQueue.size}`);

// 2. Deep Scan Processing
const queueArray = Array.from(candidateQueue).filter(u => !processedUsers.has(u));
console.log(`⚡ New candidates to scan: ${queueArray.length}`);

const processUser = (username) => {
    // Get Creation Date
    const userCmd = `gh api graphql -f query='query { user(login: "${username}") { createdAt avatarUrl name } }'`;
    const userRes = run(userCmd);
    
    if (!userRes || !userRes.data || !userRes.data.user) return null;

    const { createdAt, avatarUrl, name } = userRes.data.user;
    const startYear = new Date(createdAt).getFullYear();
    const currentYear = new Date().getFullYear();

    // Build One-Shot Query
    let query = `query { user(login: "${username}") {`;
    for (let year = startYear; year <= currentYear; year++) {
        query += ` y${year}: contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") { contributionCalendar { totalContributions } }`;
    }
    query += ` } }`;

    // Execute
    const deepCmd = `gh api graphql -f query='${query}'`;
    const deepRes = run(deepCmd);

    if (!deepRes || !deepRes.data || !deepRes.data.user) return null;

    let total = 0;
    const yearsData = {};
    
    Object.keys(deepRes.data.user).forEach(key => {
        if (key.startsWith('y')) {
            const val = deepRes.data.user[key].contributionCalendar.totalContributions;
            const year = key.replace('y', '');
            yearsData[year] = val;
            total += val;
        }
    });

    return {
        login: username,
        name: name || username,
        avatar_url: avatarUrl,
        total_contributions: total,
        years: yearsData,
        first_year: startYear,
        last_updated: new Date().toISOString()
    };
};

// Process Queue
let processedCount = 0;
for (const user of queueArray) {
    process.stdout.write(`  Processing ${user}... `);
    const data = processUser(user);
    
    if (data) {
        results.push(data);
        console.log(`OK (${data.total_contributions})`);
    } else {
        console.log('FAILED');
    }
    
    processedCount++;
    if (processedCount >= 50) break; // Safety limit for dev run
}

// 3. Save Results
// Sort by Total Contributions
results.sort((a, b) => b.total_contributions - a.total_contributions);

fs.writeFileSync(CACHE_FILE, JSON.stringify(results, null, 2));
console.log(`\n💾 Saved ${results.length} users to ${CACHE_FILE}`);
