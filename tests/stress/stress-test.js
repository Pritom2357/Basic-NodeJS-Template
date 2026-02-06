const autocannon = require('autocannon');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = 'http://localhost:8000';

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

const scenarios = {
    light: {
        name: 'Light Load Test',
        connections: 10,
        duration: 30,
        pipelining: 1
    },
    medium: {
        name: 'Medium Load Test',
        connections: 50,
        duration: 60,
        pipelining: 1
    },
    heavy: {
        name: 'Heavy Load Test',
        connections: 100,
        duration: 60,
        pipelining: 1
    },
    spike: {
        name: 'Spike Test',
        connections: 200,
        duration: 30,
        pipelining: 1
    }
};

const endpoints = [
    {
        name: 'Health Check',
        path: '/',
        method: 'GET',
        headers: {},
        threshold: { latency: 100, errors: 0 }
    },
    {
        name: 'Init Table',
        path: '/api/auth/init-table',
        method: 'GET',
        headers: {},
        threshold: { latency: 500, errors: 0 }
    },
    {
        name: 'Login',
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            username: 'stress_test_user',
            password: 'StressTest123!'
        }),
        threshold: { latency: 300, errors: 5 }
    },
    {
        name: 'Register',
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            username: 'new_user_' + Date.now(),
            email: `stress_${Date.now()}@example.com`,
            password: 'NewUser123!'
        }),
        threshold: { latency: 500, errors: 5 }
    }
];

async function runStressTest(scenario, endpoint) {
    console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}${colors.blue}Testing: ${endpoint.name} | Scenario: ${scenario.name}${colors.reset}`);
    console.log(`${colors.cyan}─────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`URL: ${BASE_URL}${endpoint.path}`);
    console.log(`Connections: ${scenario.connections} | Duration: ${scenario.duration}s`);
    console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);

    const config = {
        url: BASE_URL + endpoint.path,
        connections: scenario.connections,
        duration: scenario.duration,
        pipelining: scenario.pipelining,
        method: endpoint.method,
        headers: endpoint.headers
    };

    if (endpoint.body) {
        config.body = endpoint.body;
    }

    return new Promise((resolve, reject) => {
        const instance = autocannon(config, (err, result) => {
            if (err) {
                console.error(`${colors.red}✖ Error running test: ${err.message}${colors.reset}`);
                reject(err);
                return;
            }

            
            const avgLatency = result.latency.mean;
            const p99Latency = result.latency.p99;
            const totalRequests = result.requests.total;
            const errorRate = ((result.errors + result.timeouts) / totalRequests * 100).toFixed(2);
            const reqPerSec = result.requests.average;

            console.log(`\n${colors.bold}Results:${colors.reset}`);
            console.log(`${colors.cyan}─────────────────────────────────────────────────────────${colors.reset}`);
            console.log(`Total Requests:      ${colors.bold}${totalRequests.toLocaleString()}${colors.reset}`);
            console.log(`Requests/sec:        ${colors.bold}${reqPerSec.toFixed(2)}${colors.reset}`);
            console.log(`Avg Latency:         ${colors.bold}${avgLatency.toFixed(2)} ms${colors.reset}`);
            console.log(`P99 Latency:         ${colors.bold}${p99Latency.toFixed(2)} ms${colors.reset}`);
            console.log(`Errors:              ${colors.bold}${result.errors}${colors.reset}`);
            console.log(`Timeouts:            ${colors.bold}${result.timeouts}${colors.reset}`);
            console.log(`Error Rate:          ${colors.bold}${errorRate}%${colors.reset}`);

            if (result.statusCodeStats) {
                console.log(`\nStatus Code Distribution:`);
                for (const [code, count] of Object.entries(result.statusCodeStats)) {
                    const percentage = (count / totalRequests * 100).toFixed(2);
                    console.log(`  ${code}: ${count} (${percentage}%)`);
                }
            }

            const passed = avgLatency < endpoint.threshold.latency && 
                          parseFloat(errorRate) <= endpoint.threshold.errors;

            console.log(`\n${colors.bold}Threshold Check:${colors.reset}`);
            console.log(`  Latency: ${avgLatency.toFixed(2)} ms < ${endpoint.threshold.latency} ms? ${avgLatency < endpoint.threshold.latency ? colors.green + '✓ PASS' : colors.red + '✖ FAIL'}${colors.reset}`);
            console.log(`  Error Rate: ${errorRate}% <= ${endpoint.threshold.errors}%? ${parseFloat(errorRate) <= endpoint.threshold.errors ? colors.green + '✓ PASS' : colors.red + '✖ FAIL'}${colors.reset}`);

            if (passed) {
                console.log(`\n${colors.bold}${colors.green}✓ TEST PASSED${colors.reset}`);
            } else {
                console.log(`\n${colors.bold}${colors.red}✖ TEST FAILED${colors.reset}`);
            }

            console.log(`${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);

            resolve({
                endpoint: endpoint.name,
                scenario: scenario.name,
                passed,
                metrics: {
                    totalRequests,
                    reqPerSec,
                    avgLatency,
                    p99Latency,
                    errors: result.errors,
                    timeouts: result.timeouts,
                    errorRate: parseFloat(errorRate)
                }
            });
        });

        autocannon.track(instance, { renderProgressBar: true });
    });
}

// Main execution
async function main() {
    const scenarioName = process.argv[2] || 'light';
    const endpointFilter = process.argv[3];

    const scenario = scenarios[scenarioName];
    if (!scenario) {
        console.error(`${colors.red}Invalid scenario: ${scenarioName}${colors.reset}`);
        console.log(`Available scenarios: ${Object.keys(scenarios).join(', ')}`);
        process.exit(1);
    }

    const endpointsToTest = endpointFilter
        ? endpoints.filter(e => e.name.toLowerCase().includes(endpointFilter.toLowerCase()))
        : endpoints;

    if (endpointsToTest.length === 0) {
        console.error(`${colors.red}No endpoints found matching: ${endpointFilter}${colors.reset}`);
        process.exit(1);
    }

    console.log(`${colors.bold}${colors.blue}`);
    console.log(`╔═══════════════════════════════════════════════════════╗`);
    console.log(`║         STRESS TEST SUITE - ${scenario.name.toUpperCase().padEnd(18)}║`);
    console.log(`╚═══════════════════════════════════════════════════════╝`);
    console.log(`${colors.reset}`);
    console.log(`Target: ${colors.bold}${BASE_URL}${colors.reset}`);
    console.log(`Endpoints to test: ${colors.bold}${endpointsToTest.length}${colors.reset}`);
    console.log(`Started at: ${colors.bold}${new Date().toLocaleString()}${colors.reset}\n`);

    const results = [];

    // Run tests sequentially to avoid overwhelming the server
    for (const endpoint of endpointsToTest) {
        try {
            const result = await runStressTest(scenario, endpoint);
            results.push(result);
            
            if (endpoint !== endpointsToTest[endpointsToTest.length - 1]) {
                console.log(`${colors.yellow}Cooling down for 5 seconds...${colors.reset}\n`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } catch (error) {
            console.error(`${colors.red}✖ Test failed: ${error.message}${colors.reset}`);
            results.push({
                endpoint: endpoint.name,
                scenario: scenario.name,
                passed: false,
                error: error.message
            });
        }
    }

    // Summary
    console.log(`\n${colors.bold}${colors.blue}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bold}${colors.blue}║                    SUMMARY REPORT                     ║${colors.reset}`);
    console.log(`${colors.bold}${colors.blue}╚═══════════════════════════════════════════════════════╝${colors.reset}\n`);

    const passedTests = results.filter(r => r.passed).length;
    const totalTests = results.length;

    results.forEach(result => {
        const status = result.passed 
            ? `${colors.green}✓ PASS${colors.reset}` 
            : `${colors.red}✖ FAIL${colors.reset}`;
        console.log(`${status} ${result.endpoint} (${result.scenario})`);
        
        if (result.metrics) {
            console.log(`     Req/sec: ${result.metrics.reqPerSec.toFixed(2)} | Latency: ${result.metrics.avgLatency.toFixed(2)}ms | Errors: ${result.metrics.errorRate}%`);
        }
    });

    const overallStatus = passedTests === totalTests
        ? `${colors.bold}${colors.green}ALL TESTS PASSED${colors.reset}`
        : `${colors.bold}${colors.red}SOME TESTS FAILED${colors.reset}`;

    console.log(`\n${overallStatus}`);
    console.log(`${colors.bold}Result: ${passedTests}/${totalTests} tests passed${colors.reset}`);
    console.log(`Completed at: ${colors.bold}${new Date().toLocaleString()}${colors.reset}\n`);

    process.exit(passedTests === totalTests ? 0 : 1);
}

process.on('uncaughtException', (error) => {
    console.error(`${colors.red}Uncaught exception: ${error.message}${colors.reset}`);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error(`${colors.red}Unhandled rejection: ${error.message}${colors.reset}`);
    process.exit(1);
});

if (require.main === module) {
    main();
}

module.exports = { runStressTest, scenarios, endpoints };
