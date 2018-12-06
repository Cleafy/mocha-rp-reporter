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
        if (phase == 'start' || phase == 'complete_test') {
            try {
                launchId = (connector.startLaunch()).body.id
            } catch (err) {
                console.error(`Failed to launch run. Error: ${err}`);
            }
            if (phase == 'start') {
                fs.writeFileSync(path.resolve(options.reporterOptions.launchidfile), launchId);
            }
        }
    })

    runner.on('suite', function(suite) {
        if (suite.title === '') {
            return
        }
        try {
            const options = {
                name: suite.title,
                launch: launchId,
                description: suite.fullTitle(),
                type: connector.RP_ITEM_TYPE.SUITE
            }
            const res = suiteStack.length == 0
                ? connector.startRootItem(options)
                : connector.startChildItem(options, suiteIds[suiteStack[suiteStack.length - 1].title])

            suiteStack.push(suite);

            if (res) {
                suiteIds[suite.title] = res.body.id
            }
        } catch (err) {
            console.error(`Failed to create root item. Error: ${err}`);
        }
    })

    runner.on('test', function(test) {
        try {
            const res = connector.startChildItem({
                name: test.title,
                launch: launchId,
                description: test.fullTitle(),
                type: connector.RP_ITEM_TYPE.TEST
            }, suiteIds[test.parent.title]);
            testIds[test.title] = res.body.id
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
    })

    runner.on('pass', function(test) {})

    runner.on('fail', function(test, err) {
        try {
            connector.sendLog(testIds[test.title], {
                level: connector.RP_LEVEL.FAILED,
                message: err.message
            });
        } catch (err) {
            console.error(`Failed to send log for item. Error: ${err}`);
        }
    })

    runner.on('pending', function (test) {
        try {
            const res = connector.startChildItem({
                name: test.title,
                launch: launchId,
                description: test.fullTitle(),
                type: connector.RP_ITEM_TYPE.TEST
            }, suiteIds[test.parent.title])

            connector.sendLog(res.body.id, {
                level: connector.RP_LEVEL.SKIPPED,
                message: test.title
            })

            connector.finishItem({
                status: connector.RP_STATUS.SKIPPED,
                id: res.body.id
            })
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
    })

    runner.on('test end', function(test) {
        // Try to finish a skipped item that it has just been closed
        // So we do nothing
        if (typeof test.state === 'undefined') {
            return
        }

        try {
            connector.finishItem({
                status: test.state,
                id: testIds[test.title]
            });
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
    })

    runner.on('suite end', function(suite) {
        if (suite.title === '') {
            return
        }
        try {
            connector.finishItem({
                status: suite.tests.filter(test => test.state === 'failed').length > 0 ? 'failed' : 'passed',
                id: suiteIds[suite.title]
            });
            suiteStack.pop();
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
    })

    runner.on('end', function(){
        if (phase == 'end' || phase == 'complete_test') {
            try {
                connector.finishLaunch(launchId);
            } catch (err) {
                console.error(`Failed to finish run. Error: ${err}`);
            }
        }
    })
}

module.exports = RPReporter;
