-- V002: Create lease detail tables (lease_version, rent_schedule, opex_pass_through)

-- Lease Version table: tracks original lease and amendments
CREATE TABLE lease_version (
    lease_version_id SERIAL PRIMARY KEY,
    lease_id INTEGER NOT NULL,
    version_num INTEGER NOT NULL DEFAULT 0,
    effective_daterange DATERANGE NOT NULL,
    suite_id INTEGER,
    premises_rsf INTEGER,
    term_months INTEGER,
    base_year INTEGER,
    escalation_method VARCHAR(50),
    currency_code VARCHAR(3) DEFAULT 'USD',
    is_current BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lease_version_lease FOREIGN KEY (lease_id) 
        REFERENCES lease(lease_id) ON DELETE RESTRICT,
    CONSTRAINT fk_lease_version_suite FOREIGN KEY (suite_id) 
        REFERENCES suite(suite_id) ON DELETE RESTRICT,
    CONSTRAINT chk_escalation_method CHECK (escalation_method IN ('CPI', 'FIXED', 'BASE_YEAR', 'NNN', 'OTHER')),
    CONSTRAINT chk_currency_code CHECK (currency_code = 'USD')
);

-- Rent Schedule table: base rent periods with amounts
CREATE TABLE rent_schedule (
    rent_id SERIAL PRIMARY KEY,
    lease_version_id INTEGER NOT NULL,
    period_daterange DATERANGE NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    basis VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_rent_schedule_version FOREIGN KEY (lease_version_id) 
        REFERENCES lease_version(lease_version_id) ON DELETE RESTRICT,
    CONSTRAINT chk_basis CHECK (basis IN ('MONTH', 'YEAR')),
    -- Exclusion constraint to prevent overlapping periods per lease_version
    EXCLUDE USING GIST (lease_version_id WITH =, period_daterange WITH &&)
);

-- OpEx Pass-Through table: operating expense recovery configuration
CREATE TABLE opex_pass_through (
    opex_id SERIAL PRIMARY KEY,
    lease_version_id INTEGER NOT NULL,
    method VARCHAR(50) NOT NULL,
    stop_amount NUMERIC(15, 2),
    gross_up_pct NUMERIC(5, 2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_opex_version FOREIGN KEY (lease_version_id) 
        REFERENCES lease_version(lease_version_id) ON DELETE RESTRICT,
    CONSTRAINT chk_opex_method CHECK (method IN ('BASE_YEAR', 'EXPENSE_STOP', 'NNN', 'OTHER'))
);
