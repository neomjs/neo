import fs               from 'fs';
import path             from 'path';
import {fileURLToPath}  from 'url';
import yaml             from 'js-yaml';
import {buildZodSchema} from './mcp/validation/OpenApiValidator.mjs';

import Neo             from '../src/Neo.mjs';
import * as core       from '../src/core/_export.mjs';
import InstanceManager from '../src/manager/Instance.mjs';

// --- GitHub Workflow Services ---
import GH_Config                    from './mcp/server/github-workflow/config.mjs';
import GH_HealthService             from './mcp/server/github-workflow/services/HealthService.mjs';
import GH_IssueService              from './mcp/server/github-workflow/services/IssueService.mjs';
import GH_LocalFileService          from './mcp/server/github-workflow/services/LocalFileService.mjs';
import GH_PullRequestService        from './mcp/server/github-workflow/services/PullRequestService.mjs';
import GH_RepositoryService         from './mcp/server/github-workflow/services/RepositoryService.mjs';

// --- Knowledge Base Services ---
import KB_DatabaseService           from './mcp/server/knowledge-base/services/DatabaseService.mjs';
import KB_LifecycleService          from './mcp/server/knowledge-base/services/DatabaseLifecycleService.mjs';
import KB_DocumentService           from './mcp/server/knowledge-base/services/DocumentService.mjs';
import KB_HealthService             from './mcp/server/knowledge-base/services/HealthService.mjs';
import KB_QueryService              from './mcp/server/knowledge-base/services/QueryService.mjs';
import KB_ChromaManager             from './mcp/server/knowledge-base/services/ChromaManager.mjs';
import KB_Config                    from './mcp/server/knowledge-base/config.mjs';

// --- Memory Core Services ---
import Memory_Service               from './mcp/server/memory-core/services/MemoryService.mjs';
import Memory_DatabaseService       from './mcp/server/memory-core/services/DatabaseService.mjs';
import Memory_SessionService        from './mcp/server/memory-core/services/SessionService.mjs';
import Memory_LifecycleService      from './mcp/server/memory-core/services/DatabaseLifecycleService.mjs';
import Memory_HealthService         from './mcp/server/memory-core/services/HealthService.mjs';
import Memory_SummaryService        from './mcp/server/memory-core/services/SummaryService.mjs';
import Memory_ChromaManager         from './mcp/server/memory-core/services/ChromaManager.mjs';
import Memory_Config                from './mcp/server/memory-core/config.mjs';

// --- Neural Link Services ---
import NeuralLink_ConnectionService from './mcp/server/neural-link/services/ConnectionService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// --- Runtime Type Safety Logic ---

function camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function findOperation(spec, operationId) {
    for (const pathItem of Object.values(spec.paths)) {
        for (const operation of Object.values(pathItem)) {
            if (operation.operationId === operationId) {
                return operation;
            }
        }
    }
    return null;
}

/**
 * Wraps a service object to enforce Zod validation on its methods based on OpenAPI specs.
 * @param {Object} service - The raw service object.
 * @param {Object} spec - The parsed OpenAPI document.
 * @returns {Object} - The service object with wrapped methods (mutates original or returns proxy).
 */
function makeSafe(service, spec) {
    // Iterate over all properties of the service (including inherited ones if it's a class instance)
    // For simple objects/singletons:
    const proto = Object.getPrototypeOf(service);
    const keys  = new Set([...Object.getOwnPropertyNames(service), ...Object.getOwnPropertyNames(proto)]);

    for (const key of keys) {
        if (key === 'constructor') continue;

        // Check if it's a function
        if (typeof service[key] === 'function') {
            const operationId = camelToSnake(key);
            const operation = findOperation(spec, operationId);

            if (operation) {
                const originalMethod = service[key].bind(service);
                const zodSchema = buildZodSchema(spec, operation);

                // Replace with wrapped method
                service[key] = async (args) => {
                    // 1. Validate
                    const parsedArgs = zodSchema.parse(args || {});

                    // 2. Execute
                    // Some services expect (args), others expect (arg1, arg2).
                    // The 'x-pass-as-object' annotation in OpenAPI tells us which.
                    if (operation['x-pass-as-object']) {
                        return originalMethod(parsedArgs);
                    } else {
                        // Map object args to positional args based on parameter order
                        const paramNames = (operation.parameters || []).map(p => p.name);
                        if (operation.requestBody?.content?.['application/json']?.schema) {
                            // This logic mimics toolService.mjs but simplifies since we know the schema structure
                            // For complex bodies, we usually rely on x-pass-as-object.
                            // If not pass-as-object, we assume specific named args.
                            // Simplification: If not pass-as-object, just pass the values in order of keys?
                            // No, that's risky.
                            // Fallback: if not pass-as-object, we pass the individual properties as args
                            // in the order defined in the schema? That's hard to guess.
                            // Let's assume for the SDK, we primarily support object-based signatures
                            // OR we rely on the fact that our internal services mostly align with toolService logic.

                            // Actually, the easiest way is to check the function signature length? No.
                            // Let's check the Zod schema keys and pass them spread?
                            // For now, most complex tools are x-pass-as-object.
                            // Simple tools (like get(id)) are positional.

                            // Heuristic:
                            const argValues = paramNames.map(name => parsedArgs[name]);
                            return originalMethod(...argValues);
                        }

                        const argValues = paramNames.map(name => parsedArgs[name]);
                        return originalMethod(...argValues);
                    }
                };
            }
        }
    }
    return service;
}

// --- Load Specs ---
const ghSpec  = yaml.load(fs.readFileSync(path.join(__dirname, 'mcp/server/github-workflow/openapi.yaml'), 'utf8'));
const kbSpec  = yaml.load(fs.readFileSync(path.join(__dirname, 'mcp/server/knowledge-base/openapi.yaml'),  'utf8'));
const memSpec = yaml.load(fs.readFileSync(path.join(__dirname, 'mcp/server/memory-core/openapi.yaml'),     'utf8'));
const nlSpec  = yaml.load(fs.readFileSync(path.join(__dirname, 'mcp/server/neural-link/openapi.yaml'), 'utf8'));

// --- Apply Safety Wrappers ---

// GitHub
makeSafe(GH_HealthService,      ghSpec);
makeSafe(GH_IssueService,       ghSpec);
makeSafe(GH_LocalFileService,   ghSpec);
makeSafe(GH_PullRequestService, ghSpec);
makeSafe(GH_RepositoryService,  ghSpec);

// Knowledge Base
makeSafe(KB_DatabaseService,  kbSpec);
makeSafe(KB_LifecycleService, kbSpec);
makeSafe(KB_DocumentService,  kbSpec);
makeSafe(KB_HealthService,    kbSpec);
makeSafe(KB_QueryService,     kbSpec);

// Memory Core
makeSafe(Memory_Service,          memSpec);
makeSafe(Memory_DatabaseService,  memSpec);
makeSafe(Memory_SessionService,   memSpec);
makeSafe(Memory_LifecycleService, memSpec);
makeSafe(Memory_HealthService,    memSpec);
makeSafe(Memory_SummaryService,   memSpec);

// Neural Link
makeSafe(NeuralLink_ConnectionService, nlSpec);


/**
 * @module Neo.ai.services
 * @description
 * This module acts as a standalone SDK for the Neo.mjs AI infrastructure.
 * It allows Node.js scripts (like AI agents) to import and use the intelligent services
 * directly, bypassing the MCP server protocol.
 *
 * The services are grouped by domain (KnowledgeBase, Memory, GitHub) and conflicting
 * names (like DatabaseLifecycleService) are prefixed.
 *
 * Usage:
 * ```javascript
 * import { KB_QueryService, GH_IssueService } from './ai/services.mjs';
 *
 * const results = await KB_QueryService.queryDocuments({ query: 'my query' });
 * const issue   = await GH_IssueService.createIssue({ title: 'Bug found' });
 * ```
 */

export {
    // GitHub Workflow
    GH_Config,
    GH_HealthService,
    GH_IssueService,
    GH_LocalFileService,
    GH_PullRequestService,
    GH_RepositoryService,

    // Knowledge Base
    KB_Config,
    KB_ChromaManager,
    KB_DatabaseService,
    KB_LifecycleService,
    KB_DocumentService,
    KB_HealthService,
    KB_QueryService,

    // Memory Core
    Memory_Config,
    Memory_ChromaManager,
    Memory_Service,
    Memory_SessionService,
    Memory_DatabaseService,
    Memory_LifecycleService,
    Memory_HealthService,
    Memory_SummaryService,

    // Neural Link
    NeuralLink_ConnectionService
};
