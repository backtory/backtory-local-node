var Table = require('cli-table2');
var fs = require('fs');
var unirest = require('unirest');
var Client = require('node-rest-client').Client;
var client = new Client();
var config = require('./config');

var utils = module.exports = {

    isHandlerNameValid: function(handlerName) {
        try {
            return !(!handlerName || handlerName.length < 3 || handlerName.indexOf('.')==0 ||
            handlerName.split('.')[0].length < 1 || handlerName.split('.')[1].length < 1);
        } catch (err) {
            return false;
        }
    },

    isAuthenticationModeValid: function(authenticationMode) {
        return !(!authenticationMode || (authenticationMode != "PUBLIC" && authenticationMode != "AUTHENTICATED"));

    },

    initialSetting: function (callback) {
        utils.log("Initial configuration ...\n");
        console.log("Reading list of cloud-code functions:\n");

        var dataForUi = [];
        var configFileName = __dirname + "/../src/lambda_config.json";
        fs.stat(configFileName, function(err, stat) {
            if(err == null) {
                fs.readFile(configFileName, 'utf8', function (err,data) {
                    if (err) {
                        console.error("Error reading configuration file (lambda_config.json).\n");
                        console.error(err);
                        process.exit(1);
                    }
                    var lambdaConfig = {};
                    try {
                        lambdaConfig = JSON.parse(data);
                    } catch (err) {
                        console.error("Configuration file (lambda_config.json) must be a valid json file.\n");
                        console.error(err);
                        process.exit(1);
                    }
                    var ctr = 0;
                    var notExistCtr = 0;
                    var syntaxErrorCtr = 0;

                    var table = new Table({ head: [
                        {content:"", hAlign:'center'},
                        {content:"Name", hAlign:'center'},
                        {content:"Handler", hAlign:'center'},
                        {content:"Authentication", hAlign:'center'},
                        {content:"Timeout", hAlign:'center'},
                        {content:"Path", hAlign:'center'},
                        {content:"Exist", hAlign:'center'},
                        {content:"Syntax", hAlign:'center'}
                    ]});

                    Object.keys(lambdaConfig).forEach(function(name) {
                        var val = lambdaConfig[name];
                        var handler = val['handlerName'];
                        if (!handler) handler = "index.handler";
                        if (!utils.isHandlerNameValid(handler)) {
                            console.error("Bad handler '" + handler + "' for function '" + name + "'.");
                            process.exit(1);
                        }
                        var path = "src/" + handler.substr(0, handler.indexOf(".")) + ".js";
                        var timeOut = val["timeLimitInMilliSeconds"];
                        if (!timeOut) timeOut = 3000;
                        var authenticationMode = val['authenticationMode'];
                        if (!authenticationMode)
                            authenticationMode = "PUBLIC";
                        if (!utils.isAuthenticationModeValid(authenticationMode)) {
                            console.error("Error: Bad authenticationMode '" + authenticationMode + "' " +
                                          "for function '" + name + "'.");
                            console.error("Only acceptable values are 'PUBLIC' and 'AUTHENTICATED'.");
                            process.exit(1);
                        }
                        lambdaConfig[name]["handler"] = handler;
                        lambdaConfig[name]["authenticationMode"] = authenticationMode;
                        lambdaConfig[name]["timeLimitInMilliSeconds"] = timeOut;

                        if ("schedulingCron" in lambdaConfig[name]) {
                            if (lambdaConfig[name]["schedulingCron"] == "0 0/1 * ? * ?") {
                                setInterval(function () {
                                    var url = 'http://' + config.api.ip + ":" + config.api.port + "/" + name + "/";
                                    var request = unirest.post(url);
                                    request
                                        .timeout(timeOut)
                                        .headers({'Content-Type': 'application/json'})
                                        .send({})
                                        .end(function (response) {
                                            console.log("job response status = " + response.status);
                                        });
                                }, 60000);
                            }
                        } else {
                            //console.error("other jobs not supported yet");
                        }

                        var syntaxCorrectness = "WRONG";
                        var fileExist = "YES";
                        ctr+=1;
                        if (!fs.existsSync(__dirname + "/../" + path)) {
                            fileExist = "NO";
                            notExistCtr++;
                            syntaxCorrectness = "-";
                        } else {
                            try {
                                require(__dirname + "/../" + path);
                                syntaxCorrectness = "CORRECT";
                            } catch (err) {
                                syntaxErrorCtr++;
                            }
                        }
                        table.push([
                                {content:ctr, hAlign:'center'},
                                {content:name, hAlign:'center'},
                                {content:handler, hAlign:'center'},
                                {content:authenticationMode, hAlign:'center'},
                                {content:timeOut, hAlign:'center'},
                                {content:path, hAlign:'center'},
                                {content:fileExist, hAlign:'center'},
                                {content:syntaxCorrectness, hAlign:'center'}
                            ]
                        );
                        dataForUi.push([
                            ctr, name, handler, authenticationMode, timeOut, path, fileExist, syntaxCorrectness
                        ]);
                    });
                    table.push([
                            {content:"Errors Detected", hAlign:'center', "colSpan": 6},
                            {content:notExistCtr, hAlign:'center'},
                            {content:syntaxErrorCtr, hAlign:'center'}
                        ]
                    );

                    console.log(table.toString());


                    utils.readIntegrationInfo(function (authId, masterKey, clientKey) {
                        callback(lambdaConfig, dataForUi, authId, masterKey, clientKey);
                    });

                });

            } else if(err.code == 'ENOENT') {
                console.error("Configuration file (lambda_config.json) doesn't exist in 'api' folder.\n");
                console.error(err);
                process.exit(1);
            } else {
                console.error("Error accessing configuration file (lambda_config.json).\n");
                console.error(err);
                process.exit(1);
            }
        });
    },

    getPublicKey: function(callback) {
        utils.log("\nReading Backtory Public Key:\n");
        var req = client.get("https://api.backtory.com/auth/token_key", function (data, response) {
            callback(data.value);
        });
    },

    log: function(message) {
        if (config.debug) {
            if (typeof message == "string")
                console.log(message);
            else
                console.log(JSON.stringify(message, null, 2));
        }
    },

    readIntegrationInfo: function(callback) {
        var configFileName = __dirname + "/../backtory_config.json";
        var result = {};
        console.log("\n\nReading Backtory Config file:");

        fs.stat(configFileName, function(err, stat) {
            if (err == null) {
                fs.readFile(configFileName, 'utf8', function (err,data) {
                    if (err) {
                        console.error("Error reading configuration file 'backtory_config.json'.\n");
                        console.error(err);
                        process.exit(1);
                    }
                    try {
                        result = JSON.parse(data);
                    } catch (err) {
                        console.error("Configuration file 'backtory_config.json' must be a valid json file.\n");
                        console.error(err);
                        process.exit(1);
                    }

                    if (!("masterKey" in result)) {
                        console.error("Error: 'backtory_config.json' file must contain 'masterKey' field.");
                        process.exit(1);
                    }

                    if (result['masterKey'] == "---") {
                        console.error("Error: You must set 'masterKey' field in 'backtory_config.json' file .");
                        process.exit(1);
                    }


                    if (result['clientKey'] == "---") {
                        console.error("Error: You must set 'clientKey' field in 'backtory_config.json' file .");
                        process.exit(1);
                    }

                    var table = new Table({ head: [
                        {content:"Name", hAlign:'center'},
                        {content:"Backtory Key", hAlign:'center'}
                    ]});

                    Object.keys(result).forEach(function(key) {
                        table.push([
                                {content:key, hAlign:'center'},
                                {content:result[key], hAlign:'center'}
                            ]
                        );
                    });
                    console.log(table.toString());
                    callback(result['authenticationId'], result['masterKey'], result['clientKey']);
                });
            } else if(err.code == 'ENOENT') {
                console.error("Configuration file 'backtory_config.json' doesn't exist in project folder.\n");
                console.error(err);
                process.exit(1);
            } else {
                console.error("Error accessing configuration file 'backtory_config.json'.\n");
                console.error(err);
                process.exit(1);
            }
       });
    }

};