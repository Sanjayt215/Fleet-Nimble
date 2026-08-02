/**
 * FleetNimble Performance Audit
 * PHASE 2: Measure latencies and resource usage
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SRC_DIR = join(__dirname, '..');

const performanceMetrics = {
  apiEndpoints: [],
  databaseQueries: [],
  externalCalls: [],
  asyncOperations: [],
  potentialBottlenecks: [],
};

function checkApiLatency(filePath, content) {
  // Look for API endpoints without timing
  const routerPattern = /router\.(get|post|put|patch|delete)\(['"`]([^'"`]+)['"`]/g;
  const matches = [...content.matchAll(routerPattern)];
  
  matches.forEach(match => {
    const method = match[1];
    const route = match[2];
    const hasTiming = content.includes('performance') || content.includes('timing') || content.includes('latency');
    
    if (!hasTiming) {
      performanceMetrics.apiEndpoints.push({
        file: filePath,
        method,
        route,
        issue: 'No latency tracking'
      });
    }
  });
}

function checkDatabaseQueries(filePath, content) {
  // Look for Prisma queries without timing
  const prismaPattern = /prisma\.\w+\.(find|create|update|delete|aggregate|count)/g;
  const matches = [...content.matchAll(prismaPattern)];
  
  if (matches.length > 0) {
    const hasTiming = content.includes('performance') || content.includes('timing');
    
    if (!hasTiming) {
      performanceMetrics.databaseQueries.push({
        file: filePath,
        queryCount: matches.length,
        issue: 'No query timing'
      });
    }
  }
}

function checkExternalCalls(filePath, content) {
  // Look for external API calls without timeout
  const fetchPattern = /fetch\(|axios\.|openai\./g;
  const matches = [...content.matchAll(fetchPattern)];
  
  matches.forEach(match => {
    const hasTimeout = content.includes('timeout') || content.includes('signal');
    
    if (!hasTimeout) {
      performanceMetrics.externalCalls.push({
        file: filePath,
        issue: 'External call without timeout'
      });
    }
  });
}

function checkAsyncOperations(filePath, content) {
  // Look for async/await without error handling
  const asyncPattern = /async\s+function|async\s+\w+\s*\(|=>\s*{/g;
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    if (line.includes('await ') && !line.includes('try') && !line.includes('catch')) {
      // Check if this is in a try-catch block by looking back
      let inTryBlock = false;
      for (let i = index; i >= Math.max(0, index - 10); i--) {
        if (lines[i].includes('try {')) {
          inTryBlock = true;
          break;
        }
        if (lines[i].includes('catch')) {
          break;
        }
      }
      
      if (!inTryBlock) {
        performanceMetrics.asyncOperations.push({
          file: filePath,
          line: index + 1,
          issue: 'Await without error handling'
        });
      }
    }
  });
}

function checkBottlenecks(filePath, content) {
  // Look for synchronous operations in async contexts
  if (content.includes('JSON.parse') || content.includes('JSON.stringify')) {
    const jsonCount = (content.match(/JSON\.(parse|stringify)/g) || []).length;
    if (jsonCount > 5) {
      performanceMetrics.potentialBottlenecks.push({
        file: filePath,
        issue: `High JSON operations count: ${jsonCount}`
      });
    }
  }
  
  // Look for large loops
  const loopPattern = /for\s*\(|while\s*\(/g;
  const loopMatches = [...content.matchAll(loopPattern)];
  if (loopMatches.length > 3) {
    performanceMetrics.potentialBottlenecks.push({
      file: filePath,
      issue: `Multiple loops: ${loopMatches.length}`
    });
  }
}

// Main audit
console.log('=== FleetNimble Performance Audit ===\n');

const files = [];
function scanDirectory(dir) {
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('.git')) {
      scanDirectory(fullPath);
    } else if (stat.isFile() && extname(item) === '.js') {
      files.push(fullPath);
    }
  }
}

scanDirectory(SRC_DIR);

console.log(`Scanning ${files.length} files for performance issues...\n`);

files.forEach(filePath => {
  const relativePath = filePath.replace(SRC_DIR, '').replace(/\\/g, '/');
  const content = readFileSync(filePath, 'utf-8');
  
  checkApiLatency(relativePath, content);
  checkDatabaseQueries(relativePath, content);
  checkExternalCalls(relativePath, content);
  checkAsyncOperations(relativePath, content);
  checkBottlenecks(relativePath, content);
});

// Print results
console.log('=== PERFORMANCE AUDIT RESULTS ===\n');

const categories = [
  { name: 'API Endpoints Without Timing', key: 'apiEndpoints' },
  { name: 'Database Queries Without Timing', key: 'databaseQueries' },
  { name: 'External Calls Without Timeout', key: 'externalCalls' },
  { name: 'Async Operations Without Error Handling', key: 'asyncOperations' },
  { name: 'Potential Bottlenecks', key: 'potentialBottlenecks' },
];

let totalIssues = 0;
categories.forEach(cat => {
  const issues = performanceMetrics[cat.key];
  if (issues.length > 0) {
    console.log(`${cat.name}: ${issues.length} issues`);
    issues.slice(0, 10).forEach(issue => {
      console.log(`  - ${issue.file}: ${issue.issue}`);
      if (issue.method) console.log(`    ${issue.method} ${issue.route}`);
      if (issue.line) console.log(`    Line ${issue.line}`);
    });
    if (issues.length > 10) {
      console.log(`  ... and ${issues.length - 10} more`);
    }
    totalIssues += issues.length;
  }
});

if (totalIssues === 0) {
  console.log('\n✓ No performance issues found');
} else {
  console.log(`\n⚠ Total performance issues: ${totalIssues}`);
}

console.log('\n=== RECOMMENDATIONS ===\n');
console.log('1. Add latency tracking to all API endpoints');
console.log('2. Add timing to all database queries');
console.log('3. Add timeouts to all external API calls');
console.log('4. Add error handling to all async operations');
console.log('5. Review potential bottlenecks for optimization');
console.log('6. Implement performance monitoring middleware');
