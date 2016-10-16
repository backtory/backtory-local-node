exports.add = function(requestBody, context) {
    var x = requestBody.x;
    var y = requestBody.y;

    context.log("First number = " + x);
    context.log("Second number = " + y);
    context.log("Answer = " + (x+y));
    context.succeed(x+y);
};