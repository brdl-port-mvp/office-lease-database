-- V001: Create core tables (property, suite, party, lease)

-- Property table: stores building/site information
CREATE TABLE property (
    property_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'USA',
    total_rsf INTEGER,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Suite table: subdivided rentable spaces within properties
CREATE TABLE suite (
    suite_id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL,
    suite_code VARCHAR(50) NOT NULL,
    rsf INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_suite_property FOREIGN KEY (property_id) 
        REFERENCES property(property_id) ON DELETE RESTRICT,
    CONSTRAINT uq_suite_property_code UNIQUE (property_id, suite_code)
);

-- Party table: tenants, landlords, guarantors
CREATE TABLE party (
    party_id SERIAL PRIMARY KEY,
    legal_name VARCHAR(500) NOT NULL,
    party_type VARCHAR(50) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_party_type CHECK (party_type IN ('TENANT', 'LANDLORD', 'SUBLANDLORD', 'GUARANTOR'))
);

-- Lease table: contract shell linking tenant, landlord, and property
CREATE TABLE lease (
    lease_id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL,
    landlord_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    master_lease_num VARCHAR(100) NOT NULL,
    execution_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lease_property FOREIGN KEY (property_id) 
        REFERENCES property(property_id) ON DELETE RESTRICT,
    CONSTRAINT fk_lease_landlord FOREIGN KEY (landlord_id) 
        REFERENCES party(party_id) ON DELETE RESTRICT,
    CONSTRAINT fk_lease_tenant FOREIGN KEY (tenant_id) 
        REFERENCES party(party_id) ON DELETE RESTRICT,
    CONSTRAINT uq_lease_property_num UNIQUE (property_id, master_lease_num)
);
