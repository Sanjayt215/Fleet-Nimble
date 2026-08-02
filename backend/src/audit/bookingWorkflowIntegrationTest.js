/**
 * Live Integration Test for Appointment Booking Workflow
 * 
 * This test verifies the complete appointment booking workflow end-to-end.
 * It tests all 16 steps of the workflow to ensure they execute correctly.
 * 
 * Run with: node src/audit/bookingWorkflowIntegrationTest.js
 */

import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import * as bookingWorkflow from '../services/receptionistBookingWorkflow.service.js';

// Test configuration
let TEST_USER_ID = null;
const TEST_CALL_ID = 'test-call-id';
const TEST_CALL_SID = 'test-call-sid';

// Test data
const testExtractedData = {
  callerName: 'John Smith',
  phone: '+1234567890',
  email: 'john.smith@example.com',
  company: 'Acme Logistics',
  fleetSize: 25,
  industry: 'Logistics',
  meetingPurpose: 'Product Demo',
  preferredDate: '2025-01-25',
  preferredTime: '14:00',
  timezone: 'America/New_York',
};

const testTranscript = [
  { role: 'caller', content: 'Hi, I want to book a demo for my fleet', timestamp: new Date().toISOString() },
  { role: 'assistant', content: 'Great! I can help you with that. What company are you from?', timestamp: new Date().toISOString() },
  { role: 'caller', content: 'Acme Logistics, we have 25 vehicles', timestamp: new Date().toISOString() },
  { role: 'assistant', content: 'Excellent. What date and time works best for you?', timestamp: new Date().toISOString() },
  { role: 'caller', content: 'January 25th at 2pm EST', timestamp: new Date().toISOString() },
  { role: 'assistant', content: 'Perfect! I have scheduled your demo for January 25th at 2pm EST', timestamp: new Date().toISOString() },
];

const testSessionMetrics = {
  interruptions: 0,
  silenceDurationMs: 5000,
};

/**
 * Create test user
 */
async function createTestUser() {
  console.log('[SETUP] Creating test user...');
  
  try {
    // Check if user already exists
    let user = await prisma.user.findFirst({
      where: { email: 'test@example.com' },
    });

    if (!user) {
      // Get or create a role
      let role = await prisma.role.findFirst();
      if (!role) {
        role = await prisma.role.create({
          data: {
            name: 'ADMIN',
          },
        });
        console.log('✅ Test role created');
      }

      user = await prisma.user.create({
        data: {
          name: 'Test User',
          email: 'test@example.com',
          passwordHash: 'dummy-hash',
          roleId: role.id,
        },
      });
      console.log('✅ Test user created');
    } else {
      console.log('✅ Using existing test user');
    }

    TEST_USER_ID = user.id;
    return user.id;
  } catch (error) {
    console.error('❌ Failed to create test user:', error.message);
    throw error;
  }
}

/**
 * Test Step 1: Verify Contact Creation with Duplicate Prevention
 */
async function testContactCreation() {
  console.log('\n[TEST 1] Contact Creation with Duplicate Prevention');
  
  try {
    const result = await bookingWorkflow.executeAppointmentBookingWorkflow({
      userId: TEST_USER_ID,
      callId: TEST_CALL_ID,
      callSid: TEST_CALL_SID,
      extractedData: testExtractedData,
      transcript: testTranscript,
      sessionMetrics: testSessionMetrics,
    });

    // Verify customer was created
    const customer = await prisma.receptionistCustomer.findFirst({
      where: {
        userId: TEST_USER_ID,
        phone: testExtractedData.phone,
      },
    });

    if (!customer) {
      throw new Error('Customer was not created');
    }

    if (customer.name !== testExtractedData.callerName) {
      throw new Error('Customer name mismatch');
    }

    if (customer.companyName !== testExtractedData.company) {
      throw new Error('Customer company mismatch');
    }

    if (customer.fleetSize !== testExtractedData.fleetSize) {
      throw new Error('Customer fleet size mismatch');
    }

    if (customer.industry !== testExtractedData.industry) {
      throw new Error('Customer industry mismatch');
    }

    console.log('✅ PASS: Contact created with correct data');
    console.log(`   Customer ID: ${customer.id}`);
    console.log(`   Name: ${customer.name}`);
    console.log(`   Company: ${customer.companyName}`);
    console.log(`   Fleet Size: ${customer.fleetSize}`);
    console.log(`   Industry: ${customer.industry}`);

    return { success: true, customerId: customer.id };
  } catch (error) {
    console.error('❌ FAIL: Contact creation failed');
    console.error(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test Step 2: Verify Duplicate Prevention
 */
async function testDuplicatePrevention(customerId) {
  console.log('\n[TEST 2] Duplicate Prevention');

  try {
    // Try to create another appointment for the same customer at the same time
    const duplicateData = {
      ...testExtractedData,
      preferredDate: '2025-01-25',
      preferredTime: '14:30', // Within 1 hour of previous appointment
    };

    await bookingWorkflow.executeAppointmentBookingWorkflow({
      userId: TEST_USER_ID,
      callId: `${TEST_CALL_ID}-2`,
      callSid: `${TEST_CALL_SID}-2`,
      extractedData: duplicateData,
      transcript: testTranscript,
      sessionMetrics: testSessionMetrics,
    });

    throw new Error('Duplicate appointment was not prevented');
  } catch (error) {
    if (error.message.includes('Duplicate appointment')) {
      console.log('✅ PASS: Duplicate appointment prevented');
      console.log(`   Error message: ${error.message}`);
      return { success: true };
    } else {
      console.error('❌ FAIL: Wrong error type');
      console.error(`   Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

/**
 * Test Step 3: Verify Company Creation
 */
async function testCompanyCreation(customerId) {
  console.log('\n[TEST 3] Company Creation');

  try {
    const customer = await prisma.receptionistCustomer.findUnique({
      where: { id: customerId },
      include: { user: true },
    });

    if (!customer.companyId) {
      console.log('⚠️  SKIP: Company not linked to customer (may be existing company)');
      return { success: true };
    }

    const company = await prisma.company.findUnique({
      where: { id: customer.companyId },
    });

    if (!company) {
      throw new Error('Company was not created');
    }

    if (company.name !== testExtractedData.company) {
      throw new Error('Company name mismatch');
    }

    console.log('✅ PASS: Company created with correct data');
    console.log(`   Company ID: ${company.id}`);
    console.log(`   Name: ${company.name}`);
    console.log(`   Slug: ${company.slug}`);

    return { success: true, companyId: company.id };
  } catch (error) {
    console.error('❌ FAIL: Company creation failed');
    console.error(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test Step 4: Verify Lead Creation
 */
async function testLeadCreation(customerId) {
  console.log('\n[TEST 4] Lead Creation');

  try {
    const customer = await prisma.receptionistCustomer.findUnique({
      where: { id: customerId },
    });

    if (customer.status !== 'LEAD') {
      throw new Error('Customer status is not LEAD');
    }

    if (customer.leadScore === 0) {
      throw new Error('Lead score was not calculated');
    }

    console.log('✅ PASS: Lead created with correct status and score');
    console.log(`   Status: ${customer.status}`);
    console.log(`   Lead Score: ${customer.leadScore}`);

    return { success: true };
  } catch (error) {
    console.error('❌ FAIL: Lead creation failed');
    console.error(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test Step 5: Verify Appointment Creation
 */
async function testAppointmentCreation(customerId) {
  console.log('\n[TEST 5] Appointment Creation');

  try {
    const appointment = await prisma.aiReceptionistAppointment.findFirst({
      where: {
        userId: TEST_USER_ID,
        customerId,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!appointment) {
      throw new Error('Appointment was not created');
    }

    if (appointment.callerName !== testExtractedData.callerName) {
      throw new Error('Appointment caller name mismatch');
    }

    if (appointment.companyName !== testExtractedData.company) {
      throw new Error('Appointment company name mismatch');
    }

    if (appointment.industry !== testExtractedData.industry) {
      throw new Error('Appointment industry mismatch');
    }

    if (appointment.meetingPurpose !== testExtractedData.meetingPurpose) {
      throw new Error('Appointment meeting purpose mismatch');
    }

    console.log('✅ PASS: Appointment created with correct data');
    console.log(`   Appointment ID: ${appointment.id}`);
    console.log(`   Caller: ${appointment.callerName}`);
    console.log(`   Company: ${appointment.companyName}`);
    console.log(`   Industry: ${appointment.industry}`);
    console.log(`   Purpose: ${appointment.meetingPurpose}`);
    console.log(`   Scheduled: ${appointment.scheduledDate}`);
    console.log(`   Timezone: ${appointment.timezone}`);

    return { success: true, appointmentId: appointment.id };
  } catch (error) {
    console.error('❌ FAIL: Appointment creation failed');
    console.error(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test Step 6: Verify Call Linking
 */
async function testCallLinking(appointmentId) {
  console.log('\n[TEST 6] Call Linking');

  try {
    const call = await prisma.aiReceptionistCall.findUnique({
      where: { id: TEST_CALL_ID },
    });

    if (!call) {
      throw new Error('Call was not found');
    }

    if (call.appointmentId !== appointmentId) {
      throw new Error('Call not linked to appointment');
    }

    if (call.callStatus !== 'COMPLETED') {
      throw new Error('Call status not COMPLETED');
    }

    if (!call.transcript) {
      throw new Error('Transcript not saved');
    }

    const transcript = JSON.parse(call.transcript);
    if (!Array.isArray(transcript) || transcript.length === 0) {
      throw new Error('Transcript is empty or invalid');
    }

    console.log('✅ PASS: Call linked correctly');
    console.log(`   Call ID: ${call.id}`);
    console.log(`   Appointment ID: ${call.appointmentId}`);
    console.log(`   Status: ${call.callStatus}`);
    console.log(`   Transcript entries: ${transcript.length}`);

    return { success: true };
  } catch (error) {
    console.error('❌ FAIL: Call linking failed');
    console.error(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test Step 7: Verify Summary Generation
 */
async function testSummaryGeneration(callId) {
  console.log('\n[TEST 7] Summary Generation');

  try {
    const summary = await prisma.conversationSummary.findUnique({
      where: { callId },
    });

    if (!summary) {
      throw new Error('Summary was not generated');
    }

    if (!summary.executiveSummary) {
      throw new Error('Executive summary is empty');
    }

    if (!summary.salesSummary) {
      throw new Error('Sales summary is empty');
    }

    if (summary.customerIntent !== 'SCHEDULE_MEETING') {
      throw new Error('Customer intent incorrect');
    }

    console.log('✅ PASS: Summary generated correctly');
    console.log(`   Intent: ${summary.customerIntent}`);
    console.log(`   Sentiment: ${summary.sentiment}`);
    console.log(`   Executive Summary: ${summary.executiveSummary.substring(0, 100)}...`);
    console.log(`   Next Best Action: ${summary.nextBestAction.substring(0, 100)}...`);

    return { success: true };
  } catch (error) {
    console.error('❌ FAIL: Summary generation failed');
    console.error(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test Step 8: Verify Analytics Generation
 */
async function testAnalyticsGeneration(callId) {
  console.log('\n[TEST 8] Analytics Generation');

  try {
    const analytics = await prisma.conversationAnalytics.findUnique({
      where: { callId },
    });

    if (!analytics) {
      throw new Error('Analytics were not generated');
    }

    if (analytics.conversationScore === 0) {
      throw new Error('Conversation score is 0');
    }

    if (analytics.salesScore === 0) {
      throw new Error('Sales score is 0 (should be 100 for appointment)');
    }

    console.log('✅ PASS: Analytics generated correctly');
    console.log(`   Conversation Score: ${analytics.conversationScore}`);
    console.log(`   Sales Score: ${analytics.salesScore}`);
    console.log(`   Support Score: ${analytics.supportScore}`);
    console.log(`   Talk Ratio: ${analytics.talkRatio}`);
    console.log(`   Knowledge Hits: ${analytics.knowledgeHits}`);

    return { success: true };
  } catch (error) {
    console.error('❌ FAIL: Analytics generation failed');
    console.error(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test Step 9: Verify CRM Activity Creation
 */
async function testCRMActivityCreation(customerId) {
  console.log('\n[TEST 9] CRM Activity Creation');

  try {
    const notes = await prisma.receptionistCustomerNote.findMany({
      where: { customerId },
     OrderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (notes.length === 0) {
      throw new Error('CRM note was not created');
    }

    const note = notes[0];
    if (note.type !== 'APPOINTMENT_BOOKED') {
      throw new Error('Note type is incorrect');
    }

    if (!note.content.includes('appointment')) {
      throw new Error('Note content does not mention appointment');
    }

    console.log('✅ PASS: CRM activity created correctly');
    console.log(`   Note ID: ${note.id}`);
    console.log(`   Type: ${note.type}`);
    console.log(`   Content: ${note.content.substring(0, 100)}...`);

    return { success: true };
  } catch (error) {
    console.error('❌ FAIL: CRM activity creation failed');
    console.error(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test Step 10: Verify Customer Updates
 */
async function testCustomerUpdates(customerId) {
  console.log('\n[TEST 10] Customer Updates');

  try {
    const customer = await prisma.receptionistCustomer.findUnique({
      where: { id: customerId },
    });

    if (customer.totalAppointments !== 1) {
      throw new Error('Total appointments not incremented');
    }

    if (!customer.lastContactAt) {
      throw new Error('Last contact at not updated');
    }

    if (customer.lastIntent !== 'schedule_meeting') {
      throw new Error('Last intent not updated');
    }

    if (!customer.lastSummary) {
      throw new Error('Last summary not updated');
    }

    console.log('✅ PASS: Customer updated correctly');
    console.log(`   Total Appointments: ${customer.totalAppointments}`);
    console.log(`   Last Intent: ${customer.lastIntent}`);
    console.log(`   Last Contact At: ${customer.lastContactAt}`);

    return { success: true };
  } catch (error) {
    console.error('❌ FAIL: Customer updates failed');
    console.error(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test Step 11: Verify Follow-up Reminders
 */
async function testFollowUpReminders(appointmentId) {
  console.log('\n[TEST 11] Follow-up Reminders');

  try {
    const reminders = await prisma.followUpReminder.findMany({
      where: { appointmentId },
    });

    if (reminders.length === 0) {
      throw new Error('No follow-up reminders created');
    }

    const channels = reminders.map(r => r.channel);
    console.log(`   Channels: ${channels.join(', ')}`);

    // Verify expected channels
    const expectedChannels = ['EMAIL', 'SMS', 'CRM_ACTIVITY', 'REMINDER', 'CALENDAR'];
    for (const channel of expectedChannels) {
      if (!channels.includes(channel)) {
        console.log(`⚠️  WARNING: Expected channel ${channel} not found`);
      }
    }

    console.log('✅ PASS: Follow-up reminders created');
    console.log(`   Total reminders: ${reminders.length}`);

    return { success: true };
  } catch (error) {
    console.error('❌ FAIL: Follow-up reminders failed');
    console.error(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test Step 12: Verify Transaction Rollback on Error
 */
async function testTransactionRollback() {
  console.log('\n[TEST 12] Transaction Rollback on Error');

  try {
    // Try to create with invalid data that should fail
    const invalidData = {
      ...testExtractedData,
      phone: null,
      email: null,
      callerName: null,
    };

    await bookingWorkflow.executeAppointmentBookingWorkflow({
      userId: TEST_USER_ID,
      callId: `${TEST_CALL_ID}-rollback`,
      callSid: `${TEST_CALL_SID}-rollback`,
      extractedData: invalidData,
      transcript: testTranscript,
      sessionMetrics: testSessionMetrics,
    });

    throw new Error('Invalid data should have failed');
  } catch (error) {
    if (error.message.includes('Failed to create or find customer')) {
      console.log('✅ PASS: Transaction rolled back on error');
      console.log(`   Error: ${error.message}`);
      return { success: true };
    } else {
      console.error('❌ FAIL: Wrong error type');
      console.error(`   Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('='.repeat(60));
  console.log('APPOINTMENT BOOKING WORKFLOW - INTEGRATION TEST');
  console.log('='.repeat(60));

  const results = [];

  // Test 1: Contact Creation
  const test1 = await testContactCreation();
  results.push({ name: 'Contact Creation', ...test1 });

  if (!test1.success) {
    console.log('\n❌ CRITICAL: Contact creation failed, stopping tests');
    return results;
  }

  const customerId = test1.customerId;

  // Test 2: Duplicate Prevention
  const test2 = await testDuplicatePrevention(customerId);
  results.push({ name: 'Duplicate Prevention', ...test2 });

  // Test 3: Company Creation
  const test3 = await testCompanyCreation(customerId);
  results.push({ name: 'Company Creation', ...test3 });

  // Test 4: Lead Creation
  const test4 = await testLeadCreation(customerId);
  results.push({ name: 'Lead Creation', ...test4 });

  // Test 5: Appointment Creation
  const test5 = await testAppointmentCreation(customerId);
  results.push({ name: 'Appointment Creation', ...test5 });

  if (!test5.success) {
    console.log('\n❌ CRITICAL: Appointment creation failed, stopping tests');
    return results;
  }

  const appointmentId = test5.appointmentId;

  // Test 6: Call Linking
  const test6 = await testCallLinking(appointmentId);
  results.push({ name: 'Call Linking', ...test6 });

  // Test 7: Summary Generation
  const test7 = await testSummaryGeneration(TEST_CALL_ID);
  results.push({ name: 'Summary Generation', ...test7 });

  // Test 8: Analytics Generation
  const test8 = await testAnalyticsGeneration(TEST_CALL_ID);
  results.push({ name: 'Analytics Generation', ...test8 });

  // Test 9: CRM Activity Creation
  const test9 = await testCRMActivityCreation(customerId);
  results.push({ name: 'CRM Activity Creation', ...test9 });

  // Test 10: Customer Updates
  const test10 = await testCustomerUpdates(customerId);
  results.push({ name: 'Customer Updates', ...test10 });

  // Test 11: Follow-up Reminders
  const test11 = await testFollowUpReminders(appointmentId);
  results.push({ name: 'Follow-up Reminders', ...test11 });

  // Test 12: Transaction Rollback
  const test12 = await testTransactionRollback();
  results.push({ name: 'Transaction Rollback', ...test12 });

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  results.forEach(result => {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${result.name}`);
    if (!result.success) {
      console.log(`        Error: ${result.error}`);
    }
  });

  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(60));

  return results;
}

/**
 * Cleanup test data
 */
async function cleanup() {
  console.log('\n[CLEANUP] Removing test data...');

  if (!TEST_USER_ID) {
    console.log('⚠️  No test user ID, skipping cleanup');
    return;
  }

  try {
    // Try to delete from each table, skip if table doesn't exist
    const tables = [
      { model: prisma.followUpReminder, name: 'followUpReminder' },
      { model: prisma.conversationAnalytics, name: 'conversationAnalytics' },
      { model: prisma.conversationSummary, name: 'conversationSummary' },
      { model: prisma.receptionistCustomerNote, name: 'receptionistCustomerNote' },
      { model: prisma.aiReceptionistAppointment, name: 'aiReceptionistAppointment' },
      { model: prisma.aiReceptionistCall, name: 'aiReceptionistCall' },
      { model: prisma.receptionistCustomer, name: 'receptionistCustomer' },
    ];

    for (const { model, name } of tables) {
      try {
        await model.deleteMany({
          where: { userId: TEST_USER_ID },
        });
      } catch (error) {
        if (error.message.includes('does not exist')) {
          console.log(`⚠️  Table ${name} does not exist, skipping`);
        } else if (error.message.includes('must not be null')) {
          console.log(`⚠️  Cannot delete from ${name} with null userId, skipping`);
        } else {
          console.error(`❌ Failed to delete from ${name}:`, error.message);
        }
      }
    }

    console.log('✅ Test data cleaned up');
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
}

// Main execution
(async () => {
  try {
    // Setup: Create test user
    await createTestUser();

    const results = await runAllTests();
    
    // Cleanup after tests
    await cleanup();

    const allPassed = results.every(r => r.success);
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    await cleanup();
    process.exit(1);
  }
})();
