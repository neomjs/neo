import {test, expect}  from '@playwright/test';
import Ajv             from 'ajv';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import * as yaml       from 'js-yaml';
import {buildZodSchema,
        buildOutputZodSchema,
        toOpenApiJsonSchema} from '../../../../../../ai/mcp/validation/openApiValidator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../../../..');

const servers = ['file-system', 'github-workflow', 'knowledge-base', 'memory-core', 'neural-link'];

/**
 * Walks a JSON Schema node and returns every dotted path where a `type: "array"` node
 * lacks an `items` property. Strict JSON-Schema validators (e.g. GitHub Copilot's MCP
 * client) reject such schemas with "array type must have items".
 *
 * @param {object} node           The schema node to walk.
 * @param {string} pathLabel=''   Dotted path label for error reporting.
 * @returns {string[]}            Paths of non-compliant array nodes (empty when compliant).
 */
function findArraysWithoutItems(node, pathLabel = '') {
    const findings = [];
    const walk     = (n, p) => {
        if (!n || typeof n !== 'object') return;
        if (!Array.isArray(n) && n.type === 'array' && !('items' in n)) findings.push(p);
        if (Array.isArray(n)) n.forEach((v, i) => walk(v, `${p}[${i}]`));
        else for (const k in n) walk(n[k], `${p}.${k}`);
    };
    walk(node, pathLabel);
    return findings;
}

/**
 * Walks a JSON Schema node and returns every dotted path where a `type: "object"` node
 * sets `additionalProperties: false`. For OUTPUT schemas this is the additional-properties drift bug —
 * server implementations return fields the OpenAPI contract forgot to declare, and
 * strict MCP clients (GitHub Copilot) reject the payload with
 * "data/result/0 must NOT have additional properties". OUTPUT schemas should stay
 * lenient; INPUT schemas intentionally stay strict (this helper is only used against
 * output emissions).
 *
 * @param {object} node           The schema node to walk.
 * @param {string} pathLabel=''   Dotted path label for error reporting.
 * @returns {string[]}            Paths of strict object nodes (empty when lenient).
 */
function findStrictObjects(node, pathLabel = '') {
    const findings = [];
    const walk     = (n, p) => {
        if (!n || typeof n !== 'object') return;
        if (!Array.isArray(n) && n.type === 'object' && n.additionalProperties === false) findings.push(p);
        if (Array.isArray(n)) n.forEach((v, i) => walk(v, `${p}[${i}]`));
        else for (const k in n) walk(n[k], `${p}.${k}`);
    };
    walk(node, pathLabel);
    return findings;
}

/**
 * Walks a JSON Schema node looking for INPUT "open-bag" objects that would silently
 * strip their payload to `{}` — the open-bag-stripping regression. An open-bag is a `type: "object"`
 * node that declares NO child `properties` (the author signaled "caller decides the
 * shape") AND strict `additionalProperties: false` (Zod then drops every unknown key).
 * The root of an input schema is excluded — top-level inputs with declared fields
 * legitimately stay strict; we only care about *nested* open-bag slots like
 * `properties`, `selector`, `data`, `config`.
 *
 * @param {object} node           The schema node to walk.
 * @param {string} pathLabel=''   Dotted path label for error reporting.
 * @returns {string[]}            Paths of silently-stripping open-bag nodes (empty when safe).
 */
function findSilentlyStrippingOpenBags(node, pathLabel = '') {
    const findings = [];
    const walk     = (n, p, isRoot) => {
        if (!n || typeof n !== 'object') return;
        if (!isRoot && !Array.isArray(n) && n.type === 'object' && !n.properties && n.additionalProperties === false) {
            findings.push(p);
        }
        if (Array.isArray(n)) n.forEach((v, i) => walk(v, `${p}[${i}]`, false));
        else for (const k in n) walk(n[k], `${p}.${k}`, false);
    };
    walk(node, pathLabel, true);
    return findings;
}

const neuralLinkToolTiers = ['read', 'write-locked', 'admin'];

const expectedNeuralLinkToolTiers = {
    abort_transaction            : 'write-locked',
    begin_transaction            : 'write-locked',
    call_method                  : 'admin',
    capture_perspective          : 'write-locked',
    check_namespace              : 'read',
    close_window                 : 'write-locked',
    commit_transaction           : 'write-locked',
    create_component             : 'write-locked',
    create_instance              : 'write-locked',
    diff_dock_topology           : 'read',
    execute_dock_operation       : 'write-locked',
    find_instances               : 'read',
    focus_window                 : 'write-locked',
    get_component_tree           : 'read',
    get_computed_styles          : 'read',
    get_console_logs             : 'read',
    get_dock_topology            : 'read',
    get_dom_event_listeners      : 'read',
    get_dom_event_summary        : 'read',
    get_dom_rect                 : 'read',
    get_drag_state               : 'read',
    get_drag_trace               : 'read',
    get_instance_properties      : 'read',
    get_mcp_tool_handbook        : 'read',
    get_method_source            : 'read',
    get_namespace_tree           : 'read',
    get_record                   : 'read',
    get_route_history            : 'read',
    get_window_topology          : 'read',
    get_worker_topology          : 'read',
    healthcheck                  : 'read',
    highlight_component          : 'write-locked',
    inspect_class                : 'read',
    inspect_component_render_tree: 'read',
    inspect_state_provider       : 'read',
    inspect_store                : 'read',
    list_perspectives            : 'read',
    list_stores                  : 'read',
    list_transactions            : 'read',
    manage_connection            : 'admin',
    manage_neo_config            : 'admin',
    modify_state_provider        : 'write-locked',
    observe_motion               : 'read',
    open_component_window        : 'write-locked',
    patch_code                   : 'admin',
    position_window              : 'write-locked',
    query_component              : 'read',
    query_vdom                   : 'read',
    redo                         : 'write-locked',
    reload_page                  : 'admin',
    remove_component             : 'write-locked',
    replay_transaction           : 'write-locked',
    restore_perspective          : 'write-locked',
    save_transaction             : 'write-locked',
    set_instance_properties      : 'write-locked',
    set_route                    : 'write-locked',
    simulate_event               : 'write-locked',
    undo                         : 'write-locked',
    verify_component_consistency : 'read'
};

const neuralLinkDangerousReadForbidden = [
    'abort_transaction',
    'begin_transaction',
    'call_method',
    'close_window',
    'commit_transaction',
    'create_component',
    'create_instance',
    'focus_window',
    'highlight_component',
    'manage_connection',
    'manage_neo_config',
    'modify_state_provider',
    'open_component_window',
    'patch_code',
    'position_window',
    'redo',
    'reload_page',
    'remove_component',
    'replay_transaction',
    'save_transaction',
    'set_instance_properties',
    'set_route',
    'simulate_event',
    'undo'
];

const knowledgeBaseToolTiers = ['read', 'extended', 'admin'];

const expectedKnowledgeBaseToolTiers = {
    healthcheck                  : 'read',
    get_ingestion_progress       : 'extended',
    get_mcp_tool_handbook        : 'read',
    get_deployment_state_snapshot: 'extended',
    inspect_deployment           : 'extended',
    manage_knowledge_base        : 'admin',
    ingest_source_files          : 'admin',
    query_documents              : 'read',
    ask_knowledge_base           : 'read',
    list_agent_faqs              : 'extended',
    get_class_hierarchy          : 'read',
    list_documents               : 'read',
    get_document_by_id           : 'read'
};

const knowledgeBaseDangerousReadForbidden = [
    'manage_knowledge_base',
    'ingest_source_files'
];

const githubWorkflowToolTiers = ['read', 'write', 'extended', 'admin'];

const expectedGithubWorkflowToolTiers = {
    healthcheck                : 'read',
    get_mcp_tool_handbook      : 'read',
    list_labels                : 'read',
    list_pull_requests         : 'read',
    checkout_pull_request      : 'admin',
    get_pull_request_diff      : 'read',
    get_conversation           : 'read',
    manage_issue_comment       : 'write',
    manage_issue_labels        : 'write',
    manage_issue_assignees     : 'write',
    manage_pr_review           : 'write',
    manage_pr_reviewers        : 'write',
    validate_pr_review_body    : 'read',
    get_local_issue_by_id      : 'read',
    list_issues                : 'read',
    create_issue               : 'write',
    manage_issue_projects      : 'extended',
    create_discussion          : 'extended',
    manage_discussion          : 'extended',
    get_discussion_conversation: 'read',
    manage_discussion_comment  : 'extended',
    update_issue_relationship  : 'write',
    get_viewer_permission      : 'read',
    signal_state_transition    : 'write'
};

// Every mutating gh op must NOT be tiered `read` (a mutation mislabeled read would be wrongly
// auto-visible as a safe default). `checkout_pull_request` is `admin` (it desyncs the canonical clone).
const githubWorkflowDangerousReadForbidden = [
    'checkout_pull_request',
    'manage_issue_comment',
    'manage_issue_labels',
    'manage_issue_assignees',
    'manage_pr_review',
    'manage_pr_reviewers',
    'create_issue',
    'manage_issue_projects',
    'create_discussion',
    'manage_discussion',
    'manage_discussion_comment',
    'update_issue_relationship',
    'signal_state_transition'
];

const memoryCoreToolTiers = ['read', 'write', 'extended', 'admin'];

const expectedMemoryCoreToolTiers = {
    admit_community_batch        : 'write',
    healthcheck                  : 'read',
    get_community_source_health  : 'read',
    get_mcp_tool_handbook        : 'read',
    get_memory_core_tool_metrics : 'extended',
    get_deployment_state_snapshot: 'extended',
    inspect_deployment           : 'extended',
    get_rem_pipeline_state       : 'extended',
    get_sqlite_holder_diagnostics: 'extended',
    get_sandman_handoff          : 'read',
    who_is_online                : 'read',
    add_memory                   : 'write',
    get_session_memories         : 'read',
    query_raw_memories           : 'read',
    query_recent_turns           : 'read',
    get_context_frontier         : 'read',
    mutate_frontier              : 'extended',
    pre_brief_session            : 'extended',
    get_all_summaries            : 'read',
    query_summaries              : 'read',
    explore_memory_history       : 'read',
    explore_pull_request_history : 'read',
    explore_lane_landscape       : 'read',
    purge_session                : 'admin',
    resume_session               : 'extended',
    set_session_id               : 'extended',
    get_node                     : 'read',
    get_neighbors                : 'read',
    search_nodes                 : 'read',
    query_hybrid_graph           : 'read',
    grant_permission             : 'admin',
    revoke_permission            : 'admin',
    list_permissions             : 'extended',
    add_message                  : 'write',
    list_messages                : 'read',
    get_message                  : 'read',
    mark_read                    : 'write',
    archive_message              : 'extended',
    delete_message               : 'admin',
    transition_task              : 'extended',
    record_turn_presence         : 'write',
    manage_wake_subscription     : 'extended'
};

// Every mutating mc op must NOT be tiered `read`. The destructive ops (purge_session, delete_message,
// grant/revoke_permission) are `admin`; the constant maintainer-writes (add_message/add_memory/mark_read/
// record_turn_presence) are visible `write`; the rest of the mutations are withheld `extended`.
const memoryCoreDangerousReadForbidden = [
    'admit_community_batch',
    'add_memory',
    'add_message',
    'mark_read',
    'record_turn_presence',
    'mutate_frontier',
    'resume_session',
    'set_session_id',
    'transition_task',
    'manage_wake_subscription',
    'archive_message',
    'purge_session',
    'grant_permission',
    'revoke_permission',
    'delete_message'
];

/**
 * Reads OpenAPI operations by operationId.
 * @param {object} doc Parsed OpenAPI document.
 * @returns {Object<string, object>} Operation map.
 */
function getOperationsById(doc) {
    const operations = {};

    for (const [, pathItem] of Object.entries(doc.paths || {})) {
        for (const [, op] of Object.entries(pathItem)) {
            if (op?.operationId) {
                operations[op.operationId] = op;
            }
        }
    }

    return operations;
}

/**
 * Extracts Neural Link serviceMapping keys so OpenAPI tier metadata cannot drift from
 * the callable server surface.
 * @returns {string[]} Sorted serviceMapping operation ids.
 */
function getNeuralLinkServiceMappingKeys() {
    const
        toolServicePath = path.join(repoRoot, 'ai/mcp/server/neural-link/toolService.mjs'),
        source          = fs.readFileSync(toolServicePath, 'utf8'),
        match           = source.match(/const serviceMapping = \{([\s\S]*?)\n\};/);

    expect(match, 'Could not locate neural-link serviceMapping object').toBeTruthy();

    return [...match[1].matchAll(/^\s+([a-z0-9_]+)\s*:/gm)].map(item => item[1]).sort();
}

test.describe('OpenApiValidator: strict-client JSON-Schema compliance', () => {
    /**
     * Direct regression for https://github.com/neomjs/neo/issues/10064. Prior to the fix,
     * `z.array(z.unknown())` must emit `{"type":"array","items":{}}`,
     * satisfying strict validators that reject array schemas without `items`.
     */
    test('z.array(z.unknown()) emits items under Zod v4 OpenAPI target', async () => {
        const {z}    = await import('zod');
        const schema = toOpenApiJsonSchema(z.array(z.unknown()));
        expect(schema.type).toBe('array');
        expect(schema).toHaveProperty('items');
    });

    /**
     * Heterogeneous `call_method` args: the explicit JsonValue union must emit as `anyOf`
     * (concrete item types survive client schema normalizers that collapse empty `items`
     * to string) AND the runtime Zod union must parse every representative JSON class —
     * string, number, boolean, null, an open object (the object-bearing wire), and nested arrays.
     */
    test('call_method args emit an explicit JsonValue union and parse every JSON class', async () => {
        const doc  = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/neural-link/openapi.yaml'), 'utf8'));
        const op   = doc.paths['/instance/method/call'].post;
        const zod  = buildZodSchema(doc, op);
        const json = toOpenApiJsonSchema(zod),
              items = json.properties.args.items;

        expect(items.anyOf).toBeDefined();
        expect(items.anyOf.map(member => member.type)).toEqual(['string', 'number', 'boolean', 'object', 'array']);
        expect(items.anyOf[0].nullable).toBe(true);

        const cases = ['a string', 42, 3.14, true, null, {url: 'http://x', bearerToken: 'tok'}, [1, 'two', {three: 3}], [], {}];

        for (const value of cases) {
            expect(zod.shape.args.safeParse([value]).success, `args must accept ${JSON.stringify(value)}`).toBe(true)
        }
    });

    /**
     * Direct regression for https://github.com/neomjs/neo/issues/9837 (re-purposed).
     * Confirms that `.passthrough()` on a `z.object(...)` flips the emission to
     * `additionalProperties: true`. This is the mechanism by which output schemas
     * tolerate server-side drift in returned fields.
     */
    test('z.object(...).passthrough() emits additionalProperties:true', async () => {
        const {z}     = await import('zod');
        const strict  = toOpenApiJsonSchema(z.object({a: z.string()}));
        const lenient = toOpenApiJsonSchema(z.object({a: z.string()}).passthrough());
        expect(strict.additionalProperties).toBe(false);
        expect(lenient.additionalProperties).toBe(true);
    });

    /**
     * Direct regression for https://github.com/neomjs/neo/issues/10070. Prior to the fix,
     * `type: object` with no declared `properties` emitted strict `z.object({})` which
     * Zod parses by stripping every unknown key — silently nulling the entire payload
     * on open-bag inputs like `set_instance_properties.properties`. The fix emits
     * `z.object({}).passthrough()` in that case, preserving the caller's payload.
     */
    test('buildZodSchema preserves open-bag input payloads (set_instance_properties.properties)', async () => {
        const doc    = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/neural-link/openapi.yaml'), 'utf8'));
        const op     = doc.paths['/instance/properties/set'].post;
        const parsed = buildZodSchema(doc, op).parse({
            id        : 'neo-button-1',
            properties: {text: 'KEEP_ME', arbitraryKey: 42}
        });
        expect(parsed.properties).toEqual({text: 'KEEP_ME', arbitraryKey: 42});
    });

    /**
     * Direct regression for https://github.com/neomjs/neo/issues/10527.
     * Prior to the fix, `buildZodSchemaFromNode` blindly converted string schemas
     * to `z.string()`, entirely dropping any `enum` constraint defined in OpenAPI.
     * This test confirms that string parameters with enums correctly generate `z.enum()`.
     */
    test('buildZodSchema preserves enum constraints for string inputs (#10527)', async () => {
        const doc = {
            paths: {
                '/test': {
                    post: {
                        operationId: 'test_enum',
                        requestBody: {
                            content: {
                                'application/json': {
                                    schema: {
                                        type      : 'object',
                                        properties: {
                                            action: { type: 'string', enum: ['start', 'stop'] }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        const op     = doc.paths['/test'].post;
        const schema = toOpenApiJsonSchema(buildZodSchema(doc, op));

        expect(schema.properties.action.type).toBe('string');
        expect(schema.properties.action.enum).toEqual(['start', 'stop']);
    });

    test('buildZodSchema preserves array bounds and uniqueness in validation and tools/list output (#16194)', () => {
        const doc = {
            paths: {
                '/test': {
                    get: {
                        operationId: 'test_array_constraints',
                        parameters : [{
                            in      : 'query',
                            name    : 'ids',
                            required: true,
                            schema  : {
                                type       : 'array',
                                minItems   : 1,
                                maxItems   : 3,
                                uniqueItems: true,
                                items      : {type: 'integer'}
                            }
                        }]
                    }
                }
            }
        };
        const zodSchema  = buildZodSchema(doc, doc.paths['/test'].get);
        const jsonSchema = toOpenApiJsonSchema(zodSchema);

        expect(jsonSchema.properties.ids).toMatchObject({
            type       : 'array',
            minItems   : 1,
            maxItems   : 3,
            uniqueItems: true,
            items      : {type: 'integer'}
        });
        expect(zodSchema.safeParse({ids: [1, 2, 3]}).success).toBe(true);
        expect(zodSchema.safeParse({ids: []}).success).toBe(false);
        expect(zodSchema.safeParse({ids: [1, 2, 3, 4]}).success).toBe(false);
        expect(zodSchema.safeParse({ids: [1, 1]}).success).toBe(false)
    });

    /**
     * Direct regression for https://github.com/neomjs/neo/issues/10531.
     * The MCP tool-shape compiler must preserve OpenAPI defaults, numeric bounds,
     * and native choice enums so agents learn valid calls from `tools/list`.
     */
    test('memory-core input schemas preserve defaults, bounds, and choice enums (#10531)', async () => {
        const doc                = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/memory-core/openapi.yaml'), 'utf8')),
              addMessageSchema   = toOpenApiJsonSchema(buildZodSchema(doc, doc.paths['/mailbox/messages'].post)),
              listMessagesSchema = toOpenApiJsonSchema(buildZodSchema(doc, doc.paths['/mailbox/messages'].get)),
              wakeSchema         = toOpenApiJsonSchema(buildZodSchema(doc, doc.paths['/wake-subscriptions/manage'].post)),
              adapter            = wakeSchema.properties.harnessTargetMetadata.properties.adapter,
              coalesceWindow     = wakeSchema.properties.harnessTargetMetadata.properties.coalesceWindow;

        expect(addMessageSchema.properties.priority.enum).toEqual(['low', 'normal', 'high']);
        expect(addMessageSchema.properties.priority.default).toBe('normal');
        expect(addMessageSchema.properties.wakeSuppressed.default).toBe(false);

        expect(listMessagesSchema.properties.box.enum).toEqual(['inbox', 'outbox', 'all']);
        expect(listMessagesSchema.properties.box.default).toBe('inbox');
        expect(listMessagesSchema.properties.status.enum).toEqual(['all', 'read', 'unread']);
        expect(listMessagesSchema.properties.status.default).toBe('all');
        expect(listMessagesSchema.properties.limit.default).toBe(50);
        expect(listMessagesSchema.properties.offset.default).toBe(0);

        expect(adapter.enum).toEqual(['osascript', 'tmux', 'codex-app-server', 'opencode-server', 'kimi-server', 'kimi-pull-bridge']);

        expect(coalesceWindow.type).toBe('integer');
        expect(coalesceWindow.minimum).toBe(0);
        expect(coalesceWindow.maximum).toBe(300);
    });

    test('memory-core inspect_deployment output compiles for AJV clients (#16086)', () => {
        const
            doc       = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/memory-core/openapi.yaml'), 'utf8')),
            operation = doc.paths['/deployment/inspect'].post,
            schema    = toOpenApiJsonSchema(buildOutputZodSchema(doc, operation)),
            route     = schema.properties.mailboxReadState.properties.route;

        expect(route).toEqual({
            nullable: true,
            type    : 'string',
            enum    : ['direct', 'broadcast']
        });
        expect(() => new Ajv({strict: false}).compile(schema)).not.toThrow();
    });

    test('memory-core provider activity output is bounded, nullable where unmeasured, and AJV-compatible (#16770)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/memory-core/openapi.yaml'), 'utf8')),
            operation  = doc.paths['/diagnostics/tool-metrics'].post,
            schema     = toOpenApiJsonSchema(buildOutputZodSchema(doc, operation)),
            response   = doc.components.schemas.ProviderActivityResponse,
            aggregate  = doc.components.schemas.ProviderActivityAggregate,
            inFlight   = doc.components.schemas.ProviderActivityInFlight,
            completion = doc.components.schemas.ProviderActivityCompletion;

        expect(doc.components.schemas.MemoryCoreToolMetricsResponse.required).toContain('providerActivity');
        expect(response.properties.status.enum).toEqual(['ok', 'partial', 'disabled', 'unavailable']);
        expect(response.required).toEqual([
            'status',
            'totalActivities',
            'totalInFlight',
            'aggregates',
            'inFlight',
            'recentCompletions'
        ]);
        expect(Object.keys(aggregate.properties)).toEqual([
            'service',
            'operationStage',
            'role',
            'provider',
            'model',
            'priority',
            'queueDisposition',
            'calls',
            'failures',
            'inFlight',
            'avgQueueWaitMs',
            'maxQueueWaitMs',
            'avgExecutionMs',
            'maxExecutionMs',
            'lastSeenAt'
        ]);
        expect(Object.keys(inFlight.properties)).toEqual([
            'activityId',
            'service',
            'operationStage',
            'role',
            'provider',
            'model',
            'priority',
            'enqueuedAt',
            'startedAt',
            'queueDisposition',
            'queueWaitMs',
            'elapsedMs'
        ]);
        expect(Object.keys(completion.properties)).toEqual([
            'activityId',
            'service',
            'operationStage',
            'role',
            'provider',
            'model',
            'priority',
            'enqueuedAt',
            'startedAt',
            'completedAt',
            'queueDisposition',
            'queueWaitMs',
            'executionMs',
            'success',
            'failureStage'
        ]);
        expect(completion.properties.queueDisposition.enum).toContain('not-applicable');
        expect(completion.properties.queueWaitMs.nullable).toBe(true);
        expect(() => new Ajv({strict: false}).compile(schema)).not.toThrow();
    });

    test('knowledge-base query schemas expose skill, adr, and concept content types', async () => {
        const expectedTypes = ['all', 'blog', 'guide', 'src', 'example', 'ticket', 'release', 'test', 'skill', 'adr', 'concept'],
              doc           = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/knowledge-base/openapi.yaml'), 'utf8')),
              queryOp       = doc.paths['/documents/query'].post,
              askOp         = doc.paths['/knowledge/ask'].post,
              querySchema   = toOpenApiJsonSchema(buildZodSchema(doc, queryOp)),
              askSchema     = toOpenApiJsonSchema(buildZodSchema(doc, askOp)),
              queryType     = doc.components.schemas.QueryRequest.properties.type;

        expect(queryType.enum).toEqual(expectedTypes);
        expect(queryType.description).toContain('`test`');
        expect(queryType.description).toContain('`skill`');
        expect(queryType.description).toContain('`adr`');
        expect(queryType.description).toContain('`concept`');
        expect(querySchema.properties.type.enum).toEqual(expectedTypes);
        expect(askSchema.properties.type.enum).toEqual(expectedTypes);
    });

    test('ingest_source_files declares every param its in-process callers pass (#16577)', () => {
        // The input-side twin of the additional-properties drift guarded above for outputs:
        // `services.mjs` parses every call through this schema, and Zod DROPS undeclared keys
        // silently. A service param the contract forgets is therefore not a documentation gap —
        // it never reaches the method, with no error and no log. Both fields below were
        // undeclared and stripped on every call, which is why pull-mode ingestion embedded
        // correctly and then rejected itself: no receipt was ever minted, and bulk batches were
        // forced through the MCP work-volume gate.
        const doc      = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/knowledge-base/openapi.yaml'), 'utf8')),
              ingestOp = getOperationsById(doc).ingest_source_files,
              attempt  = {attemptId: 'a'.repeat(32), ingestContractVersion: 2},
              parsed   = buildZodSchema(doc, ingestOp).parse({
                  tenantId              : 'neo-shared',
                  repoSlug              : 'create-app',
                  files                 : [],
                  headRevision          : 'abc123',
                  manifestSnapshot      : {repoSlug: 'create-app', pathsAfterPush: ['x.md']},
                  materializationAttempt: attempt,
                  viaMcp                : false
              });

        // Pull-mode proof identity: stripping this is what leaves a successful materialization
        // with no receipt, so the orchestrator raises EMPTY_MATERIALIZATION against its own ingest.
        expect(parsed.materializationAttempt, 'materializationAttempt survives the Zod gate').toEqual(attempt);

        // Bulk opt-in: stripping this re-reads as `viaMcp !== false` -> true, so tenant-scale
        // batches hit the MCP synchronous work-volume gate and fail with KB_VECTOR_EMBED_FAILED.
        expect(Object.hasOwn(parsed, 'viaMcp'), 'viaMcp survives the Zod gate').toBe(true);
        expect(parsed.viaMcp, 'an explicit false is preserved, not defaulted away').toBe(false);
    });

    test('neural-link declares the harness-visible projection policy (#13064)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/neural-link/openapi.yaml'), 'utf8')),
            projection = doc['x-neo-harness-tool-projection'];

        expect(projection, 'Missing x-neo-harness-tool-projection contract').toBeTruthy();
        expect(projection.defaultVisibleTiers).toEqual(['read']);
        expect(projection.withheldUntilTopologicalLocking).toEqual(['write-locked']);
        expect(projection.operatorOnlyTiers).toEqual(['admin']);
        expect(projection.description).toContain('Harness-embedded agents receive read-tier Neural Link tools by default');
    });

    test('neural-link classifies every operation into one harness tool tier (#13064)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/neural-link/openapi.yaml'), 'utf8')),
            operations = getOperationsById(doc),
            tiers      = Object.fromEntries(Object.entries(operations).map(([id, op]) => [id, op['x-neo-tool-tier']]));

        const missing = Object.entries(tiers).filter(([, tier]) => tier === undefined).map(([id]) => id);
        const invalid = Object.entries(tiers).filter(([, tier]) => tier !== undefined && !neuralLinkToolTiers.includes(tier));

        expect(missing, `Neural Link operations missing x-neo-tool-tier:\n${missing.join('\n')}`).toEqual([]);
        expect(invalid, `Invalid Neural Link x-neo-tool-tier values:\n${invalid.map(([id, tier]) => `${id}: ${tier}`).join('\n')}`).toEqual([]);
        expect(tiers).toEqual(expectedNeuralLinkToolTiers);
    });

    test('neural-link mutation and admin operations cannot be tiered as read (#13064)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/neural-link/openapi.yaml'), 'utf8')),
            operations = getOperationsById(doc),
            offenders  = neuralLinkDangerousReadForbidden.filter(id => operations[id]?.['x-neo-tool-tier'] === 'read');

        expect(offenders, `Dangerous Neural Link operations mislabeled read:\n${offenders.join('\n')}`).toEqual([]);
    });

    test('knowledge-base declares the harness-visible projection policy (#14164)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/knowledge-base/openapi.yaml'), 'utf8')),
            projection = doc['x-neo-harness-tool-projection'];

        expect(projection, 'Missing x-neo-harness-tool-projection contract').toBeTruthy();
        expect(projection.defaultVisibleTiers).toEqual(['read']);
        expect(projection.operatorOnlyTiers).toEqual(['admin']);
    });

    test('knowledge-base classifies every operation into one harness tool tier (#14164)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/knowledge-base/openapi.yaml'), 'utf8')),
            operations = getOperationsById(doc),
            tiers      = Object.fromEntries(Object.entries(operations).map(([id, op]) => [id, op['x-neo-tool-tier']]));

        const missing = Object.entries(tiers).filter(([, tier]) => tier === undefined).map(([id]) => id);
        const invalid = Object.entries(tiers).filter(([, tier]) => tier !== undefined && !knowledgeBaseToolTiers.includes(tier));

        expect(missing, `Knowledge Base operations missing x-neo-tool-tier:\n${missing.join('\n')}`).toEqual([]);
        expect(invalid, `Invalid Knowledge Base x-neo-tool-tier values:\n${invalid.map(([id, tier]) => `${id}: ${tier}`).join('\n')}`).toEqual([]);
        expect(tiers).toEqual(expectedKnowledgeBaseToolTiers);
    });

    test('knowledge-base mutating operations cannot be tiered as read (#14164)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/knowledge-base/openapi.yaml'), 'utf8')),
            operations = getOperationsById(doc),
            offenders  = knowledgeBaseDangerousReadForbidden.filter(id => operations[id]?.['x-neo-tool-tier'] === 'read');

        expect(offenders, `Dangerous Knowledge Base operations mislabeled read:\n${offenders.join('\n')}`).toEqual([]);
    });

    test('github-workflow declares the harness-visible projection policy (#14164)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/github-workflow/openapi.yaml'), 'utf8')),
            projection = doc['x-neo-harness-tool-projection'];

        expect(projection, 'Missing x-neo-harness-tool-projection contract').toBeTruthy();
        expect(projection.defaultVisibleTiers).toEqual(['read', 'write']);
        expect(projection.operatorOnlyTiers).toEqual(['admin']);
    });

    test('github-workflow classifies every operation into one harness tool tier (#14164)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/github-workflow/openapi.yaml'), 'utf8')),
            operations = getOperationsById(doc),
            tiers      = Object.fromEntries(Object.entries(operations).map(([id, op]) => [id, op['x-neo-tool-tier']]));

        const missing = Object.entries(tiers).filter(([, tier]) => tier === undefined).map(([id]) => id);
        const invalid = Object.entries(tiers).filter(([, tier]) => tier !== undefined && !githubWorkflowToolTiers.includes(tier));

        expect(missing, `github-workflow operations missing x-neo-tool-tier:\n${missing.join('\n')}`).toEqual([]);
        expect(invalid, `Invalid github-workflow x-neo-tool-tier values:\n${invalid.map(([id, tier]) => `${id}: ${tier}`).join('\n')}`).toEqual([]);
        expect(tiers).toEqual(expectedGithubWorkflowToolTiers);
    });

    test('github-workflow mutating operations cannot be tiered as read (#14164)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/github-workflow/openapi.yaml'), 'utf8')),
            operations = getOperationsById(doc),
            offenders  = githubWorkflowDangerousReadForbidden.filter(id => operations[id]?.['x-neo-tool-tier'] === 'read');

        expect(offenders, `Dangerous github-workflow operations mislabeled read:\n${offenders.join('\n')}`).toEqual([]);
    });

    test('memory-core declares the harness-visible projection policy (#14164)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/memory-core/openapi.yaml'), 'utf8')),
            projection = doc['x-neo-harness-tool-projection'];

        expect(projection, 'Missing x-neo-harness-tool-projection contract').toBeTruthy();
        expect(projection.defaultVisibleTiers).toEqual(['read', 'write']);
        expect(projection.operatorOnlyTiers).toEqual(['admin']);
    });

    test('memory-core classifies every operation into one harness tool tier (#14164)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/memory-core/openapi.yaml'), 'utf8')),
            operations = getOperationsById(doc),
            tiers      = Object.fromEntries(Object.entries(operations).map(([id, op]) => [id, op['x-neo-tool-tier']]));

        const missing = Object.entries(tiers).filter(([, tier]) => tier === undefined).map(([id]) => id);
        const invalid = Object.entries(tiers).filter(([, tier]) => tier !== undefined && !memoryCoreToolTiers.includes(tier));

        expect(missing, `memory-core operations missing x-neo-tool-tier:\n${missing.join('\n')}`).toEqual([]);
        expect(invalid, `Invalid memory-core x-neo-tool-tier values:\n${invalid.map(([id, tier]) => `${id}: ${tier}`).join('\n')}`).toEqual([]);
        expect(tiers).toEqual(expectedMemoryCoreToolTiers);
    });

    test('memory-core mutating operations cannot be tiered as read (#14164)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/memory-core/openapi.yaml'), 'utf8')),
            operations = getOperationsById(doc),
            offenders  = memoryCoreDangerousReadForbidden.filter(id => operations[id]?.['x-neo-tool-tier'] === 'read');

        expect(offenders, `Dangerous memory-core operations mislabeled read:\n${offenders.join('\n')}`).toEqual([]);
    });

    test('neural-link OpenAPI operations stay aligned with serviceMapping keys (#13064)', () => {
        const
            doc          = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/neural-link/openapi.yaml'), 'utf8')),
            operationIds = Object.keys(getOperationsById(doc)).sort(),
            mappingIds   = getNeuralLinkServiceMappingKeys();

        expect(operationIds).toEqual(mappingIds);
    });

    test('neural-link check_namespace + get_namespace_tree pass their object payload to the handler (#14542)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/neural-link/openapi.yaml'), 'utf8')),
            operations = getOperationsById(doc);

        // Both bind RuntimeService handlers that destructure a single {..., sessionId} object. Without
        // x-pass-as-object, ToolService (ai/mcp/ToolService.mjs) spreads the validated args positionally
        // and the destructure yields undefined — the tool silently mis-passes its arguments.
        expect(operations.check_namespace['x-pass-as-object'], 'check_namespace must pass its object payload').toBe(true);
        expect(operations.get_namespace_tree['x-pass-as-object'], 'get_namespace_tree must pass its object payload').toBe(true);
    });

    test('neural-link: every x-handler operation passes its payload as an object (#14542 recurrence guard)', () => {
        const
            doc        = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/neural-link/openapi.yaml'), 'utf8')),
            operations = getOperationsById(doc);

        // An x-handler operation routes to a custom RuntimeService handler; every such handler in the
        // Neural Link surface destructures a single object, so the op MUST carry x-pass-as-object:true —
        // otherwise ToolService spreads the args positionally and the handler receives the wrong shape.
        const offenders = Object.entries(operations)
            .filter(([, op]) => op['x-handler'] && op['x-pass-as-object'] !== true)
            .map(([id]) => id);

        expect(offenders, `x-handler ops missing x-pass-as-object (arg-shape mismatch):\n${offenders.join('\n')}`).toEqual([]);
    });

    test('every server: an argument-taking operation carries x-pass-as-object unless its handler is positional (#16231)', () => {
        // The guard above, generalized. That one covers neural-link x-handler ops; the same omission
        // put every argument-taking file-system tool out of action from the day that server was
        // created, because nothing asserted over the whole surface. The annotation is required for
        // correctness, silent when absent, and undocumented, so each new server inherits the trap
        // intact.
        //
        // gitlab-workflow is included here even though the module-level `servers` list omits it — the
        // trap does not care which suites cover a server. Deduplicated so that adding it to `servers`
        // later widens the shared list instead of scanning it twice here.
        const allServers = [...new Set([...servers, 'gitlab-workflow'])].sort();

        // Exceptions need a reason, because an unlisted one is exactly the defect this test catches.
        const positionalHandlers = {
            // `toolId => toolService.getToolHandbook(toolId)` — the identical arrow in all six servers.
            'get_mcp_tool_handbook': 'arrow handler takes the toolId positionally',

            // `getIssueById(issueNumber)` — genuinely positional, single argument.
            'github-workflow:get_local_issue_by_id': 'handler signature is a single positional issueNumber'
        };

        const offenders = [];

        for (const server of allServers) {
            const doc = yaml.load(fs.readFileSync(path.join(repoRoot, `ai/mcp/server/${server}/openapi.yaml`), 'utf8'));

            for (const [operationId, op] of Object.entries(getOperationsById(doc))) {
                // The same union ToolService.initializeToolMapping() builds. No argument names means the
                // operation dispatches identically either way, so only a non-empty set is interesting.
                const argNames = (op.parameters || []).map(parameter => parameter.name),
                      schema   = op.requestBody?.content?.['application/json']?.schema;

                if (schema) {
                    const resolved = schema.$ref
                        ? schema.$ref.replace(/^#\//, '').split('/').reduce((node, key) => node[key], doc)
                        : schema;

                    argNames.push(...Object.keys(resolved.properties || {}));
                }

                if (argNames.length === 0)                          continue;
                if (op['x-pass-as-object'] === true)                continue;
                if (positionalHandlers[operationId])                continue;
                if (positionalHandlers[`${server}:${operationId}`]) continue;

                offenders.push(`${server}.${operationId} (${argNames.join(', ')})`);
            }
        }

        expect(offenders, `ops dispatch positionally with no positional handler recorded:\n${offenders.join('\n')}`).toEqual([]);
    });

    test('neural-link inspect_store + list_stores output schemas (object `model` #13372; list_stores `{stores:[]}` envelope + `isLoaded` #10072)', () => {
        const doc     = yaml.load(fs.readFileSync(path.join(repoRoot, 'ai/mcp/server/neural-link/openapi.yaml'), 'utf8')),
              opsById = getOperationsById(doc),
              // A live store's `model` is the serialized Neo.data.Model — an object, not a className string.
              objectModel = {className: 'Neo.data.Model', fields: [{name: 'id', type: 'String'}], keyProperty: 'id'};

        const inspectStoreOut = buildOutputZodSchema(doc, opsById.inspect_store),
              listStoresOut   = buildOutputZodSchema(doc, opsById.list_stores);

        expect(inspectStoreOut, 'inspect_store has an output schema').toBeTruthy();
        expect(listStoresOut,   'list_stores has an output schema').toBeTruthy();

        // The -32602 regression: an object `model` must parse (was rejected by `model: type: string`).
        expect(() => inspectStoreOut.parse({id: 'store-1', count: 2, model: objectModel, filters: [], sorters: [], items: []})).not.toThrow();
        // A className-only string `model` still parses — backward-compatible.
        expect(() => inspectStoreOut.parse({id: 'store-1', count: 2, model: 'Neo.data.Model', filters: [], sorters: [], items: []})).not.toThrow();
        // list_stores: the impl (src/ai/client/DataService.mjs#listStores) returns a NAMED `{stores:[...]}`
        // envelope incl. `isLoaded` — not a top-level array (strict output validation surfaced that drift). The
        // schema admits the envelope, the `isLoaded` field, and each item's object `model`.
        expect(() => listStoresOut.parse({stores: [{id: 'store-1', model: objectModel, count: 2, isLoaded: true}]})).not.toThrow();
    });

    for (const server of servers) {
        test(`${server}: every emitted input/output schema has items on array nodes (#10064)`, () => {
            const yamlPath = path.join(repoRoot, 'ai/mcp/server', server, 'openapi.yaml');
            expect(fs.existsSync(yamlPath), `${yamlPath} missing`).toBe(true);

            const doc       = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
            const offenders = [];

            for (const [, pathItem] of Object.entries(doc.paths || {})) {
                for (const [, op] of Object.entries(pathItem)) {
                    if (!op?.operationId) continue;

                    const inputSchema  = toOpenApiJsonSchema(buildZodSchema(doc, op)),
                          outputZod    = buildOutputZodSchema(doc, op),
                          outputSchema = outputZod ? toOpenApiJsonSchema(outputZod) : null;

                    offenders.push(...findArraysWithoutItems(inputSchema,  `${op.operationId}.input`));
                    if (outputSchema) {
                        offenders.push(...findArraysWithoutItems(outputSchema, `${op.operationId}.output`));
                    }
                }
            }

            expect(offenders, `Non-compliant array nodes in ${server}:\n${offenders.join('\n')}`).toEqual([]);
        });

        test(`${server}: every emitted output schema tolerates extra properties (#9837)`, () => {
            const yamlPath  = path.join(repoRoot, 'ai/mcp/server', server, 'openapi.yaml');
            const doc       = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
            const offenders = [];

            for (const [, pathItem] of Object.entries(doc.paths || {})) {
                for (const [, op] of Object.entries(pathItem)) {
                    if (!op?.operationId) continue;

                    const outputZod = buildOutputZodSchema(doc, op);
                    if (!outputZod) continue;

                    offenders.push(...findStrictObjects(toOpenApiJsonSchema(outputZod), `${op.operationId}.output`));
                }
            }

            expect(
                offenders,
                `Strict object nodes in ${server} output schemas (server drift will reject valid responses):\n${offenders.join('\n')}`
            ).toEqual([]);
        });

        test(`${server}: no nested open-bag input objects silently strip payloads (#10070)`, () => {
            const yamlPath  = path.join(repoRoot, 'ai/mcp/server', server, 'openapi.yaml');
            const doc       = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
            const offenders = [];

            for (const [, pathItem] of Object.entries(doc.paths || {})) {
                for (const [, op] of Object.entries(pathItem)) {
                    if (!op?.operationId) continue;

                    const inputSchema = toOpenApiJsonSchema(buildZodSchema(doc, op));
                    offenders.push(...findSilentlyStrippingOpenBags(inputSchema, `${op.operationId}.input`));
                }
            }

            expect(
                offenders,
                `Nested open-bag input nodes in ${server} still strip payloads (Zod strict empty-object default):\n${offenders.join('\n')}`
            ).toEqual([]);
        });

        test(`${server}: every emitted input schema stays strict at the root (regression guard against #9837 overreach)`, () => {
            const yamlPath   = path.join(repoRoot, 'ai/mcp/server', server, 'openapi.yaml');
            const doc        = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
            let   checkedOps = 0;
            let   strictOps  = 0;

            for (const [, pathItem] of Object.entries(doc.paths || {})) {
                for (const [, op] of Object.entries(pathItem)) {
                    if (!op?.operationId) continue;

                    const inputSchema = toOpenApiJsonSchema(buildZodSchema(doc, op));

                    // The root input schema is always `z.object(...)` — should NOT be passthrough.
                    // (Individual nested property objects may legitimately be lenient; we only
                    // guard the top-level contract surface here so agents passing unknown top-level
                    // fields fail fast.)
                    if (inputSchema.type === 'object') {
                        checkedOps++;
                        if (inputSchema.additionalProperties === false) strictOps++;
                    }
                }
            }

            expect(checkedOps, `${server} exposes no object-typed input schemas — audit needed`).toBeGreaterThan(0);
            expect(strictOps, `${server} input-schema strictness must match op count`).toBe(checkedOps);
        });
    }
});
