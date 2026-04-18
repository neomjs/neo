import {z} from 'zod';

/**
 * Dynamically constructs a Zod schema for a tool's input arguments based on its
 * OpenAPI operation definition. This schema is used for robust runtime validation
 * of incoming tool call arguments.
 * @param {object} openApiDocument - The OpenAPI document object.
 * @param {object} operation       - The OpenAPI operation object.
 * @returns {z.ZodObject} A Zod object schema representing the tool's input.
 */
function buildZodSchema(openApiDocument, operation) {
    const shape = {};

    // Process parameters defined in the OpenAPI operation (path, query, header, etc.).
    if (operation.parameters) {
        for (const param of operation.parameters) {
            let schema = buildZodSchemaFromNode(openApiDocument, param.schema);
            
            // Mark schema as optional if not explicitly required.
            if (!param.required) {
                schema = schema.optional();
            }
            // Add description for better Zod schema introspection.
            if (param.description) {
                schema = schema.describe(param.description);
            }
            shape[param.name] = schema;
        }
    }

    // Process request body properties, typically for POST/PUT operations.
    if (operation.requestBody?.content?.['application/json']?.schema) {
        let requestBodySchema = operation.requestBody.content['application/json'].schema;
        if (requestBodySchema.$ref) {
            requestBodySchema = resolveRef(openApiDocument, requestBodySchema.$ref);
        }

        if (requestBodySchema.properties) {
            const { properties, required = [] } = requestBodySchema;
            for (const [propName, propSchema] of Object.entries(properties)) {
                let schema = buildZodSchemaFromNode(openApiDocument, propSchema);
                
                if (!required.includes(propName)) {
                    schema = schema.optional();
                }
                shape[propName] = schema;
            }
        }
    }
    return z.object(shape);
}

/**
 * Recursively resolves JSON references ($ref) within the OpenAPI document.
 * This is crucial for building complete Zod schemas from potentially fragmented
 * OpenAPI definitions (e.g., schemas defined in 'components').
 * @param {object} doc - The full OpenAPI document.
 * @param {string} ref - The JSON reference string (e.g., '#/components/schemas/MySchema').
 * @returns {object} The resolved schema object.
 */
function resolveRef(doc, ref) {
    // Remove '#/' prefix and split the path into components.
    const parts = ref.substring(2).split('/');
    // Traverse the document object to find the referenced schema.
    return parts.reduce((acc, part) => acc[part], doc);
}

/**
 * Recursively builds a Zod schema from an OpenAPI schema object, handling
 * nested structures and JSON references.
 * @param {object} doc - The full OpenAPI document for reference resolution.
 * @param {object} schema - The OpenAPI schema object (or a resolved reference).
 * @returns {z.ZodType} A Zod schema representing the OpenAPI schema.
 */
function buildZodSchemaFromNode(doc, schema) {
    if (schema.$ref) {
        return buildZodSchemaFromNode(doc, resolveRef(doc, schema.$ref));
    }

    if (schema.oneOf) {
        const options = schema.oneOf.map(s => buildZodSchemaFromNode(doc, s));
        return z.union(options);
    }

    let zodSchema;
    if (schema.type === 'object') {
        const shape = {};
        if (schema.properties) {
            const required = schema.required || [];
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                let propertySchema = buildZodSchemaFromNode(doc, propSchema);
                if (!required.includes(propName)) {
                    propertySchema = propertySchema.optional();
                }
                shape[propName] = propertySchema;
            }
        }
        zodSchema = z.object(shape);

        if (schema.additionalProperties) {
            let additionalSchema;
            if (schema.additionalProperties === true) {
                additionalSchema = z.any();
            } else if (typeof schema.additionalProperties === 'object') {
                additionalSchema = buildZodSchemaFromNode(doc, schema.additionalProperties);
            }

            if (additionalSchema) {
                zodSchema = zodSchema.catchall(additionalSchema);
            }
        }
    } else if (schema.type === 'array') {
        if (schema.items) {
            zodSchema = z.array(buildZodSchemaFromNode(doc, schema.items));
        } else {
            // Fallback for OpenAPI arrays declared without `items`. We use z.unknown() rather than
            // z.any() because zod-to-json-schema with target:'openApi3' emits z.any() as the bare
            // {"type":"array"} (stripping `items` entirely), which strict validators like GitHub
            // Copilot reject. z.unknown() round-trips as {"type":"array","items":{}} — compliant.
            zodSchema = z.array(z.unknown());
        }
    } else if (schema.type === 'string') {
        zodSchema = z.string();
    } else if (schema.type === 'integer') {
        zodSchema = z.number().int();
    } else if (schema.type === 'number') {
        zodSchema = z.number();
    } else if (schema.type === 'boolean') {
        zodSchema = z.boolean();
    } else {
        // Catch-all for schemas without a declared type (e.g. `{}`, or an array `items: {}` sentinel).
        // We use z.unknown() rather than z.any() because zod-to-json-schema with target:'openApi3'
        // strips `items` from z.array(z.any()) but preserves it for z.array(z.unknown()). Runtime
        // validation is identical (both accept any value); only the emitted JSON Schema differs,
        // and only z.unknown() satisfies strict validators like GitHub Copilot's.
        zodSchema = z.unknown();
    }

    if (schema.nullable) {
        zodSchema = zodSchema.nullable();
    }

    if (schema.description) {
        zodSchema = zodSchema.describe(schema.description);
    }

    return zodSchema;
}

/**
 * Constructs a Zod schema for a tool's output based on its OpenAPI operation's
 * successful response (200, 201, or 202). This schema is used to describe the expected
 * output structure to clients.
 * @param {object} doc - The full OpenAPI document for reference resolution.
 * @param {object} operation - The OpenAPI operation object.
 * @returns {z.ZodType|null} A Zod schema for the output, or null if no schema is defined.
 */
function buildOutputZodSchema(doc, operation) {
    const response = operation.responses?.['200'] || operation.responses?.['201'] || operation.responses?.['202'];
    const schema = response?.content?.['application/json']?.schema;

    if (schema) {
        let resolvedSchema = schema;
        if (schema.$ref) {
            resolvedSchema = resolveRef(doc, schema.$ref);
        }

        if (resolvedSchema.type !== 'object') {
            return z.object({ result: buildZodSchemaFromNode(doc, schema) }).describe(schema.description || '');
        }
        return buildZodSchemaFromNode(doc, schema);
    }

    if (response?.content?.['text/plain']) {
        // For text/plain, we need to wrap it in an object for client compatibility
        return z.object({ result: z.string().describe(response.description || '') }).required();
    }

    // If no schema is found, return null to indicate its absence.
    return null;
}

export {
    buildZodSchema,
    buildOutputZodSchema,
    resolveRef
};
