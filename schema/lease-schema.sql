-- Office Lease Database Schema

CREATE TABLE properties (
    property_id SERIAL PRIMARY KEY,
    property_name VARCHAR(255) NOT NULL,
    address VARCHAR(500) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    zip_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'USA',
    total_square_feet DECIMAL(10,2),
    building_class VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE leases (
    lease_id SERIAL PRIMARY KEY,
    property_id INTEGER REFERENCES properties(property_id),
    tenant_name VARCHAR(255) NOT NULL,
    lease_start_date DATE NOT NULL,
    lease_end_date DATE NOT NULL,
    lease_term_months INTEGER,
    square_feet DECIMAL(10,2),
    monthly_rent DECIMAL(12,2),
    annual_rent DECIMAL(12,2),
    security_deposit DECIMAL(12,2),
    lease_status VARCHAR(50) DEFAULT 'active',
    renewal_option BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lease_payments (
    payment_id SERIAL PRIMARY KEY,
    lease_id INTEGER REFERENCES leases(lease_id),
    payment_date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_type VARCHAR(50),
    payment_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lease_documents (
    document_id SERIAL PRIMARY KEY,
    lease_id INTEGER REFERENCES leases(lease_id),
    document_name VARCHAR(255) NOT NULL,
    document_type VARCHAR(100),
    s3_bucket VARCHAR(255),
    s3_key VARCHAR(500),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_leases_property ON leases(property_id);
CREATE INDEX idx_leases_status ON leases(lease_status);
CREATE INDEX idx_leases_dates ON leases(lease_start_date, lease_end_date);
CREATE INDEX idx_payments_lease ON lease_payments(lease_id);
