-- V005: Create reporting views

-- Helper view: Current lease with current version details
CREATE VIEW vw_current_lease AS
SELECT 
    l.lease_id,
    l.property_id,
    l.landlord_id,
    l.tenant_id,
    l.master_lease_num,
    l.execution_date,
    lv.lease_version_id,
    lv.version_num,
    lv.effective_daterange,
    lv.suite_id,
    lv.premises_rsf,
    lv.term_months,
    lv.base_year,
    lv.escalation_method,
    lv.currency_code,
    lv.notes
FROM lease l
INNER JOIN lease_version lv ON l.lease_id = lv.lease_id
WHERE lv.is_current = TRUE;

-- Helper view: Lease expiration date resolution
CREATE VIEW vw_lease_expiration AS
SELECT 
    l.lease_id,
    l.master_lease_num,
    COALESCE(
        (SELECT cd.date_value 
         FROM critical_date cd 
         WHERE cd.lease_id = l.lease_id 
         AND cd.kind = 'EXPIRATION' 
         LIMIT 1),
        UPPER(lv.effective_daterange) - INTERVAL '1 day'
    )::DATE AS expiration_date
FROM lease l
INNER JOIN lease_version lv ON l.lease_id = lv.lease_id
WHERE lv.is_current = TRUE;

-- View 1: Expirations pipeline
CREATE VIEW vw_expirations AS
SELECT 
    cl.lease_id,
    cl.master_lease_num,
    t.legal_name AS tenant_name,
    p.name AS property_name,
    p.state,
    le.expiration_date,
    EXTRACT(EPOCH FROM (le.expiration_date - CURRENT_DATE)) / (30 * 86400) AS months_to_expiration
FROM vw_current_lease cl
INNER JOIN vw_lease_expiration le ON cl.lease_id = le.lease_id
INNER JOIN party t ON cl.tenant_id = t.party_id
INNER JOIN property p ON cl.property_id = p.property_id
WHERE le.expiration_date >= CURRENT_DATE;

-- View 2: Current month rent roll
CREATE VIEW vw_rent_roll_current AS
SELECT 
    cl.lease_id,
    cl.master_lease_num,
    t.legal_name AS tenant_name,
    p.name AS property_name,
    LOWER(rs.period_daterange) AS period_start,
    UPPER(rs.period_daterange) AS period_end,
    rs.basis,
    rs.amount,
    CASE 
        WHEN rs.basis = 'YEAR' THEN rs.amount / 12
        ELSE rs.amount
    END AS monthly_equiv,
    CASE 
        WHEN rs.basis = 'MONTH' THEN rs.amount * 12
        ELSE rs.amount
    END AS annualized_equiv
FROM vw_current_lease cl
INNER JOIN rent_schedule rs ON cl.lease_version_id = rs.lease_version_id
INNER JOIN party t ON cl.tenant_id = t.party_id
INNER JOIN property p ON cl.property_id = p.property_id
WHERE rs.period_daterange @> CURRENT_DATE;

-- View 3: Options status
CREATE VIEW vw_options_status AS
SELECT 
    cl.lease_id,
    cl.master_lease_num,
    t.legal_name AS tenant_name,
    p.name AS property_name,
    o.option_type,
    LOWER(o.window_daterange) AS window_start,
    UPPER(o.window_daterange) AS window_end,
    o.window_daterange @> CURRENT_DATE AS notice_window_open,
    o.terms,
    o.exercised,
    o.exercised_date
FROM vw_current_lease cl
INNER JOIN option o ON cl.lease_version_id = o.lease_version_id
INNER JOIN party t ON cl.tenant_id = t.party_id
INNER JOIN property p ON cl.property_id = p.property_id;

-- View 4: Free rent status
CREATE VIEW vw_free_rent_status AS
SELECT 
    cl.lease_id,
    cl.master_lease_num,
    t.legal_name AS tenant_name,
    p.name AS property_name,
    LOWER(c.applies_daterange) AS free_rent_start,
    UPPER(c.applies_daterange) AS free_rent_end,
    c.value_amount,
    c.value_basis,
    EXTRACT(EPOCH FROM (UPPER(c.applies_daterange) - CURRENT_DATE)) / (30 * 86400) AS approx_months_remaining
FROM vw_current_lease cl
INNER JOIN concession c ON cl.lease_version_id = c.lease_version_id
INNER JOIN party t ON cl.tenant_id = t.party_id
INNER JOIN property p ON cl.property_id = p.property_id
WHERE c.kind = 'FREE_RENT'
AND UPPER(c.applies_daterange) > CURRENT_DATE;

-- View 5: TI allowance summary
CREATE VIEW vw_ti_allowance_summary AS
SELECT 
    cl.lease_id,
    cl.master_lease_num,
    t.legal_name AS tenant_name,
    p.name AS property_name,
    SUM(c.value_amount) AS total_ti_amount
FROM vw_current_lease cl
INNER JOIN concession c ON cl.lease_version_id = c.lease_version_id
INNER JOIN party t ON cl.tenant_id = t.party_id
INNER JOIN property p ON cl.property_id = p.property_id
WHERE c.kind = 'TI_ALLOWANCE'
GROUP BY cl.lease_id, cl.master_lease_num, t.legal_name, p.name;

-- View 6: Critical dates upcoming (180 days)
CREATE VIEW vw_critical_dates_upcoming AS
SELECT 
    l.lease_id,
    l.master_lease_num,
    t.legal_name AS tenant_name,
    p.name AS property_name,
    cd.kind,
    cd.date_value
FROM lease l
INNER JOIN critical_date cd ON l.lease_id = cd.lease_id
INNER JOIN party t ON l.tenant_id = t.party_id
INNER JOIN property p ON l.property_id = p.property_id
WHERE cd.date_value BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '180 days'
ORDER BY cd.date_value;

-- View 7: Amendment history
CREATE VIEW vw_amendment_history AS
SELECT 
    l.lease_id,
    l.master_lease_num,
    lv.lease_version_id,
    lv.version_num,
    LOWER(lv.effective_daterange) AS effective_start,
    UPPER(lv.effective_daterange) AS effective_end,
    lv.is_current
FROM lease l
INNER JOIN lease_version lv ON l.lease_id = lv.lease_id
ORDER BY l.lease_id, lv.version_num;

-- View 8: OpEx summary
CREATE VIEW vw_opex_summary AS
SELECT 
    cl.lease_id,
    cl.master_lease_num,
    p.name AS property_name,
    o.method,
    o.stop_amount,
    o.gross_up_pct
FROM vw_current_lease cl
INNER JOIN opex_pass_through o ON cl.lease_version_id = o.lease_version_id
INNER JOIN property p ON cl.property_id = p.property_id;
