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
        console.log('Entering on start... with phase: '+phase);
        if (phase == 'start' || phase == 'complete_test') {
            try {
                launchId = (connector.startLaunch()).body.id
                console.log('launchId: '+launchId);
            } catch (err) {
                console.error(`Failed to launch run. Error: ${err}`);
            }
            if (phase == 'start') {
                fs.writeFileSync(path.resolve(options.reporterOptions.launchidfile), launchId);
            }
        }
        console.log('Exiting on start...');
    })

    runner.on('suite', function(suite) {
        console.log('Entering on suite...');
        if (suite.title === '') {
            return
        }
        try {
            console.log('with suite: '+suite);
            const options = {
                name: suite.title,
                launch: launchId,
                description: suite.fullTitle(),
                type: connector.RP_ITEM_TYPE.SUITE
            }
            console.log('with options: '+options);
            const res = suiteStack.length == 0
                ? connector.startRootItem(options)
                : connector.startChildItem(options, suiteIds[suiteStack[suiteStack.length - 1].title])
            console.log('with res: '+res);
            suiteStack.push(suite);

            if (res) {
                suiteIds[suite.title] = res.body.id
            }
        } catch (err) {
            console.error(`Failed to create root item. Error: ${err}`);
        }
        console.log('Exiting on suite...');
    })

    runner.on('test', function(test) {
        console.log('Entering on test...');
        try {
            const res = connector.startChildItem({
                name: test.title,
                launch: launchId,
                description: test.fullTitle(),
                type: connector.RP_ITEM_TYPE.TEST
            }, suiteIds[test.parent.title]);
            console.log('with res: '+res);
            testIds[test.title] = res.body.id
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
        console.log('Exiting on test...');
    })

    runner.on('pass', function(test) {console.log('Entring and exiting on pass')})

    runner.on('fail', function(test, err) {
        console.log('Entering on fail...');
        try {
    
            connector.sendLog(testIds[test.title], {
                level: connector.RP_LEVEL.FAILED,
                message: err.message
            });
            console.log('with test...');
        } catch (err) {
            console.error(`Failed to send log for item. Error: ${err}`);
        }
        console.log('Exiting on fail...');
    })

    runner.on('pending', function (test) {
        console.log('Entering on pending...');
        try {
            const res = connector.startChildItem({
                name: test.title,
                launch: launchId,
                description: test.fullTitle(),
                type: connector.RP_ITEM_TYPE.TEST
            }, suiteIds[test.parent.title])
            console.log('with res: '+res);

            connector.sendLog(res.body.id, {
                level: connector.RP_LEVEL.SKIPPED,
                message: test.title
            })
            console.log('with body: '+body);

            connector.finishItem({
                status: connector.RP_STATUS.SKIPPED,
                id: res.body.id
            })
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
        console.log('Exiting on pending...');
    })

    runner.on('test end', function(test) {
        // Try to finish a skipped item that it has just been closed
        // So we do nothing
        console.log('Entering on test end...');
        if (typeof test.state === 'undefined') {
            return
        }
        try {
            console.log({
                status: test.state,
                id: testIds[test.title]
            });
            connector.finishItem({
                status: test.state,
                id: testIds[test.title]
            });
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
        console.log('Exiting on test end...');
    })

    runner.on('suite end', function(suite) {
        console.log('Entering on suite end...');
        console.log('with suite: '+suite);
        if (suite.title === '') {
            return
        }
        try {
            connector.finishItem({
                status: suite.tests.filter(test => test.state === 'failed').length > 0 ? 'failed' : 'passed',
                id: suiteIds[suite.title]
            });
            console.log({
                status: suite.tests.filter(test => test.state === 'failed').length > 0 ? 'failed' : 'passed',
                id: suiteIds[suite.title]
            })
            suiteStack.pop();
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
        console.log('Exiting on suite end...');
    })

    runner.on('end', function(){
        console.log('Entering on end...')
        console.log('with phase: '+phase);
        console.log('with launchId: '+launchId);
        if (phase == 'end' || phase == 'complete_test') {
            try {
                connector.finishLaunch(launchId);
            } catch (err) {
                console.error(`Failed to finish run. Error: ${err}`);
            }
        }
        console.log('Exiting on end...');
    })
}

module.exports = RPReporter;
