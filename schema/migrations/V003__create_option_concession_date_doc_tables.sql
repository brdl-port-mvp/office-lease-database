-- V003: Create option, concession, critical_date, doc_link tables

-- Option table: renewal, termination, expansion, ROFR options
CREATE TABLE option (
    option_id SERIAL PRIMARY KEY,
    lease_version_id INTEGER NOT NULL,
    option_type VARCHAR(50) NOT NULL,
    window_daterange DATERANGE NOT NULL,
    terms TEXT,
    exercised BOOLEAN DEFAULT FALSE,
    exercised_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_option_version FOREIGN KEY (lease_version_id) 
        REFERENCES lease_version(lease_version_id) ON DELETE RESTRICT,
    CONSTRAINT chk_option_type CHECK (option_type IN ('RENEWAL', 'TERMINATION', 'EXPANSION', 'ROFR', 'OTHER'))
);

-- Concession table: TI allowances and free rent
CREATE TABLE concession (
    concession_id SERIAL PRIMARY KEY,
    lease_version_id INTEGER NOT NULL,
    kind VARCHAR(50) NOT NULL,
    value_amount NUMERIC(15, 2),
    value_basis VARCHAR(20),
    applies_daterange DATERANGE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_concession_version FOREIGN KEY (lease_version_id) 
        REFERENCES lease_version(lease_version_id) ON DELETE RESTRICT,
    CONSTRAINT chk_concession_kind CHECK (kind IN ('TI_ALLOWANCE', 'FREE_RENT', 'OTHER')),
    CONSTRAINT chk_value_basis CHECK (value_basis IN ('TOTAL', 'PER_SF'))
);

-- Critical Date table: key milestone dates
CREATE TABLE critical_date (
    crit_id SERIAL PRIMARY KEY,
    lease_id INTEGER NOT NULL,
    kind VARCHAR(50) NOT NULL,
    date_value DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_critical_date_lease FOREIGN KEY (lease_id) 
        REFERENCES lease(lease_id) ON DELETE RESTRICT,
    CONSTRAINT chk_critical_kind CHECK (kind IN ('COMMENCEMENT', 'RENT_START', 'EXPIRATION', 'NOTICE', 'OTHER'))
);

-- Document Link table: references to external documents
CREATE TABLE doc_link (
    doc_id SERIAL PRIMARY KEY,
    lease_id INTEGER NOT NULL,
    label VARCHAR(255),
    external_ref TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_doc_link_lease FOREIGN KEY (lease_id) 
        REFERENCES lease(lease_id) ON DELETE RESTRICT
);
