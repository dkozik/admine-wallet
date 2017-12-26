var bitcoin = require('bitcoin');
var config = require('../config');
var btcConfig = config.get('wallet:btc');

var client = new bitcoin.Client({
    host: btcConfig.host,
    port: btcConfig.port,
    user: btcConfig.user,
    pass: btcConfig.pass,
    timeout: btcConfig.timeout
});

function makeid() {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < 5; i++ ) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
}

module.exports = {
    createNewWallet: function( password, callback ) {
        var id = makeid();
        client.cmd('getnewaddress', id, function( err, addr ) {
            if (err) return callback(false, err);
            callback(true, addr);
        });
    },
    getBalance: function( addr, callback ) {
        client.cmd('getaccount', addr, function(err, acc) {
            if (err) return callback(false, err);

            client.cmd('getbalance', acc, function( err, balance ) {
                if (err) return callback(false, err);

                callback(true, balance);
            });
        });
    },
    unlockAccount: function( addr, password, callback ) {
        return callback(true);
    },
    sendBtc: function( from, to, amount, callback ) {
        client.cmd('getaccount', from, function(err, acc) {
            if (err) return callback(false, err);

            client.cmd('sendtoaddress', acc, to, amount, function( err ) {
                if (err) return callback(false, err);
                callback(true);
            });

        });
    }
}