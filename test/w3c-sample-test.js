import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

// Sample of key W3C tests to run
const sampleTests = [
    'src/test/web-platform-tests/converted/idbobjectstore_add.js',
    'src/test/web-platform-tests/converted/idbobjectstore_put.js',
    'src/test/web-platform-tests/converted/idbobjectstore_get.js',
    'src/test/web-platform-tests/converted/idbobjectstore_delete.js',
    'src/test/web-platform-tests/converted/idbobjectstore_getAll.js',
    'src/test/web-platform-tests/converted/idbindex_get.js',
    'src/test/web-platform-tests/converted/idbindex_getAll.js',
    'src/test/web-platform-tests/converted/idbcursor_continue_objectstore.js',
    'src/test/web-platform-tests/converted/idbcursor_advance_objectstore.js',
    'src/test/web-platform-tests/converted/idbtransaction.js',
    'src/test/web-platform-tests/converted/idbdatabase_createObjectStore.js',
    'src/test/web-platform-tests/converted/idbobjectstore_createIndex.js',
    'src/test/web-platform-tests/converted/idbfactory_open.js',
    'src/test/web-platform-tests/converted/idbkeyrange.js',
    'src/test/web-platform-tests/converted/value.js'
];

async function runTest(testFile) {
    return new Promise((resolve) => {
        console.log(`Running ${path.basename(testFile)}...`);
        
        const child = spawn('node', [testFile], {
            cwd: process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        // 10-second timeout for each test
        const timeout = setTimeout(() => {
            child.kill('SIGTERM');
            resolve({
                file: testFile,
                passed: false,
                error: 'Test timed out',
                stdout: stdout,
                stderr: stderr
            });
        }, 10000);
        
        child.on('close', (code) => {
            clearTimeout(timeout);
            
            // Check for success indicators in W3C tests
            const hasSuccess = stdout.includes('TEST PASSED') || 
                              stdout.includes('All tests passed') ||
                              (!stderr.includes('Error') && !stdout.includes('FAIL') && code === 0);
            
            const passed = hasSuccess && code === 0;
            
            resolve({
                file: testFile,
                passed: passed,
                exitCode: code,
                stdout: stdout,
                stderr: stderr,
                error: code !== 0 ? `Exit code: ${code}` : null
            });
        });
        
        child.on('error', (error) => {
            clearTimeout(timeout);
            resolve({
                file: testFile,
                passed: false,
                error: error.message,
                stdout: stdout,
                stderr: stderr
            });
        });
    });
}

async function runW3CSample() {
    console.log('🧪 Running sample W3C IndexedDB tests...\n');
    
    const results = [];
    
    for (const testFile of sampleTests) {
        // Clean database before each test
        try {
            await fs.rm('./indexeddb', { recursive: true, force: true });
        } catch (e) {
            // Ignore if directory doesn't exist
        }
        
        const result = await runTest(testFile);
        results.push(result);
        
        const testName = path.basename(result.file);
        if (result.passed) {
            console.log(`✅ ${testName}`);
        } else {
            console.log(`❌ ${testName} - ${result.error || 'Failed'}`);
        }
    }
    
    // Calculate statistics
    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const passRate = Math.round((passedTests / totalTests) * 100);
    
    console.log('\n📊 W3C Sample Test Results:');
    console.log(`Total tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Pass rate: ${passRate}%`);
    
    console.log('\n📋 Detailed Results:');
    results.forEach(result => {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        const testName = path.basename(result.file);
        console.log(`${status} - ${testName}`);
        if (!result.passed && result.error) {
            console.log(`    Error: ${result.error}`);
        }
    });
    
    return { totalTests, passedTests, failedTests, passRate, results };
}

// Run the tests
runW3CSample().then(results => {
    console.log(`\n🎯 W3C Sample Pass Rate: ${results.passRate}%`);
    process.exit(0);
}).catch(error => {
    console.error('W3C test runner failed:', error);
    process.exit(1);
});