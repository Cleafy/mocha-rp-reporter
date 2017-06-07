"use strict";

const mocha = require('mocha');
const path = require('path');

function RPReporter(runner, options) {
    mocha.reporters.Base.call(this, runner);

    let config;
    let launchId = null;
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
            console.log(`Failed to send log for item. Error: ${err}`);
        }
    });

    runner.on('start', function()  {
        try {
            let res = connector.startLaunch();
            launchId = res.body.id;
        } catch (err) {
            console.log(`Failed to launch run. Error: ${err}`);
        }


    });

    runner.on('end', function(){
        try {
            connector.finishLaunch(launchId);
        } catch (err) {
            console.log(`Failed to finish run. Error: ${err}`);
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
                console.log(`Failed to create root item. Error: ${err}`);
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
            console.log(`Failed to create child item. Error: ${err}`);
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
            console.log(`Failed to create child item. Error: ${err}`);
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
            })

            connector.finishItem({
                status: connector.RP_STATUS.SKIPPED,
                id: res.body.id
            });
        } catch (err) {
            console.log(`Failed to create child item. Error: ${err}`);
        }
    });

    runner.on('test end', function(test){
        try {
            connector.finishItem({
                status: test.state,
                id: testIds[test.title]
            });
        } catch (err) {
            console.log(`Failed to create child item. Error: ${err}`);
        }
    });
}

module.exports = RPReporter;
