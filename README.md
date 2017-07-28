### Mocha reporter for EPAM report portal
This is mocha runtime reporter for [EPAM report portal](https://github.com/reportportal/reportportal).

It was designed to work with mocha programmatically, in order to be able to parametrize each test run.


#### Instalation steps:

` npm install mocha-rp-reporter`

#### How to use:

```javascript
const Mocha = require("mocha");
let mochaMain = new Mocha({    
    reporter: 'mocha-rp-reporter',
    reporterOptions: {
        configFile: "path to config.json",
        configOptions: {
            endpoint: "EPAM report portal api url",
            username: "user",
            password: "password",
            launch: "execution name",
            project: "project name",
            tags: [
                "tag1", "tag2"
            ]
        }                        
    }
});
```

`config.json` should look like this:

```json
{
  "endpoint": "EPAM report portal api url",
  "username": "user",
  "password": "password",
  "launch": "execution name",
  "project": "project name",
  "tags": [
    "tag1", "tag2"
  ]
}
```

By default, this reporter will use `configOptions` otherwise will try to load file from `configFile`

#### New feature
Now you can execute more than one mocha test and rp will show them in one launch collection.
Add `phase`(=start, end, or test) among the report options (--reporter-options or -O), to specify if it is the first, last or the others.
You *always* have to specify `launchidfile` as report option parameter:
 - when it is used with `phase=start`, it is a the file path where the launch id is stored;
 - in all other cases, it's the file path where this reporter will find the launch id needed to continue the same testing session.


###### WARNING: Test execution will slow down due to sync request to RP
