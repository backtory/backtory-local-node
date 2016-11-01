var cp = require('child_process');
var request = require('request');
var fs = require('fs');

var config = require('./config');


var Q = require('q');
function spawn(makeGenerator, requestBody, context) {
    var p = Q.async(makeGenerator)(requestBody, context);
    p.then(function(result){
        send_result(context.requestId, result, null);
    }).catch(function(error){
        save_user_logs(context.requestId, error.stack);
        send_result(context.requestId, null, error.message);
    })
}
Q.spawn = spawn;


var controller;
var loadedModules = {};

var Controller = function(userCodesPath, callback) {

    this.userCodesPath = userCodesPath;
    this.requestsInfo = {};     // key: requestId -> value: { httpRequest, httpResponse, logs, ??? }
    this.runningRequests = [];  // [ requestId1, requestId2, ... ]
    this.modules = {};          // key: functionName + '-' + functionVersion -> [ version1, version2, ... ]

    this.functionsDir = this.userCodesPath;
    this.debug = config.debug;
    controller = this;
};


var sampleGenerator = function *sampleGenerator(){};

function isGenerator(arg) {
    return arg.constructor === sampleGenerator.constructor;
}

function isGeneratorFunction(obj) {
    var constructor = obj.constructor;
    if (!constructor) return false;
    if ('GeneratorFunction' === constructor.name || 'GeneratorFunction' === constructor.displayName) return true;
    return isGenerator(constructor.prototype);
}


Controller.prototype.runRequest = function (requestId, requestHeaders, functionName, functionVersion,
                                            handlerName, timeLimit, userId, userName, authenticationId,
                                            keyType, event, callback) {
    var controller = this;
    controller.runningRequests.push(requestId);

    var timeOutChecker = setTimeout(function () {
        var message = "Process killed before completing request";
        controller.log("time out happened for requestId: " + requestId);
        send_result(requestId, null, message);

    }, timeLimit);

    controller.requestsInfo[requestId] = {
        callback: callback,
        timeOutChecker: timeOutChecker,
        requestId: requestId,
        requestHeader: requestHeaders,
        functionName: functionName,
        functionVersion: functionVersion,
        handlerName: handlerName,
        timeLimit: timeLimit,
        startTime: new Date(),
        status: null,
        endTime: null,
        duration: null,
        returnValue: null,
        returnError: null,
        informationLogs: []
    };
    var securityContext = {
        userId: userId,
        userName: userName,
        authenticationId: authenticationId,
        keyType: keyType
    };

    var moduleName = handlerName.split('.')[0];
    var exportName = handlerName.split('.')[1];
    var lambdaModule = null, lambdaHandler = null;

    save_user_logs(requestId, "START requestId: " + requestId + " Version: " + controller.requestsInfo[requestId].functionVersion);

    try {
        delete require.cache[require.resolve(controller.functionsDir + '/' + moduleName + '.js')];
        lambdaModule = require(controller.functionsDir + '/' + moduleName + '.js');
    }
    catch(exception){
        var message = "Invalid module '" + moduleName + "'";
        save_user_logs(requestId, message);
        save_user_logs(requestId, exception.stack);
        send_result(requestId, null, message);
        return null;
    }

    lambdaHandler = lambdaModule[exportName];

    if( !lambdaHandler ){
        var message = "Handler '" + handlerName + "' missing on module '" + moduleName + "'";
        save_user_logs(requestId, message);
        send_result(requestId, null,message);
        return null;
    }

    try {
        var contextObj = Object.create(LambdaContext);
        contextObj.init(requestId, requestHeaders, securityContext);

        if (isGeneratorFunction(lambdaHandler)) {
            Q.spawn(lambdaHandler, event, contextObj);
        } else {
            lambdaHandler(event, contextObj);
        }
    }
    catch(exception) {
        save_user_logs(requestId, exception.stack);
        send_result(requestId, null,"Process exited before completing request");
        return null;
    }
};

module.exports = Controller;

var LambdaContext = {

    init: function(requestId, requestHeaders, securityContext) {
        this.requestId = requestId;
        this.requestHeaders = requestHeaders;
        this.securityContext = securityContext;
    },

    succeed: function(output){
        send_result(this.requestId, output, null);
        return;
    },

    fail: function(output){
        send_result(this.requestId, null, output);
        return;
    },

    getSecurityContext: function () {
        return this.securityContext;
    },

    getRequestHeaders: function () {
        return this.requestHeaders;
    },

    getRemainingTimeInMillis: function () {
        return controller.runningRequests[this.requestId].timeLimit -
                (new Date() - controller.runningRequests[this.requestId].startTime);
    },

    log: function () {
        save_user_logs(this.requestId, arguments);
    },

    warn: function () {
        save_user_logs(this.requestId, arguments);
    },

    error: function () {
        save_user_logs(this.requestId, arguments);
    },

    info: function () {
        save_user_logs(this.requestId, arguments);
    },

    debug: function () {
        save_user_logs(this.requestId, arguments);
    }
};



exports.LambdaContext = LambdaContext;


Controller.prototype.createFinalOutput = function (requestInfo) {
    var withError = false;

    if (typeof requestInfo.returnValue !== 'string')
        requestInfo.returnValue = JSON.stringify(requestInfo.returnValue, null, 0).replace(/"/g, "'");
    if (requestInfo.returnValue === "null") requestInfo.returnValue = "";

    if (requestInfo.returnError)
        withError = true;

    if (typeof requestInfo.returnError !== 'string')
        requestInfo.returnError = JSON.stringify(requestInfo.returnError, null, 0).replace(/"/g, "'");
    if (requestInfo.returnError === "null") requestInfo.returnError = "";

    return {
        requestId: requestInfo.requestId,
        withError: withError,
        returnValue: requestInfo.returnValue,
        returnError: requestInfo.returnError,
        durationInMilliSeconds: requestInfo.duration,
        informationLogs: requestInfo.informationLogs
    };
};

Controller.prototype.log = function(message) {
    var controller = this;
    if (controller.debug) console.log(message);
};


var getTime = function () {
    return new Date().toString().substr(0,24);
};

var save_user_logs = function (requestId, arguments) {
    var args = "";
    if (typeof arguments !== 'string') {
        for (var num in arguments) {
            var element = arguments[num];
            if (typeof element != "string") {
                args += JSON.stringify(element);
            } else {
                args += element;
            }
        }
    }
    else
        args += arguments;
    var chs = args.split("\n");
    var time = getTime();
    var freeSpace = "";
    for (var i = 0; i < chs.length; i++) {
        if(i==0)
            controller.requestsInfo[requestId].informationLogs.push(getTime() + ' ' + chs[i].replace(/"/g, "'"));
        else
            controller.requestsInfo[requestId].informationLogs.push(freeSpace + chs[i].replace(/"/g, "'"));
    }
};

var send_result = function(requestId, returnValue, returnError) {
    save_user_logs(requestId, "END requestId: " + requestId);
    var requestInfo = controller.requestsInfo[requestId];
    requestInfo.duration = new Date() - requestInfo.startTime;
    requestInfo.returnValue = returnValue;
    requestInfo.returnError = returnError;
    var output = controller.createFinalOutput(requestInfo);
    requestInfo.callback(output);

    var index = controller.runningRequests.indexOf(requestId);
    if (index > -1) {
        controller.runningRequests.splice(index, 1);
    }
    clearTimeout(requestInfo.timeOutChecker);
};


process.on('uncaughtException', function(err){
    for (var i=controller.runningRequests.length-1; i>=0; i-=1) {
        var requestId = controller.runningRequests[i];
        save_user_logs(requestId, err.stack);
        send_result(requestId, null, "Process exited before completing request");
    }
});
