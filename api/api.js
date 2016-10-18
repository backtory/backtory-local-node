var randomstring = require('randomstring');
var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var http = require('http');
var Controller = require('./controller');
var config = require('./config');
var jwt = require('jsonwebtoken');
var utils = require("./utils");

var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.set('views',  __dirname + '/views'); // specify the views directory
app.set('view engine', 'pug');
app.use('/static', express.static(__dirname + '/static'));

var backtoryPublicKey = null;
var cloudCodeFunctions = {};
var cloudCodeFunctionsUiData = [];
var authenticationId = null;
var masterKey = null;

var controller = new Controller(__dirname + "/../src", function(err){
});

app.post('/:functionName', function (req, res) {
    var requestId = randomstring.generate();
    var functionName = req.params.functionName;
    var requestHeaders = req.headers || {};
    var functionVersion = "LATEST";

    var showLogs = false;
    if (req.query.showLogs == 'true') showLogs = true;

    if (!(functionName in cloudCodeFunctions)) {
        var message = "Function " + functionName + " not found.";
        res.status(404).send({
            code: "1302",
            name: "FunctionNotFound",
            message: message,
            timestampe: new Date().getTime()
        });
        return;
    }
    var handlerName = cloudCodeFunctions[functionName].handlerName;
    var timeLimit = cloudCodeFunctions[functionName].timeLimitInMilliSeconds;
    var authenticationMode = cloudCodeFunctions[functionName].authenticationMode;

    var event = req.body;
    var contentType = req.headers['content-type'];
    var authorization = req.headers['authorization'];
    var userId = null;
    var userName = null;
    var keyType = null;

    if (authenticationMode == "PUBLIC") {
        if (authorization != null) {
            jwt.verify(authorization.split(" ")[1], backtoryPublicKey, function (err, decoded) {
                if (err)
                    console.log(err);
                else {
                    userId = decoded.user_id;
                    userName = decoded.user_name;
                    keyType = decoded.scope[0];
                }
                return;
            });
        }
    } else {
        if (authorization == null) {
            res.status(401).send({
                error: "unauthorized",
                error_description: "Full authentication is required to access this resource"
            });
            return;
        } else {
            jwt.verify(authorization.split(" ")[1], backtoryPublicKey, function (err, decoded) {
                if (err) {
                    res.status(401).send({
                        error: "unauthorized",
                        error_description: "Full authentication is required to access this resource"
                    });
                    return;
                }
                userId = decoded.user_id;
                userName = decoded.user_name;
                keyType = decoded.scope[0];
            });
        }
    }

    controller.runRequest(requestId, requestHeaders, functionName, functionVersion,
                         handlerName, timeLimit, userId, userName, authenticationId,
                         keyType, event, function(result) {
            if (result.returnError != "") {
                if (!showLogs)
                    res.status(420).send(result.returnError);
                else
                    res.status(420).send({
                        "response": result.returnError,
                        "logs": result.informationLogs
                    });
            }
            else {
                if (!showLogs)
                    res.status(200).send(result.returnValue);
                else
                    res.status(200).send({
                        "response": result.returnValue,
                        "logs": result.informationLogs
                    });
            }
    });
});

app.get('/', function (req, res) {
    res.render('index', {functionInfos: cloudCodeFunctionsUiData, authId: authenticationId, masterKey: masterKey});
});


utils.initialSetting(function(data, dataForUi, authId, mKey) {
    cloudCodeFunctions = data;
    cloudCodeFunctionsUiData = dataForUi;
    authenticationId = authId;
    masterKey = mKey;
    utils.getPublicKey(function(key) {
        backtoryPublicKey = key;
        utils.log(backtoryPublicKey + "\n");
        var server = app.listen(config.api.port, config.api.ip, function () {
            console.log('\nAPI starts listening at http://%s:%s',
                         server.address().address.replace("0.0.0.0", "localhost"), server.address().port);
        });
    });
});

