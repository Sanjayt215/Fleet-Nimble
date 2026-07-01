/**
 * AI System Test Script
 * Tests key components of the FleetNimble AI system
 */

import { detectIntent, extractEntities } from './aiIntentDetector.js';
import { searchKnowledgeBase } from '../aiKnowledgeBase.js';
import { getDeterministicFallback } from './aiDeterministicFallback.js';
import { getProviderInfo } from './aiProvider.js';
import { getSuggestedActions } from './aiResponseFormatter.js';
import { INTENTS } from './aiIntentDetector.js';
import logger from '../../utils/logger.js';

console.log('=== FleetNimble AI System Test ===\n');

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

function test(name, fn) {
  try {
    fn();
    results.passed++;
    results.tests.push({ name, status: 'PASSED' });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: 'FAILED', error: error.message });
    console.log(`✗ ${name}: ${error.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    results.passed++;
    results.tests.push({ name, status: 'PASSED' });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: 'FAILED', error: error.message });
    console.log(`✗ ${name}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test 1: Intent Detection
console.log('\n--- Testing Intent Detection ---');
test('Intent: fleet_summary', () => {
  const intent = detectIntent('Summarize my fleet health');
  assert(intent === 'fleet_summary', `Expected fleet_summary, got ${intent}`);
});

test('Intent: vehicle_details', () => {
  const intent = detectIntent('Show Honda Amaze details');
  assert(intent === 'vehicle_details', `Expected vehicle_details, got ${intent}`);
});

test('Intent: history', () => {
  const intent = detectIntent('Show telemetry history');
  assert(intent === 'history', `Expected history, got ${intent}`);
});

test('Intent: live_data', () => {
  const intent = detectIntent('Show live diagnostics');
  assert(intent === 'live_data', `Expected live_data, got ${intent}`);
});

test('Intent: work_order', () => {
  const intent = detectIntent('Create work order for Honda Amaze');
  assert(intent === 'work_order', `Expected work_order, got ${intent}`);
});

// Test 2: Knowledge Base Search
console.log('\n--- Testing Knowledge Base ---');
test('Knowledge base search returns results', () => {
  const results = searchKnowledgeBase('How do I check battery status');
  assert(Array.isArray(results), 'Results should be an array');
  assert(results.length > 0, 'Should return at least one result');
});

test('Knowledge base handles empty query', () => {
  const results = searchKnowledgeBase('');
  assert(Array.isArray(results), 'Results should be an array');
});

// Test 3: Response Formatter
console.log('\n--- Testing Response Formatter ---');
test('Suggested actions for fleet_summary', () => {
  const actions = getSuggestedActions('fleet_summary');
  assert(Array.isArray(actions), 'Actions should be an array');
  assert(actions.length > 0, 'Should have suggested actions');
  assert(actions.includes('Show critical alerts'), 'Should include critical alerts action');
});

test('Suggested actions for history', () => {
  const actions = getSuggestedActions('history');
  assert(Array.isArray(actions), 'Actions should be an array');
  assert(actions.includes('Show live data'), 'Should include live data action');
});

test('Suggested actions for live_data', () => {
  const actions = getSuggestedActions('live_data');
  assert(Array.isArray(actions), 'Actions should be an array');
  assert(actions.includes('Show historical data'), 'Should include historical data action');
});

// Test 4: AI Provider Info
console.log('\n--- Testing AI Provider ---');
test('Provider info returns structure', () => {
  const info = getProviderInfo();
  assert(typeof info === 'object', 'Info should be an object');
  assert(info.provider !== undefined, 'Should have provider field');
  assert(info.model !== undefined, 'Should have model field');
});

// Test 5: Deterministic Fallback
console.log('\n--- Testing Deterministic Fallback ---');
await testAsync('Fallback returns valid structure', async () => {
  const result = await getDeterministicFallback('test-user-id', 'Summarize my fleet health');
  assert(result.success === true, 'Should return success');
  assert(result.data !== undefined, 'Should have data field');
  assert(result.data.reply !== undefined, 'Should have reply field');
  assert(result.data.metadata !== undefined, 'Should have metadata field');
});

// Test 6: Intent Coverage
console.log('\n--- Testing Intent Coverage ---');
const requiredIntents = [
  'fleet_summary',
  'vehicle_details',
  'vehicle_comparison',
  'diagnostics',
  'maintenance',
  'work_order',
  'gps',
  'alerts',
  'dtc',
  'report',
  'support',
  'battery',
  'fuel',
  'trip',
  'driver',
  'offline_vehicles',
  'standby_vehicles',
  'engine_state',
  'predictive_maintenance',
  'business_impact',
  'recommendations',
  'company_info',
  'history',
  'live_data',
  'general',
];

test('All required intents are defined', () => {
  const definedIntents = Object.values(INTENTS);
  requiredIntents.forEach(intent => {
    assert(definedIntents.includes(intent), `Missing intent: ${intent}`);
  });
});

// Summary
console.log('\n=== Test Summary ===');
console.log(`Total Tests: ${results.passed + results.failed}`);
console.log(`Passed: ${results.passed}`);
console.log(`Failed: ${results.failed}`);
console.log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(2)}%`);

if (results.failed > 0) {
  console.log('\n--- Failed Tests ---');
  results.tests.filter(t => t.status === 'FAILED').forEach(t => {
    console.log(`- ${t.name}: ${t.error}`);
  });
  process.exit(1);
} else {
  console.log('\n✓ All tests passed!');
  process.exit(0);
}
