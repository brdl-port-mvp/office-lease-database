#!/usr/bin/env node

/**
 * Seed Data Generator for Office Lease Database
 * Generates 300 anonymized lease records with realistic data
 * 
 * Usage:
 *   node schema/seed-data.js > schema/seed-data.sql
 *   psql -d officeLeaseDB -f schema/seed-data.sql
 */

// Configuration
const NUM_PROPERTIES = 50;
const NUM_SUITES_PER_PROPERTY = 6; // Average
const NUM_PARTIES = 150;
const NUM_LEASES = 300;

// Helper functions
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(array) {
  return array[randomInt(0, array.length - 1)];
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Data generators
const states = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI'];
const cities = {
  'CA': ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose'],
  'NY': ['New York', 'Buffalo', 'Rochester', 'Albany'],
  'TX': ['Houston', 'Dallas', 'Austin', 'San Antonio'],
  'FL': ['Miami', 'Tampa', 'Orlando', 'Jacksonville'],
  'IL': ['Chicago', 'Springfield', 'Naperville'],
  'PA': ['Philadelphia', 'Pittsburgh', 'Allentown'],
  'OH': ['Columbus', 'Cleveland', 'Cincinnati'],
  'GA': ['Atlanta', 'Savannah', 'Augusta'],
  'NC': ['Charlotte', 'Raleigh', 'Durham'],
  'MI': ['Detroit', 'Grand Rapids', 'Ann Arbor']
};

const streetNames = ['Main', 'Market', 'Broadway', 'Park', 'Oak', 'Maple', 'Washington', 'Lake', 'Hill', 'Spring'];
const streetTypes = ['St', 'Ave', 'Blvd', 'Dr', 'Ln', 'Way', 'Ct', 'Pl'];

const companyPrefixes = ['Acme', 'Global', 'Metro', 'United', 'Premier', 'Elite', 'Summit', 'Apex', 'Zenith', 'Pinnacle'];
const companySuffixes = ['Corp', 'Inc', 'LLC', 'Group', 'Partners', 'Enterprises', 'Holdings', 'Solutions', 'Services', 'Industries'];
const companyTypes = ['Tech', 'Financial', 'Consulting', 'Manufacturing', 'Retail', 'Healthcare', 'Legal', 'Marketing', 'Real Estate', 'Insurance'];

const escalationMethods = ['CPI', 'FIXED', 'BASE_YEAR', 'NNN'];
const opexMethods = ['BASE_YEAR', 'EXPENSE_STOP', 'NNN'];
const optionTypes = ['RENEWAL', 'TERMINATION', 'EXPANSION', 'ROFR'];

// Generate SQL
console.log('-- Seed Data for Office Lease Database');
console.log('-- Generated:', new Date().toISOString());
console.log('-- Records: 300 leases with full details\n');

console.log('BEGIN;\n');

// 1. Generate Properties
console.log('-- Properties');
console.log('INSERT INTO property (property_id, name, address, city, state, postal_code, country, total_rsf, active) VALUES');

const properties = [];
for (let i = 1; i <= NUM_PROPERTIES; i++) {
  const state = randomChoice(states);
  const city = randomChoice(cities[state]);
  const streetNum = randomInt(100, 9999);
  const streetName = randomChoice(streetNames);
  const streetType = randomChoice(streetTypes);
  const address = `${streetNum} ${streetName} ${streetType}`;
  const postalCode = randomInt(10000, 99999);
  const totalRsf = randomInt(50000, 500000);
  const active = Math.random() > 0.1; // 90% active
  
  properties.push({
    id: i,
    name: `${city} ${streetName} Tower`,
    address,
    city,
    state,
    postalCode,
    totalRsf,
    active
  });
  
  const comma = i < NUM_PROPERTIES ? ',' : ';';
  console.log(`  (${i}, '${city} ${streetName} Tower', '${address}', '${city}', '${state}', '${postalCode}', 'USA', ${totalRsf}, ${active})${comma}`);
}

console.log();

// 2. Generate Suites
console.log('-- Suites');
console.log('INSERT INTO suite (suite_id, property_id, suite_code, rsf) VALUES');

const suites = [];
let suiteId = 1;
for (const property of properties) {
  const numSuites = randomInt(3, 10);
  for (let i = 0; i < numSuites; i++) {
    const floor = randomInt(1, 20);
    const suiteNum = randomInt(1, 20) * 100;
    const suiteCode = `${floor}${suiteNum.toString().padStart(2, '0')}`;
    const rsf = randomInt(2000, 20000);
    
    suites.push({
      id: suiteId,
      propertyId: property.id,
      suiteCode,
      rsf
    });
    
    const comma = suiteId < properties.length * 6 ? ',' : ';';
    console.log(`  (${suiteId}, ${property.id}, '${suiteCode}', ${rsf})${comma}`);
    suiteId++;
  }
}

console.log();

// 3. Generate Parties
console.log('-- Parties');
console.log('INSERT INTO party (party_id, legal_name, party_type, active) VALUES');

const parties = [];
const partyTypes = ['TENANT', 'LANDLORD', 'GUARANTOR'];

// Generate landlords first
for (let i = 1; i <= 20; i++) {
  const prefix = randomChoice(companyPrefixes);
  const suffix = randomChoice(companySuffixes);
  const name = `${prefix} Properties ${suffix}`;
  
  parties.push({
    id: i,
    name,
    type: 'LANDLORD',
    active: true
  });
  
  console.log(`  (${i}, '${name}', 'LANDLORD', true),`);
}

// Generate tenants
for (let i = 21; i <= NUM_PARTIES; i++) {
  const prefix = randomChoice(companyPrefixes);
  const type = randomChoice(companyTypes);
  const suffix = randomChoice(companySuffixes);
  const name = `${prefix} ${type} ${suffix}`;
  const partyType = Math.random() > 0.9 ? 'GUARANTOR' : 'TENANT';
  const active = Math.random() > 0.05; // 95% active
  
  parties.push({
    id: i,
    name,
    type: partyType,
    active
  });
  
  const comma = i < NUM_PARTIES ? ',' : ';';
  console.log(`  (${i}, '${name}', '${partyType}', ${active})${comma}`);
}

console.log();

// 4. Generate Leases
console.log('-- Leases');
console.log('INSERT INTO lease (lease_id, property_id, landlord_id, tenant_id, master_lease_num, execution_date) VALUES');

const leases = [];
const landlords = parties.filter(p => p.type === 'LANDLORD');
const tenants = parties.filter(p => p.type === 'TENANT');

for (let i = 1; i <= NUM_LEASES; i++) {
  const property = randomChoice(properties);
  const landlord = randomChoice(landlords);
  const tenant = randomChoice(tenants);
  const masterLeaseNum = `ML-${property.id.toString().padStart(3, '0')}-${i.toString().padStart(4, '0')}`;
  const executionDate = formatDate(randomDate(new Date(2015, 0, 1), new Date(2024, 11, 31)));
  
  leases.push({
    id: i,
    propertyId: property.id,
    landlordId: landlord.id,
    tenantId: tenant.id,
    masterLeaseNum,
    executionDate
  });
  
  const comma = i < NUM_LEASES ? ',' : ';';
  console.log(`  (${i}, ${property.id}, ${landlord.id}, ${tenant.id}, '${masterLeaseNum}', '${executionDate}')${comma}`);
}

console.log();

// 5. Generate Lease Versions
console.log('-- Lease Versions');
console.log('INSERT INTO lease_version (lease_version_id, lease_id, version_num, effective_daterange, suite_id, premises_rsf, term_months, base_year, escalation_method, currency_code, is_current, notes) VALUES');

const leaseVersions = [];
let versionId = 1;

for (const lease of leases) {
  const propertySuites = suites.filter(s => s.propertyId === lease.propertyId);
  if (propertySuites.length === 0) continue;
  
  const suite = randomChoice(propertySuites);
  const numVersions = randomInt(1, 4); // 1-3 amendments
  
  const startDate = new Date(lease.executionDate);
  const termMonths = randomInt(36, 120); // 3-10 years
  
  for (let v = 0; v < numVersions; v++) {
    const versionStartDate = v === 0 ? startDate : addMonths(startDate, v * 12);
    const versionEndDate = v === numVersions - 1 
      ? addMonths(startDate, termMonths)
      : addMonths(versionStartDate, 12);
    
    const effectiveDaterange = `[${formatDate(versionStartDate)},${formatDate(versionEndDate)})`;
    const premisesRsf = suite.rsf;
    const baseYear = versionStartDate.getFullYear();
    const escalationMethod = randomChoice(escalationMethods);
    const isCurrent = v === numVersions - 1;
    const notes = v === 0 ? 'Original lease' : `Amendment ${v}`;
    
    leaseVersions.push({
      id: versionId,
      leaseId: lease.id,
      versionNum: v,
      suiteId: suite.id,
      effectiveDaterange,
      premisesRsf,
      termMonths,
      baseYear,
      escalationMethod,
      isCurrent
    });
    
    const comma = versionId < NUM_LEASES * 1.5 ? ',' : ';';
    console.log(`  (${versionId}, ${lease.id}, ${v}, '${effectiveDaterange}', ${suite.id}, ${premisesRsf}, ${termMonths}, ${baseYear}, '${escalationMethod}', 'USD', ${isCurrent}, '${notes}')${comma}`);
    versionId++;
  }
}

console.log();

// 6. Generate Rent Schedules
console.log('-- Rent Schedules');
console.log('INSERT INTO rent_schedule (rent_id, lease_version_id, period_daterange, amount, basis) VALUES');

let rentId = 1;
for (const version of leaseVersions) {
  const [startStr, endStr] = version.effectiveDaterange.slice(1, -1).split(',');
  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  
  const baseRent = (version.premisesRsf * randomInt(25, 75)).toFixed(2);
  const numPeriods = randomInt(3, 8);
  const monthsPerPeriod = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24 * 30) / numPeriods);
  
  for (let p = 0; p < numPeriods; p++) {
    const periodStart = addMonths(startDate, p * monthsPerPeriod);
    const periodEnd = p === numPeriods - 1 ? endDate : addMonths(periodStart, monthsPerPeriod);
    
    if (periodStart >= endDate) break;
    
    const periodDaterange = `[${formatDate(periodStart)},${formatDate(periodEnd)})`;
    const escalation = 1 + (p * 0.03); // 3% annual escalation
    const amount = (parseFloat(baseRent) * escalation).toFixed(2);
    const basis = 'MONTH';
    
    const comma = rentId < leaseVersions.length * 5 ? ',' : ';';
    console.log(`  (${rentId}, ${version.id}, '${periodDaterange}', ${amount}, '${basis}')${comma}`);
    rentId++;
  }
}

console.log();

// 7. Generate OpEx Pass-Throughs
console.log('-- OpEx Pass-Throughs');
console.log('INSERT INTO opex_pass_through (opex_id, lease_version_id, method, stop_amount, gross_up_pct, notes) VALUES');

let opexId = 1;
for (const version of leaseVersions) {
  if (Math.random() > 0.7) { // 70% of leases have OpEx
    const method = randomChoice(opexMethods);
    const stopAmount = method === 'EXPENSE_STOP' ? (version.premisesRsf * randomInt(5, 15)).toFixed(2) : null;
    const grossUpPct = method === 'BASE_YEAR' ? randomInt(90, 100) : null;
    const notes = `${method} pass-through`;
    
    const comma = opexId < leaseVersions.length * 0.7 ? ',' : ';';
    const stopAmountStr = stopAmount ? stopAmount : 'NULL';
    const grossUpPctStr = grossUpPct ? grossUpPct : 'NULL';
    console.log(`  (${opexId}, ${version.id}, '${method}', ${stopAmountStr}, ${grossUpPctStr}, '${notes}')${comma}`);
    opexId++;
  }
}

console.log();

// 8. Generate Options
console.log('-- Options');
console.log('INSERT INTO option (option_id, lease_version_id, option_type, window_daterange, terms, exercised, exercised_date) VALUES');

let optionId = 1;
const now = new Date();

for (const version of leaseVersions) {
  if (version.isCurrent && Math.random() > 0.4) { // 60% of current versions have options
    const optionType = randomChoice(optionTypes);
    const [startStr, endStr] = version.effectiveDaterange.slice(1, -1).split(',');
    const endDate = new Date(endStr);
    
    // Notice window is 6-12 months before expiration
    const windowStart = addMonths(endDate, -12);
    const windowEnd = addMonths(endDate, -6);
    const windowDaterange = `[${formatDate(windowStart)},${formatDate(windowEnd)})`;
    
    const isWindowOpen = now >= windowStart && now <= windowEnd;
    const exercised = isWindowOpen ? Math.random() > 0.7 : false;
    const exercisedDate = exercised ? formatDate(randomDate(windowStart, now)) : null;
    
    const terms = optionType === 'RENEWAL' 
      ? `${randomInt(36, 60)} month renewal at market rate`
      : optionType === 'TERMINATION'
      ? `Early termination with ${randomInt(3, 6)} months notice`
      : optionType === 'EXPANSION'
      ? `Right to expand by ${randomInt(2000, 10000)} RSF`
      : 'Right of first refusal on adjacent space';
    
    const comma = optionId < leaseVersions.filter(v => v.isCurrent).length * 0.6 ? ',' : ';';
    const exercisedDateStr = exercisedDate ? `'${exercisedDate}'` : 'NULL';
    console.log(`  (${optionId}, ${version.id}, '${optionType}', '${windowDaterange}', '${terms}', ${exercised}, ${exercisedDateStr})${comma}`);
    optionId++;
  }
}

console.log();

// 9. Generate Concessions
console.log('-- Concessions');
console.log('INSERT INTO concession (concession_id, lease_version_id, kind, value_amount, value_basis, applies_daterange, notes) VALUES');

let concessionId = 1;

for (const version of leaseVersions) {
  if (version.versionNum === 0 && Math.random() > 0.5) { // 50% of original leases have concessions
    const [startStr, endStr] = version.effectiveDaterange.slice(1, -1).split(',');
    const startDate = new Date(startStr);
    
    // TI Allowance
    if (Math.random() > 0.3) {
      const tiAmount = (version.premisesRsf * randomInt(20, 80)).toFixed(2);
      console.log(`  (${concessionId}, ${version.id}, 'TI_ALLOWANCE', ${tiAmount}, 'PER_SF', NULL, 'Tenant improvement allowance'),`);
      concessionId++;
    }
    
    // Free Rent
    if (Math.random() > 0.4) {
      const freeMonths = randomInt(2, 6);
      const freeRentEnd = addMonths(startDate, freeMonths);
      const appliesDaterange = `[${formatDate(startDate)},${formatDate(freeRentEnd)})`;
      const isFreeRentActive = now >= startDate && now <= freeRentEnd;
      
      const comma = concessionId < leaseVersions.filter(v => v.versionNum === 0).length * 0.8 ? ',' : ';';
      console.log(`  (${concessionId}, ${version.id}, 'FREE_RENT', 0, 'TOTAL', '${appliesDaterange}', '${freeMonths} months free rent')${comma}`);
      concessionId++;
    }
  }
}

console.log();

// 10. Generate Critical Dates
console.log('-- Critical Dates');
console.log('INSERT INTO critical_date (crit_id, lease_id, kind, date_value, notes) VALUES');

let critId = 1;

for (const lease of leases) {
  const currentVersion = leaseVersions.find(v => v.leaseId === lease.id && v.isCurrent);
  if (!currentVersion) continue;
  
  const [startStr, endStr] = currentVersion.effectiveDaterange.slice(1, -1).split(',');
  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  
  // Commencement
  console.log(`  (${critId}, ${lease.id}, 'COMMENCEMENT', '${formatDate(startDate)}', 'Lease commencement date'),`);
  critId++;
  
  // Rent Start (30-90 days after commencement)
  const rentStart = addDays(startDate, randomInt(30, 90));
  console.log(`  (${critId}, ${lease.id}, 'RENT_START', '${formatDate(rentStart)}', 'Rent payment begins'),`);
  critId++;
  
  // Expiration
  console.log(`  (${critId}, ${lease.id}, 'EXPIRATION', '${formatDate(endDate)}', 'Lease expiration date'),`);
  critId++;
  
  // Notice deadline (if applicable)
  if (Math.random() > 0.5) {
    const noticeDate = addMonths(endDate, -9);
    const comma = critId < leases.length * 3.5 ? ',' : ';';
    console.log(`  (${critId}, ${lease.id}, 'NOTICE', '${formatDate(noticeDate)}', 'Renewal notice deadline')${comma}`);
    critId++;
  }
}

console.log();

// 11. Generate Document Links
console.log('-- Document Links');
console.log('INSERT INTO doc_link (doc_id, lease_id, label, external_ref) VALUES');

let docId = 1;

for (const lease of leases) {
  const numDocs = randomInt(1, 4);
  
  for (let d = 0; d < numDocs; d++) {
    const docTypes = ['Original Lease', 'Amendment', 'Exhibit A', 'Commencement Letter', 'Estoppel Certificate'];
    const label = randomChoice(docTypes);
    const externalRef = `https://docs.example.com/leases/${lease.masterLeaseNum}/${label.replace(/\s+/g, '-').toLowerCase()}.pdf`;
    
    const comma = docId < leases.length * 2 ? ',' : ';';
    console.log(`  (${docId}, ${lease.id}, '${label}', '${externalRef}')${comma}`);
    docId++;
  }
}

console.log();

// Update sequences
console.log('-- Update sequences');
console.log(`SELECT setval('property_property_id_seq', ${NUM_PROPERTIES});`);
console.log(`SELECT setval('suite_suite_id_seq', ${suiteId - 1});`);
console.log(`SELECT setval('party_party_id_seq', ${NUM_PARTIES});`);
console.log(`SELECT setval('lease_lease_id_seq', ${NUM_LEASES});`);
console.log(`SELECT setval('lease_version_lease_version_id_seq', ${versionId - 1});`);
console.log(`SELECT setval('rent_schedule_rent_id_seq', ${rentId - 1});`);
console.log(`SELECT setval('opex_pass_through_opex_id_seq', ${opexId - 1});`);
console.log(`SELECT setval('option_option_id_seq', ${optionId - 1});`);
console.log(`SELECT setval('concession_concession_id_seq', ${concessionId - 1});`);
console.log(`SELECT setval('critical_date_crit_id_seq', ${critId - 1});`);
console.log(`SELECT setval('doc_link_doc_id_seq', ${docId - 1});`);

console.log();
console.log('COMMIT;');
console.log();
console.log('-- Seed data generation complete');
console.log(`-- Properties: ${NUM_PROPERTIES}`);
console.log(`-- Suites: ${suiteId - 1}`);
console.log(`-- Parties: ${NUM_PARTIES}`);
console.log(`-- Leases: ${NUM_LEASES}`);
console.log(`-- Lease Versions: ${versionId - 1}`);
console.log(`-- Rent Schedules: ${rentId - 1}`);
console.log(`-- OpEx Pass-Throughs: ${opexId - 1}`);
console.log(`-- Options: ${optionId - 1}`);
console.log(`-- Concessions: ${concessionId - 1}`);
console.log(`-- Critical Dates: ${critId - 1}`);
console.log(`-- Document Links: ${docId - 1}`);
