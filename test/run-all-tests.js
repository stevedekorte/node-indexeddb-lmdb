import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

const testFiles = [
    'test/getall-test.js',
    'test/index-test.js', 
    'test/transaction-test.js',
    'test/sync-ops-test.js',
    'test/single-op-test.js',
    'test/data-test.js',
    'test/test.js',
    'test/final-verification.js',
    'test/simple-test.js'
];

async function runTest(testFile) {
    return new Promise((resolve) => {
        console.log(`\n🧪 Running ${testFile}...`);
        
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
        
        // Set a 15-second timeout for each test
        const timeout = setTimeout(() => {
            child.kill('SIGTERM');
            resolve({
                file: testFile,
                passed: false,
                error: 'Test timed out after 15 seconds',
                stdout: stdout,
                stderr: stderr
            });
        }, 15000);
        
        child.on('close', (code) => {
            clearTimeout(timeout);
            const passed = code === 0 && !stderr.includes('Error') && !stdout.includes('❌') && !stdout.includes('failed');
            
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

async function runAllTests() {
    console.log('🚀 Running IndexedDB test suite...\n');
    
    const results = [];
    
    for (const testFile of testFiles) {
        // Clean database before each test
        try {
            await fs.rm('./indexeddb', { recursive: true, force: true });
        } catch (e) {
            // Ignore if directory doesn't exist
        }
        
        const result = await runTest(testFile);
        results.push(result);
        
        if (result.passed) {
            console.log(`✅ ${testFile} - PASSED`);
        } else {
            console.log(`❌ ${testFile} - FAILED: ${result.error}`);
            if (result.stderr) {
                console.log(`   stderr: ${result.stderr.slice(0, 200)}...`);
            }
        }
    }
    
    // Calculate statistics
    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const passRate = Math.round((passedTests / totalTests) * 100);
    
    console.log('\n📊 Test Results Summary:');
    console.log(`Total tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Pass rate: ${passRate}%`);
    
    console.log('\n📋 Detailed Results:');
    results.forEach(result => {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`${status} - ${result.file}`);
        if (!result.passed && result.error) {
            console.log(`    Error: ${result.error}`);
        }
    });
    
    return { totalTests, passedTests, failedTests, passRate, results };
}

// Run the tests
runAllTests().then(results => {
    console.log(`\n🎯 Final Pass Rate: ${results.passRate}%`);
    process.exit(0);
}).catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
});