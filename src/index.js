exports.ping = function(requestBody, context) {
    context.log(context.getSecurityContext());
    context.succeed("pong");
};