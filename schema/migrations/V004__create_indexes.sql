-- V004: Create indexes for performance optimization

-- GIST indexes on daterange columns for efficient range queries
CREATE INDEX idx_lease_version_daterange ON lease_version USING GIST (effective_daterange);
CREATE INDEX idx_rent_schedule_daterange ON rent_schedule USING GIST (period_daterange);
CREATE INDEX idx_option_window_daterange ON option USING GIST (window_daterange);
CREATE INDEX idx_concession_daterange ON concession USING GIST (applies_daterange);

-- B-tree indexes on foreign keys for join performance
CREATE INDEX idx_suite_property_id ON suite(property_id);
CREATE INDEX idx_lease_property_id ON lease(property_id);
CREATE INDEX idx_lease_landlord_id ON lease(landlord_id);
CREATE INDEX idx_lease_tenant_id ON lease(tenant_id);
CREATE INDEX idx_lease_version_lease_id ON lease_version(lease_id);
CREATE INDEX idx_lease_version_suite_id ON lease_version(suite_id);
CREATE INDEX idx_rent_schedule_version_id ON rent_schedule(lease_version_id);
CREATE INDEX idx_opex_version_id ON opex_pass_through(lease_version_id);
CREATE INDEX idx_option_version_id ON option(lease_version_id);
CREATE INDEX idx_concession_version_id ON concession(lease_version_id);
CREATE INDEX idx_critical_date_lease_id ON critical_date(lease_id);
CREATE INDEX idx_doc_link_lease_id ON doc_link(lease_id);

-- Partial unique index to enforce exactly one current version per lease
CREATE UNIQUE INDEX idx_lease_version_current ON lease_version(lease_id) WHERE is_current = TRUE;

-- Composite indexes for common query patterns
CREATE INDEX idx_critical_date_lease_kind ON critical_date(lease_id, kind);
CREATE INDEX idx_party_type_active ON party(party_type, active);
CREATE INDEX idx_property_active ON property(active);

-- Index on critical_date.date_value for upcoming dates queries
CREATE INDEX idx_critical_date_value ON critical_date(date_value);
