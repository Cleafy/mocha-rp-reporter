"use strict";

const mocha = require('mocha');
const path = require('path');
const fs = require('fs');

function RPReporter(runner, options) {
    mocha.reporters.Base.call(this, runner);

    let config;
    var phase = options.reporterOptions.phase || 'complete_test';
    var launchId = null;

    if (phase != 'complete_test') {
        if (phase == 'start' && !(typeof options.reporterOptions.launchidfile === 'string'))
            throw 'Parameter file missing or wrong';
        else {
            if ('file' in options.reporterOptions) {
                try {//try to find file in cwd
                    launchId = fs.readFileSync(path.join(process.cwd(), options.reporterOptions.launchidfile), 'utf8');
                } catch (err) {
                    try {//try to find file in absolute path
                        launchId = fs.readFileSync(options.reporterOptions.launchidfile, 'utf8');
                    } catch (err) {
                        throw `Failed to load launchId. Error: ${err}`;
                    }
                }
            } else {//try to convert arg in launchId
                if ('launchId' in options.reporterOptions)
                    launchId = options.reporterOptions.launchId;
                else
                    throw `Failed to load launchId`;
            }
        }
    }

    let suiteIds = {};
    let testIds = {};
    let suiteStack = [];

    // load config
    try {
        config = options.reporterOptions.configOptions ? options.reporterOptions.configOptions : require(path.join(process.cwd(), options.reporterOptions.configFile));
    } catch (err) {
        console.error(`Failed to load config. Error: ${err}`);
    }

    let connector = new (require("./rp_connector_sync"))(config);

    runner.on('pass', function(test){
    });

    runner.on('fail', function(test, err){
        try {
            connector.sendLog(testIds[test.title], {
                level: connector.RP_LEVEL.FAILED,
                message: err.message
            });
        } catch (err) {
            console.error(`Failed to send log for item. Error: ${err}`);
        }
    });

    runner.on('start', function()  {
        if (phase == 'start' || phase == 'complete_test') {
            try {
                let res = connector.startLaunch();
                launchId = res.body.id;
            } catch (err) {
                console.error(`Failed to launch run. Error: ${err}`);
            }
            if (phase == 'start')
                if (options.reporterOptions.launchidfile.starsWith('/'))
                    fs.writeFileSync(options.reporterOptions.launchidfile, launchId);
                else
                    fs.writeFileSync(path.join(process.cwd(), options.reporterOptions.launchidfile), launchId);
        }
    });

    runner.on('end', function(){
        if (phase == 'end' || phase == 'complete_test') {
            try {
                connector.finishLaunch(launchId);
            } catch (err) {
                console.error(`Failed to finish run. Error: ${err}`);
            }
        }
    });

    runner.on('suite', function(suite){
        if(suite.title === "") {
            return true;
        } else {
            try {
                let res = null;

                if (suiteStack.length == 0) {
                    res = connector.startRootItem({
                        name: suite.title,
                        launch: launchId,
                        description: suite.fullTitle(),
                        type: connector.RP_ITEM_TYPE.SUITE
                    });
                } else {
                    res = connector.startChildItem({
                        name: suite.title,
                        launch: launchId,
                        description: suite.fullTitle(),
                        type: connector.RP_ITEM_TYPE.SUITE
                    }, suiteIds[suiteStack[suiteStack.length - 1].title]);
                }

                suiteStack.push(suite);

                if (res)
                    suiteIds[suite.title] = res.body.id;
            } catch (err) {
                console.error(`Failed to create root item. Error: ${err}`);
            }
        }
    });

    runner.on('suite end', function(suite){
        try {
            connector.finishItem({
                status: suite.tests.filter(test => test.state === "failed").length > 0 ? "failed" : "passed",
                id: suiteIds[suite.title]
            });
            suiteStack.pop();
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
    });

    runner.on('test', function(test){
        try {
            let res = connector.startChildItem({
                name: test.title,
                launch: launchId,
                description: test.fullTitle(),
                type: connector.RP_ITEM_TYPE.TEST
            }, suiteIds[test.parent.title]);
            testIds[test.title] = res.body.id;
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
    });

    runner.on('pending', function (test) {
        try {
            let res = connector.startChildItem({
                name: test.title,
                launch: launchId,
                description: test.fullTitle(),
                type: connector.RP_ITEM_TYPE.TEST
            }, suiteIds[test.parent.title]);

            connector.sendLog(res.body.id, {
                level: connector.RP_LEVEL.SKIPPED,
                message: test.title
            });

            connector.finishItem({
                status: connector.RP_STATUS.SKIPPED,
                id: res.body.id
            });
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
    });

    runner.on('test end', function(test){
        try {
            connector.finishItem({
                status: test.state,
                id: testIds[test.title]
            });
        } catch (err) {
            console.error(`Failed to create child item. Error: ${err}`);
        }
    });
}

module.exports = RPReporter;
