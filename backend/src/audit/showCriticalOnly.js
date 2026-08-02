/**
 * Show only critical issues from audit
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SRC_DIR = join(__dirname, '..');

const criticalIssues = [];

// Check for actual memory leaks
function checkMemoryLeaks(filePath, content) {
  if (content.includes('addEventListener') && !content.includes('removeEventListener')) {
    if (filePath.includes('/services/')) {
      criticalIssues.push({
        type: 'MEMORY_LEAK',
        file: filePath,
        issue: 'addEventListener without removeEventListener in service'
      });
    }
  }
  
  const setIntervalCount = (content.match(/setInterval/g) || []).length;
  const clearIntervalCount = (content.match(/clearInterval/g) || []).length;
  
  if (setIntervalCount > clearIntervalCount) {
    criticalIssues.push({
      type: 'RESOURCE_LEAK',
      file: filePath,
      issue: `setInterval (${setIntervalCount}) without matching clearInterval (${clearIntervalCount})`
    });
  }
}

function checkWebSocketLeaks(filePath, content) {
  if (content.includes('socket.on(') || content.includes('ws.on(')) {
    if (!content.includes('socket.disconnect()') && !content.includes('socket.close()') && !content.includes('ws.close()')) {
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

console.log('=== CRITICAL ISSUES ONLY ===\n');

files.forEach(filePath => {
  const relativePath = filePath.replace(SRC_DIR, '').replace(/\\/g, '/');
  const content = readFileSync(filePath, 'utf-8');
  checkMemoryLeaks(relativePath, content);
  checkWebSocketLeaks(relativePath, content);
});

if (criticalIssues.length === 0) {
  console.log('✓ No critical issues found');
} else {
  console.log(`Found ${criticalIssues.length} critical issues:\n`);
  criticalIssues.forEach((issue, i) => {
    console.log(`${i + 1}. [${issue.type}] ${issue.file}`);
    console.log(`   ${issue.issue}\n`);
  });
}
