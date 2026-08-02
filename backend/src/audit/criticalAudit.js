/**
 * FleetNimble Critical Code Audit
 * Focuses on actual production issues, not false positives
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SRC_DIR = join(__dirname, '..');

const criticalIssues = [];
const warnings = [];

// Check for circular imports
const importMap = new Map();

function checkCircularImports(filePath, content) {
  const imports = content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
  const fileImports = [];
  
  for (const match of imports) {
    fileImports.push(match[1]);
  }
  
  importMap.set(filePath, fileImports);
}

function detectCircularDependencies() {
  const visited = new Set();
  const recursionStack = new Set();
  
  function dfs(file, path = []) {
    if (recursionStack.has(file)) {
      const cycle = path.slice(path.indexOf(file));
      criticalIssues.push({
        type: 'CIRCULAR_IMPORT',
        file: file,
        cycle: cycle
      });
      return true;
    }
    
    if (visited.has(file)) return false;
    
    visited.add(file);
    recursionStack.add(file);
    
    const imports = importMap.get(file) || [];
    for (const imp of imports) {
      if (imp.startsWith('.') || imp.startsWith('/')) {
        const resolved = join(SRC_DIR, imp + '.js');
        if (dfs(resolved, [...path, file])) return true;
      }
    }
    
    recursionStack.delete(file);
    return false;
  }
  
  for (const file of importMap.keys()) {
    dfs(file);
  }
}

// Check for actual memory leaks
function checkMemoryLeaks(filePath, content) {
  // Event listeners without cleanup in long-lived objects
  if (content.includes('addEventListener') && !content.includes('removeEventListener')) {
    // Check if file is a service (long-lived)
    if (filePath.includes('/services/')) {
      criticalIssues.push({
        type: 'MEMORY_LEAK',
        file: filePath,
        issue: 'addEventListener without removeEventListener in service'
      });
    }
  }
  
  // Timers without cleanup
  const setIntervalCount = (content.match(/setInterval/g) || []).length;
  const clearIntervalCount = (content.match(/clearInterval/g) || []).length;
  
  if (setIntervalCount > clearIntervalCount) {
    criticalIssues.push({
      type: 'RESOURCE_LEAK',
      file: filePath,
      issue: `setInterval (${setIntervalCount}) without matching clearInterval (${clearIntervalCount})`
    });
  }
  
  const setTimeoutCount = (content.match(/setTimeout/g) || []).length;
  const clearTimeoutCount = (content.match(/clearTimeout/g) || []).length;
  
  if (setTimeoutCount > clearTimeoutCount && setTimeoutCount > 3) {
    warnings.push({
      type: 'RESOURCE_LEAK',
      file: filePath,
      issue: `Many setTimeout (${setTimeoutCount}) without matching clearTimeout (${clearTimeoutCount})`
    });
  }
}

// Check for unhandled promises in critical paths
function checkUnhandledPromises(filePath, content) {
  // Look for .then() without .catch()
  const thenMatches = content.matchAll(/\.then\([^)]*\)(?!\s*\.catch)/g);
  
  for (const match of thenMatches) {
    const context = content.substring(match.index - 50, match.index + 50);
    if (!context.includes('await') && !context.includes('catch')) {
      warnings.push({
        type: 'UNHANDLED_PROMISE',
        file: filePath,
        issue: 'Promise without catch handler',
        context: context
      });
    }
  }
}

// Check for race conditions
function checkRaceConditions(filePath, content) {
  // Check for concurrent database writes without transactions
  if (content.includes('prisma.') && content.includes('update') && !content.includes('transaction')) {
    warnings.push({
      type: 'RACE_CONDITION',
      file: filePath,
      issue: 'Database update without transaction'
    });
  }
}

// Check for WebSocket leaks
function checkWebSocketLeaks(filePath, content) {
  if (content.includes('socket.on(') || content.includes('ws.on(')) {
    if (!content.includes('socket.disconnect()') && !content.includes('socket.close()') && !content.includes('ws.close()')) {
      // Check if it's a handler that should cleanup
      if (filePath.includes('/services/') || filePath.includes('/sockets/')) {
        criticalIssues.push({
          type: 'WEBSOCKET_LEAK',
          file: filePath,
          issue: 'Socket event listener without cleanup'
        });
      }
    }
  }
}

// Check for duplicate logic
const functionSignatures = new Map();

function checkDuplicateLogic(filePath, content) {
  const functions = content.matchAll(/(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g);
  
  for (const match of functions) {
    const funcName = match[1];
    const signature = `${filePath}:${funcName}`;
    
    if (functionSignatures.has(funcName)) {
      const existing = functionSignatures.get(funcName);
      if (existing !== filePath) {
        warnings.push({
          type: 'DUPLICATE_LOGIC',
          file: filePath,
          issue: `Function '${funcName}' also exists in ${existing}`
        });
      }
    }
    functionSignatures.set(funcName, filePath);
  }
}

// Main audit
console.log('=== FleetNimble Critical Code Audit ===\n');

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

console.log(`Scanning ${files.length} files...\n`);

files.forEach(filePath => {
  const relativePath = filePath.replace(SRC_DIR, '').replace(/\\/g, '/');
  const content = readFileSync(filePath, 'utf-8');
  
  checkCircularImports(relativePath, content);
  checkMemoryLeaks(relativePath, content);
  checkUnhandledPromises(relativePath, content);
  checkRaceConditions(relativePath, content);
  checkWebSocketLeaks(relativePath, content);
  checkDuplicateLogic(relativePath, content);
});

detectCircularDependencies();

// Print results
console.log('=== CRITICAL ISSUES ===\n');
if (criticalIssues.length === 0) {
  console.log('✓ No critical issues found');
} else {
  console.log(`Found ${criticalIssues.length} critical issues:\n`);
  criticalIssues.forEach((issue, i) => {
    console.log(`${i + 1}. [${issue.type}] ${issue.file}`);
    console.log(`   ${issue.issue}`);
    if (issue.cycle) {
      console.log(`   Cycle: ${issue.cycle.join(' -> ')}`);
    }
    console.log();
  });
}

console.log('=== WARNINGS ===\n');
if (warnings.length === 0) {
  console.log('✓ No warnings');
} else {
  console.log(`Found ${warnings.length} warnings:\n`);
  warnings.forEach((issue, i) => {
    console.log(`${i + 1}. [${issue.type}] ${issue.file}`);
    console.log(`   ${issue.issue}`);
    if (issue.context) {
      console.log(`   Context: ${issue.context}`);
    }
    console.log();
  });
}

console.log('=== AUDIT SUMMARY ===\n');
console.log(`Critical Issues: ${criticalIssues.length}`);
console.log(`Warnings: ${warnings.length}`);
console.log(`Files Scanned: ${files.length}`);

if (criticalIssues.length === 0 && warnings.length === 0) {
  console.log('\n✓ Code audit passed');
  process.exit(0);
} else {
  console.log('\n⚠ Review issues before production deployment');
  process.exit(1);
}
