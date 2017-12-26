var crypto = require('crypto');
var async = require('async');

module.exports.generateHashString = function(length) {
    return crypto.randomBytes(Math.ceil(length/2))
        .toString('hex')
        .slice(0,length);
};

module.exports.isEthAddressCorrect = function( addr ) {
    return /0x[a-zA-Z0-9]*$/.test(addr);
}

module.exports.passwordHash = function( password ) {
    return crypto.createHash('md5').update(password).digest("hex");
}

module.exports.getRemoteIp = function( req ) {
    var xRemoteIp = req.headers['x-real-ip'];
    return xRemoteIp?xRemoteIp:req.connection.remoteAddress;
}

module.exports.scheduler = function( func, timeout ) {
    async.parallel([
        function() {
            var iterationNumber = 0;
            var currentThread = null;

            function scheduleNextUpdateIteration(timeout) {
                currentThread = setTimeout(function() {
                    iterationNumber++;
                    func(function() {
                        clearTimeout(currentThread);
                        scheduleNextUpdateIteration(timeout);
                    });
                }, timeout);
            }

            scheduleNextUpdateIteration(timeout);
        }
    ]);
}

module.exports.filterEthErrors = function( message, callback, params ) {
    if (message.indexOf("Transaction was not mined")==0) return callback(true, params);
    if (message.indexOf("Error: Failed to check for transaction")==0) return callback(true, params);
    return callback(false, message, params);
}