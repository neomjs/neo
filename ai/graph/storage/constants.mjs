/**
 * @module ai/graph/storage/constants
 * @summary Shared configuration constants for Memory Core storage.
 */

/**
 * Limits the number of parameters used in SQLite IN (...) clauses to prevent
 * "too many SQL variables" errors across the Memory Core and wake daemon.
 * @type {Number}
 */
export const SQLITE_IN_CLAUSE_BATCH_SIZE = 400;
