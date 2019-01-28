"use strict";

const mocha = require('mocha');
const path = require('path');
const fs = require('fs');

// load config
const getConfig = options => {
    try {
        return options.reporterOptions.configOptions
            ? options.reporterOptions.configOptions
            : require(path.join(process.cwd(), options.reporterOptions.configFile))
    } catch (err) {
        throw new Error(`Failed to load config. Error: ${err}`)
    }
}

const isValidPhase = phase => {
    return ['start', 'test', 'end'].includes(phase)
}

const getLaunchId = (phase, options) => {
    if (phase === 'complete_test' || phase === 'start') {
        return null
    }
    if (!(typeof options.reporterOptions.launchidfile === 'string')) {
        throw new Error('Parameter file missing or wrong')
    }
    if (phase === 'test' || phase === 'end') {
        try {
            return fs.readFileSync(path.resolve(options.reporterOptions.launchidfile), 'utf8')
        } catch (err) {
            throw new Error(`Failed to load launchId. ${err}`)
        }
    }
}

function RPReporter(runner, options) {
    mocha.reporters.Base.call(this, runner);

    const config = getConfig(options)
    const phase = isValidPhase(options.reporterOptions.phase)
        ? options.reporterOptions.phase
        : 'complete_test'
    let launchId = getLaunchId(phase, options)

    const connector = new (require("./rp_connector_sync"))(config);

    let suiteIds = {};
    let testIds = {};
    let suiteStack = [];

    runner.on('start', function()  {
        console.log('[SATRT] Entering... with phase: '+phase);
        if (phase == 'start' || phase == 'complete_test') {
            try {
                launchId = (connector.startLaunch()).body.id
                console.log('\t [START] launchId: '+launchId);
            } catch (err) {
                console.error(`Failed to launch run. Error: ${err}`);
            }
            if (phase == 'start') {
                fs.writeFileSync(path.resolve(options.reporterOptions.launchidfile), launchId);
            }
        }
        console.log('[START] Exiting...');
    })

    runner.on('suite', function(suite) {
        console.log('[SUITE] Entering on suite...');
        if (suite.title === '') {
            return
        }
        try {
            console.log('\t [SUITE] with suite: '+JSON.stringify(suite));
            const options = {
                name: suite.title,
                launch: launchId,
                description: suite.fullTitle(),
                type: connector.RP_ITEM_TYPE.SUITE
            }
            console.log('\t [SUITE] with options: '+JSON.stringify(options));
            const res = suiteStack.length == 0
                ? connector.startRootItem(options)
                : connector.startChildItem(options, suiteIds[suiteStack[suiteStack.length - 1].title])
            console.log('\t [SUITE] with res: '+JSON.stringify(res));
            suiteStack.push(suite);

            if (res) {
                suiteIds[suite.title] = res.body.id
            }
        } catch (err) {
            console.error(`Failed to create root item. Error: ${err}`);
        }
        console.log('[SUITE] Exiting...');
    })

    runner.on('test', function(test) {
        console.log('[TEST] Entering...');
        try {
            const res = connector.startChildItem({
                name: test.title,
                launch: launchId,
                description: test.fullTitle(),
                type: connector.RP_ITEM_TYPE.TEST
            }, suiteIds[test.parent.title]);
            console.log('\t [TEST] with res: '+JSON.stringify(res));
            testIds[test.title] = res.body.id
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
        console.log('[TEST] Exiting...');
    })

    runner.on('pass', function(test) {console.log('[PASS] Entring and exiting...')})

    runner.on('fail', function(test, err) {
        console.log('[FAIL] Entering...');
        try {
    
            connector.sendLog(testIds[test.title], {
                level: connector.RP_LEVEL.FAILED,
                message: err.message
            });
        } catch (err) {
            console.error(`Failed to send log for item. Error: ${err}`);
        }
        console.log('[FAIL] Exiting...');
    })

    runner.on('pending', function (test) {
        console.log('[PENDING] Entering...');
        try {
            const res = connector.startChildItem({
                name: test.title,
                launch: launchId,
                description: test.fullTitle(),
                type: connector.RP_ITEM_TYPE.TEST
            }, suiteIds[test.parent.title])
            console.log('\t [PENDING] with res: '+JSON.stringify(res));

            connector.sendLog(res.body.id, {
                level: connector.RP_LEVEL.SKIPPED,
                message: test.title
            })
            console.log('\t [PENDING] with body: '+JSON.stringify(body));

            connector.finishItem({
                status: connector.RP_STATUS.SKIPPED,
                id: res.body.id
            })
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
        console.log('[PENDING] Exiting...');
    })

    runner.on('test end', function(test) {
        // Try to finish a skipped item that it has just been closed
        // So we do nothing
        console.log('[TEST END] Entering...');
        if (typeof test.state === 'undefined') {
            return
        }
        try {
            console.log('\t [TEST END] ' + JSON.stringify({
                status: test.state,
                id: testIds[test.title]
            }));
            connector.finishItem({
                status: test.state,
                id: testIds[test.title]
            });
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
        console.log('[TEST END] Exiting...');
    })

    runner.on('suite end', function(suite) {
        console.log('[SUITE END] Entering...');
        console.log('\t [SUITE END] with suite: '+suite);
        if (suite.title === '') {
            return
        }
        try {
            connector.finishItem({
                status: suite.tests.filter(test => test.state === 'failed').length > 0 ? 'failed' : 'passed',
                id: suiteIds[suite.title]
            });
            console.log('\t [SUITE END] '+JSON.stringify({
                status: suite.tests.filter(test => test.state === 'failed').length > 0 ? 'failed' : 'passed',
                id: suiteIds[suite.title]
            }));
            suiteStack.pop();
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
        console.log('[SUITE END] Exiting...');
    })

    runner.on('end', function(){
        console.log('[END] Entering...')
        console.log('\t [END] with phase: '+phase);
        console.log('\t [END] with launchId: '+launchId);
        if (phase == 'end' || phase == 'complete_test') {
            try {
                connector.finishLaunch(launchId);
            } catch (err) {
                console.error(`Failed to finish run. Error: ${err}`);
            }
        }
        console.log('[END] Exiting ...');
    })
}

module.exports = RPReporter;
