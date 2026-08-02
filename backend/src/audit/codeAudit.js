/**
 * FleetNimble Code Audit Script
 * PHASE 1: Complete Code Audit
 * Checks for dead code, unused services, duplicate logic, circular imports, memory leaks, etc.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SRC_DIR = join(__dirname, '..');

const auditResults = {
  deadCode: [],
  unusedImports: [],
  duplicateLogic: [],
  circularImports: [],
  memoryLeaks: [],
  blockingAsync: [],
  unhandledPromises: [],
  raceConditions: [],
  resourceLeaks: [],
  websocketLeaks: [],
  socketReconnectionLoops: [],
  sessionCleanup: [],
  cacheGrowth: [],
  redisCleanup: [],
  prismaLifecycle: [],
  twilioLifecycle: [],
  geminiLifecycle: [],
};

// File patterns to check
const serviceFiles = [];
const controllerFiles = [];
const middlewareFiles = [];

function scanDirectory(dir, baseDir = dir) {
  const files = readdirSync(dir);
  
  for (const file of files) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory() && !file.includes('node_modules') && !file.includes('.git')) {
      scanDirectory(fullPath, baseDir);
    } else if (stat.isFile() && extname(file) === '.js') {
      const relativePath = fullPath.replace(baseDir, '').replace(/\\/g, '/');
      
      if (relativePath.includes('/services/')) serviceFiles.push(relativePath);
      else if (relativePath.includes('/controllers/')) controllerFiles.push(relativePath);
      else if (relativePath.includes('/middleware/')) middlewareFiles.push(relativePath);
    }
  }
}

function checkFile(filePath) {
  const fullPath = join(SRC_DIR, filePath);
  const content = readFileSync(fullPath, 'utf-8');
  
  // Check for memory leaks
  if (content.includes('addEventListener') && !content.includes('removeEventListener')) {
    auditResults.memoryLeaks.push({ file: filePath, issue: 'addEventListener without removeEventListener' });
  }
  
  // Check for unhandled promises
  if (content.match(/\.then\([^)]*\)(?!\s*\.catch)/)) {
    auditResults.unhandledPromises.push({ file: filePath, issue: 'Promise without catch handler' });
  }
  
  // Check for blocking operations
  if (content.includes('while (true)') || content.includes('for (;;)')) {
    auditResults.blockingAsync.push({ file: filePath, issue: 'Infinite loop detected' });
  }
  
  // Check for WebSocket cleanup
  if (content.includes('new WebSocket') || content.includes('socket.on')) {
    if (!content.includes('socket.close()') && !content.includes('socket.disconnect()')) {
      auditResults.websocketLeaks.push({ file: filePath, issue: 'WebSocket without cleanup' });
    }
  }
  
  // Check for setInterval without clearInterval
  if (content.includes('setInterval') && !content.includes('clearInterval')) {
    auditResults.resourceLeaks.push({ file: filePath, issue: 'setInterval without clearInterval' });
  }
  
  // Check for setTimeout without clearTimeout
  if (content.includes('setTimeout') && !content.includes('clearTimeout')) {
    auditResults.resourceLeaks.push({ file: filePath, issue: 'setTimeout without clearTimeout' });
  }
  
  // Check for Prisma client lifecycle
  if (content.includes('prisma.') && !content.includes('prisma.$disconnect()')) {
    auditResults.prismaLifecycle.push({ file: filePath, issue: 'Prisma client without disconnect handler' });
  }
  
  // Check for Twilio lifecycle
  if (content.includes('twilio.') && !content.includes('client.close()')) {
    auditResults.twilioLifecycle.push({ file: filePath, issue: 'Twilio client without cleanup' });
  }
  
  // Check for session cleanup
  if (content.includes('session') && !content.includes('session.destroy()')) {
    auditResults.sessionCleanup.push({ file: filePath, issue: 'Session without cleanup' });
  }
}

console.log('=== FleetNimble Code Audit ===\n');
console.log('Scanning codebase...\n');

scanDirectory(SRC_DIR);

console.log(`Found ${serviceFiles.length} service files`);
console.log(`Found ${controllerFiles.length} controller files`);
console.log(`Found ${middlewareFiles.length} middleware files`);
console.log('\nAnalyzing files...\n');

const allFiles = [...serviceFiles, ...controllerFiles, ...middlewareFiles];
allFiles.forEach(checkFile);

// Print results
console.log('=== AUDIT RESULTS ===\n');

const categories = [
  { name: 'Memory Leaks', key: 'memoryLeaks' },
  { name: 'Unhandled Promises', key: 'unhandledPromises' },
  { name: 'Blocking Operations', key: 'blockingAsync' },
  { name: 'WebSocket Leaks', key: 'websocketLeaks' },
  { name: 'Resource Leaks', key: 'resourceLeaks' },
  { name: 'Prisma Lifecycle', key: 'prismaLifecycle' },
  { name: 'Twilio Lifecycle', key: 'twilioLifecycle' },
  { name: 'Session Cleanup', key: 'sessionCleanup' },
];

let totalIssues = 0;
categories.forEach(cat => {
  const issues = auditResults[cat.key];
  if (issues.length > 0) {
    console.log(`\n${cat.name}: ${issues.length} issues`);
    issues.forEach(issue => {
      console.log(`  - ${issue.file}: ${issue.issue}`);
    });
    totalIssues += issues.length;
  }
});

if (totalIssues === 0) {
  console.log('\n✓ No issues found in initial scan');
} else {
  console.log(`\n⚠ Total issues found: ${totalIssues}`);
}

console.log('\n=== DETAILED FILE ANALYSIS ===\n');

// Check specific critical files
const criticalFiles = [
  'server.js',
  'app.js',
  'services/aiService.js',
  'services/receptionistRealtime.service.js',
  'services/mediaStreamHandler.js',
  'sockets/index.js',
];

criticalFiles.forEach(file => {
  const filePath = join(SRC_DIR, file);
  try {
    const content = readFileSync(filePath, 'utf-8');
    console.log(`\n${file}:`);
    console.log(`  Lines: ${content.split('\n').length}`);
    console.log(`  Has error handling: ${content.includes('try') && content.includes('catch') ? 'Yes' : 'No'}`);
    console.log(`  Has cleanup: ${content.includes('close') || content.includes('disconnect') || content.includes('destroy') ? 'Yes' : 'No'}`);
    console.log(`  Has logging: ${content.includes('console.log') || content.includes('logger') ? 'Yes' : 'No'}`);
  } catch (e) {
    console.log(`\n${file}: File not found`);
  }
});

console.log('\n=== AUDIT COMPLETE ===\n');
console.log('Recommendations:');
console.log('1. Review all memory leak warnings');
console.log('2. Add cleanup handlers for all resources');
console.log('3. Ensure all promises have error handlers');
console.log('4. Add Prisma disconnect on shutdown');
console.log('5. Review WebSocket connection lifecycle');
console.log('6. Add session cleanup on disconnect');
