/**
 * Example timeout calculations for different file sizes
 * Run with: pnpm tsx src/tests/upload-timeout-examples.ts
 */

// Constants from pwa-queue.ts
const BASE_UPLOAD_TIMEOUT = 20 * 60 * 1000; // 20 minutes
const MIN_UPLOAD_SPEED_BPS = 100 * 1024; // 100 KB/s

function calculateUploadTimeout(fileSizeBytes: number): number {
  if (fileSizeBytes <= 0) {
    return BASE_UPLOAD_TIMEOUT;
  }
  
  const estimatedTimeSeconds = fileSizeBytes / MIN_UPLOAD_SPEED_BPS;
  const estimatedTimeMs = estimatedTimeSeconds * 1000;
  
  return Math.max(BASE_UPLOAD_TIMEOUT, estimatedTimeMs);
}

function formatTimeout(ms: number): string {
  const minutes = Math.floor(ms / 1000 / 60);
  const seconds = Math.floor((ms / 1000) % 60);
  return `${minutes}m ${seconds}s`;
}

console.log('Upload Timeout Calculations (Assuming 100 KB/s minimum speed)\n');
console.log('='.repeat(70));

const testCases = [
  { size: 1, unit: 'MB' },
  { size: 10, unit: 'MB' },
  { size: 25, unit: 'MB' },
  { size: 50, unit: 'MB' },
  { size: 100, unit: 'MB' },
  { size: 150, unit: 'MB' },
  { size: 200, unit: 'MB' },
  { size: 500, unit: 'MB' },
];

testCases.forEach(({ size, unit }) => {
  const sizeBytes = size * 1024 * 1024;
  const timeout = calculateUploadTimeout(sizeBytes);
  const timeoutFormatted = formatTimeout(timeout);
  
  console.log(`${size.toString().padStart(3)} ${unit}: ${timeoutFormatted.padStart(10)} (${(timeout / 1000).toFixed(0)}s)`);
});

console.log('='.repeat(70));
console.log('\nBase timeout: 20 minutes (applied to all files)');
console.log('Additional time: Calculated based on file size / 100 KB/s');
console.log('\nEdge cases:');
console.log(`  0 bytes: ${formatTimeout(calculateUploadTimeout(0))}`);
console.log(`  Negative: ${formatTimeout(calculateUploadTimeout(-100))}`);
