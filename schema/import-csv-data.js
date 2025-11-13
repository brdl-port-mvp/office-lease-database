#!/usr/bin/env node

/**
 * CSV Data Importer for Office Lease Database
 * Imports your actual lease data from CSV files
 * 
 * Usage:
 *   node schema/import-csv-data.js <csv-file-path>
 * 
 * Example:
 *   node schema/import-csv-data.js my-lease-data.csv
 */

const fs = require('fs');
const { parse } = require('csv-parse/sync');

// Check command line arguments
if (process.argv.length < 3) {
  console.error('Usage: node import-csv-data.js <csv-file-path>');
  console.error('Example: node import-csv-data.js my-lease-data.csv');
  process.exit(1);
}

const csvFilePath = process.argv[2];

// Check if file exists
if (!fs.existsSync(csvFilePath)) {
  console.error(`Error: File not found: ${csvFilePath}`);
  process.exit(1);
}

// Read and parse CSV
console.log(`Reading CSV file: ${csvFilePath}`);
const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
const records = parse(csvContent, {
  columns: true,
  skip_empty_lines: true,
  trim: true
});

console.log(`Found ${records.length} records`);
console.log('Columns:', Object.keys(records[0]).join(', '));
console.log('');

// Helper functions
function escapeSQL(str) {
  if (str === null || str === undefined || str === '') return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'NULL';
  // Try to parse various date formats
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'NULL';
  return `'${date.toISOString().split('T')[0]}'`;
}

function formatNumber(numStr) {
  if (!numStr || numStr === '') return 'NULL';
  const num = parseFloat(String(numStr).replace(/[$,]/g, ''));
  return isNaN(num) ? 'NULL' : num;
}

// Start SQL output
console.log('-- CSV Data Import');
console.log('-- Generated:', new Date().toISOString());
console.log('-- Source:', csvFilePath);
console.log('-- Records:', records.length);
console.log('');
console.log('BEGIN;');
console.log('');

// Track unique entities
const properties = new Map();
const parties = new Map();
const suites = new Map();
let propertyId = 1;
let partyId = 1;
let suiteId = 1;
let leaseId = 1;

// First pass: collect unique properties, parties, and suites
records.forEach(record => {
  // Extract property info (customize these field names to match your CSV)
  const propertyKey = [
    record.property_name || record.property || record.building,
    record.property_address || record.address,
    record.city,
    record.state
  ].filter(Boolean).join('|');
  
  if (propertyKey && !properties.has(propertyKey)) {
    properties.set(propertyKey, {
      id: propertyId++,
      name: record.property_name || record.property || record.building || 'Unknown Property',
      address: record.property_address || record.address || '',
      city: record.city || '',
      state: record.state || '',
      postalCode: record.postal_code || record.zip || '',
      totalRsf: formatNumber(record.property_rsf || record.building_size || 0)
    });
  }
  
  // Extract landlord
  const landlordName = record.landlord || record.landlord_name || 'Unknown Landlord';
  if (!parties.has(landlordName)) {
    parties.set(landlordName, {
      id: partyId++,
      name: landlordName,
      type: 'LANDLORD'
    });
  }
  
  // Extract tenant
  const tenantName = record.tenant || record.tenant_name || 'Unknown Tenant';
  if (!parties.has(tenantName)) {
    parties.set(tenantName, {
      id: partyId++,
      name: tenantName,
      type: 'TENANT'
    });
  }
  
  // Extract suite
  const suiteKey = propertyKey + '|' + (record.suite || record.suite_number || record.unit);
  if (suiteKey && !suites.has(suiteKey)) {
    const property = properties.get(propertyKey);
    suites.set(suiteKey, {
      id: suiteId++,
      propertyId: property.id,
      suiteCode: record.suite || record.suite_number || record.unit || 'N/A',
      rsf: formatNumber(record.rsf || record.square_feet || record.size || 0)
    });
  }
});

// Generate SQL for properties
if (properties.size > 0) {
  console.log('-- Properties');
  console.log('INSERT INTO property (property_id, name, address, city, state, postal_code, country, total_rsf, active) VALUES');
  
  const propertyArray = Array.from(properties.values());
  propertyArray.forEach((prop, idx) => {
    const comma = idx < propertyArray.length - 1 ? ',' : ';';
    console.log(`  (${prop.id}, ${escapeSQL(prop.name)}, ${escapeSQL(prop.address)}, ${escapeSQL(prop.city)}, ${escapeSQL(prop.state)}, ${escapeSQL(prop.postalCode)}, 'USA', ${prop.totalRsf}, true)${comma}`);
  });
  console.log('');
}

// Generate SQL for parties
if (parties.size > 0) {
  console.log('-- Parties');
  console.log('INSERT INTO party (party_id, legal_name, party_type, active) VALUES');
  
  const partyArray = Array.from(parties.values());
  partyArray.forEach((party, idx) => {
    const comma = idx < partyArray.length - 1 ? ',' : ';';
    console.log(`  (${party.id}, ${escapeSQL(party.name)}, '${party.type}', true)${comma}`);
  });
  console.log('');
}

// Generate SQL for suites
if (suites.size > 0) {
  console.log('-- Suites');
  console.log('INSERT INTO suite (suite_id, property_id, suite_code, rsf) VALUES');
  
  const suiteArray = Array.from(suites.values());
  suiteArray.forEach((suite, idx) => {
    const comma = idx < suiteArray.length - 1 ? ',' : ';';
    console.log(`  (${suite.id}, ${suite.propertyId}, ${escapeSQL(suite.suiteCode)}, ${suite.rsf})${comma}`);
  });
  console.log('');
}

// Generate SQL for leases
console.log('-- Leases');
console.log('INSERT INTO lease (lease_id, property_id, landlord_id, tenant_id, master_lease_num, execution_date) VALUES');

records.forEach((record, idx) => {
  const propertyKey = [
    record.property_name || record.property || record.building,
    record.property_address || record.address,
    record.city,
    record.state
  ].filter(Boolean).join('|');
  
  const property = properties.get(propertyKey);
  const landlord = parties.get(record.landlord || record.landlord_name || 'Unknown Landlord');
  const tenant = parties.get(record.tenant || record.tenant_name || 'Unknown Tenant');
  
  const masterLeaseNum = record.lease_number || record.lease_id || `LEASE-${leaseId}`;
  const executionDate = formatDate(record.execution_date || record.signed_date || record.lease_date);
  
  const comma = idx < records.length - 1 ? ',' : ';';
  console.log(`  (${leaseId}, ${property.id}, ${landlord.id}, ${tenant.id}, ${escapeSQL(masterLeaseNum)}, ${executionDate})${comma}`);
  leaseId++;
});

console.log('');

// Generate SQL for lease versions
console.log('-- Lease Versions');
console.log('INSERT INTO lease_version (lease_version_id, lease_id, version_num, effective_daterange, suite_id, premises_rsf, term_months, base_year, escalation_method, currency_code, is_current, notes) VALUES');

leaseId = 1;
records.forEach((record, idx) => {
  const propertyKey = [
    record.property_name || record.property || record.building,
    record.property_address || record.address,
    record.city,
    record.state
  ].filter(Boolean).join('|');
  
  const suiteKey = propertyKey + '|' + (record.suite || record.suite_number || record.unit);
  const suite = suites.get(suiteKey);
  
  const startDate = record.start_date || record.commencement_date || record.lease_start;
  const endDate = record.end_date || record.expiration_date || record.lease_end;
  const effectiveDaterange = startDate && endDate ? `[${startDate},${endDate})` : 'NULL';
  
  const premisesRsf = formatNumber(record.rsf || record.square_feet || record.size || 0);
  const termMonths = formatNumber(record.term_months || record.lease_term || 60);
  const baseYear = record.base_year || (startDate ? new Date(startDate).getFullYear() : new Date().getFullYear());
  const escalationMethod = record.escalation_method || record.escalation || 'FIXED';
  
  const comma = idx < records.length - 1 ? ',' : ';';
  console.log(`  (${leaseId}, ${leaseId}, 0, ${escapeSQL(effectiveDaterange)}, ${suite.id}, ${premisesRsf}, ${termMonths}, ${baseYear}, ${escapeSQL(escalationMethod)}, 'USD', true, 'Imported from CSV')${comma}`);
  leaseId++;
});

console.log('');

// Generate SQL for rent schedules (if rent data exists)
console.log('-- Rent Schedules');
console.log('INSERT INTO rent_schedule (rent_id, lease_version_id, period_daterange, amount, basis) VALUES');

let rentId = 1;
leaseId = 1;
records.forEach((record, idx) => {
  const startDate = record.start_date || record.commencement_date || record.lease_start;
  const endDate = record.end_date || record.expiration_date || record.lease_end;
  
  if (startDate && endDate) {
    const periodDaterange = `[${startDate},${endDate})`;
    const amount = formatNumber(record.monthly_rent || record.rent || record.base_rent || 0);
    const basis = record.rent_basis || 'MONTH';
    
    const comma = idx < records.length - 1 ? ',' : ';';
    console.log(`  (${rentId}, ${leaseId}, ${escapeSQL(periodDaterange)}, ${amount}, ${escapeSQL(basis)})${comma}`);
    rentId++;
  }
  leaseId++;
});

console.log('');

// Update sequences
console.log('-- Update sequences');
console.log(`SELECT setval('property_property_id_seq', ${propertyId - 1});`);
console.log(`SELECT setval('party_party_id_seq', ${partyId - 1});`);
console.log(`SELECT setval('suite_suite_id_seq', ${suiteId - 1});`);
console.log(`SELECT setval('lease_lease_id_seq', ${leaseId - 1});`);
console.log(`SELECT setval('lease_version_lease_version_id_seq', ${leaseId - 1});`);
console.log(`SELECT setval('rent_schedule_rent_id_seq', ${rentId - 1});`);

console.log('');
console.log('COMMIT;');
console.log('');
console.log('-- Import complete');
console.log(`-- Properties: ${properties.size}`);
console.log(`-- Parties: ${parties.size}`);
console.log(`-- Suites: ${suites.size}`);
console.log(`-- Leases: ${leaseId - 1}`);
