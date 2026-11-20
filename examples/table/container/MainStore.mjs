import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

const INITIAL_DATA = [{
    id           : 'compute',
    specification: 'Dedicated compute',
    area         : 'Compute',
    starter      : '2 shared vCPU',
    production   : '8–64 dedicated vCPU',
    notes        : 'Pinned physical cores prevent noisy-neighbor jitter during peak OLTP bursts.'
}, {
    id           : 'storage',
    specification: 'NVMe volume',
    area         : 'Storage',
    starter      : '50 GB SSD',
    production   : '4 TB NVMe RAID-10',
    notes        : 'Online volume expansion with sustained 64,000 IOPS and checksummed pages.'
}, {
    id           : 'pitr',
    specification: 'Point-in-time recovery',
    area         : 'Backups',
    starter      : '24 h window',
    production   : '35-day continuous WAL',
    notes        : 'Restore to any transaction timestamp in an isolated branch before promotion.'
}, {
    id           : 'replicas',
    specification: 'Read replicas',
    area         : 'HA',
    starter      : 'None',
    production   : 'Up to 5 async replicas',
    notes        : 'Cross-zone or cross-region followers with automatic read-endpoint routing.'
}, {
    id           : 'failover',
    specification: 'Automated failover',
    area         : 'HA',
    starter      : 'Single-AZ restart',
    production   : 'Multi-AZ < 30 s',
    notes        : 'Quorum consensus promotes a warm standby without changing client DNS.'
}, {
    id           : 'pooling',
    specification: 'Connection pooling',
    area         : 'Pool',
    starter      : '100 direct sessions',
    production   : '10,000 pooled clients',
    notes        : 'Built-in PgBouncer transaction pooling multiplexes serverless spikes.'
}, {
    id           : 'tls',
    specification: 'Encryption & KMS',
    area         : 'Security',
    starter      : 'Managed TLS 1.3',
    production   : 'Customer KMS (BYOK)',
    notes        : 'Envelope encryption at rest with instant revocation through AWS or GCP KMS.'
}, {
    id           : 'network',
    specification: 'Network isolation',
    area         : 'Network',
    starter      : 'IP allowlist',
    production   : 'PrivateLink / VPC peer',
    notes        : 'Traffic stays on private backbone interfaces with zero public IPv4 exposure.'
}, {
    id           : 'audit',
    specification: 'Audit log retention',
    area         : 'Security',
    starter      : '7 days',
    production   : '365 days immutable',
    notes        : 'Streams pgaudit DDL and role-grant events to tamper-evident object storage.'
}, {
    id           : 'metrics',
    specification: 'Telemetry & alerting',
    area         : 'Ops',
    starter      : '5 min metrics',
    production   : '10 s Prometheus + OTel',
    notes        : 'Per-query wait-event histograms and PagerDuty or webhook threshold alerts.'
}, {
    id           : 'maintenance',
    specification: 'Maintenance window',
    area         : 'Ops',
    starter      : 'Weekly rolling',
    production   : 'Pinned window + canary',
    notes        : 'Minor engine patches apply on replicas first before a controlled switchover.'
}, {
    id           : 'extensions',
    specification: 'Extensions catalog',
    area         : 'Compute',
    starter      : '12 core extensions',
    production   : '45 vetted + pgvector',
    notes        : 'Includes PostGIS, pgvector HNSW indexing, pg_partman, and pg_stat_statements.'
}, {
    id           : 'residency',
    specification: 'Data residency',
    area         : 'Compliance',
    starter      : 'US-East or EU-Central',
    production   : '14 sovereign regions',
    notes        : 'Backups, WAL segments, and telemetry remain inside the selected jurisdiction.'
}, {
    id           : 'sla',
    specification: 'Uptime & support SLA',
    area         : 'SLA',
    starter      : '99.5% · business hours',
    production   : '99.99% · 24/7 < 15 min',
    notes        : 'Backed by service credits and direct routing to on-call database engineers.'
}];

/**
 * @summary Local 14-row managed database specification dataset demonstrating content-sized table columns.
 * @class Neo.examples.table.container.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static initialData = INITIAL_DATA

    static config = {
        className  : 'Neo.examples.table.container.MainStore',
        keyProperty: 'id',
        model      : Model,
        data       : INITIAL_DATA
    }
}

export default Neo.setupClass(MainStore);
