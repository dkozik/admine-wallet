var mysql = require('./mysql');
var log = require('./log')(module);
var async = require('async');
var config = require('./config');
var util = require('./util');
var balanceWatcher = require('./balance_watcher');
var wallet = require('./wallet');

var mcnPayments = new (function() {

    var payUsersCount = 0;
    var watchTokens = [
        'totalSupply',
        'preSaleSupply',
        'ICOSupply',
        'userGrowsPoolSupply',
        'auditSupply',
        'bountySupply',
        'AdmineTeamTokens',
        'AdmineAdvisorTokens'
    ];

    var tokens = {};

    return {
        updatePayUsersCount: function( callback ) {
            mysql.query(
                "SELECT " +
                    "count(u.id) as cnt " +
                "FROM (" +
                        "SELECT " +
                            "id " +
                        "FROM " +
                            "`user-wallets` " +
                        "WHERE " +
                            "amount>0 " +
                        "GROUP BY link_user" +
                ") u", [],
                function(error, results, fields) {
                    if (error) {
                        log.error("Error count payable users: "+error);
                        return callback(false, error.sqlMessage);
                    }

                    var row = results[0];
                    payUsersCount = row.cnt;

                    callback(true, row.cnt);
                });
        },
        getPayUsersCount: function() {
            return payUsersCount;
        },
        updateTokensSupply: function( callback ) {
            callback = callback || function() {};
            var queue = watchTokens.slice();
            function nextStep() {
                var token = queue.pop();
                if (token) {
                    wallet.contract.getParameter(token, function( success, result ) {
                        if (success) {
                            tokens[token] = result;
                        }
                        nextStep();
                    });
                } else {
                    callback(true);
                }
            }
            nextStep();
        },
        getToken: function( name ) {
            return tokens[name];
        },
        getAllTokens: function() {
            return tokens;
        }
    }
})();

var mcnTypeHistory = new (function() {

    var amounts = {};

    return {
        update: function( callback ) {
            mysql.query(
                "SELECT " +
                    "cntr.token_type, cntr.sm, tt.descr, tt.mnemo, tt.percent " +
                "FROM " +
                    "(" +
                        "SELECT " +
                            "token_type, sum(amount) sm " +
                        "FROM " +
                            "`token-transfer-log` " +
                        "GROUP BY " +
                            "token_type" +
                    ") cntr, " +
                    "`token-types` tt " +
                "WHERE " +
                    "tt.id = cntr.token_type", [],
                function(error, results, fields) {
                    if (error) {
                        log.error("Update tokens history error: "+error.sqlMessage);
                        return callback(false, error.sqlMessage);
                    }

                });
        }
    }
})();

var walletHistory = new (function() {

    var amounts = {};

    return {
        update: function( callback ) {
            mysql.query(
                "SELECT " +
                    "currency_type, sum(amount) as sm " +
                "FROM " +
                    "`user-wallet-history` " +
                "WHERE " +
                    "amount>0 " +
                "GROUP BY currency_type", [],
                function(error, results, fields) {
                    if (error) {
                        log.error("Update wallet history error: "+error.sqlMessage);
                        return callback(false, error.sqlMessage);
                    }

                    if (results.length>0) {
                        for (var i=0; i<results.length; i++) {
                            var row = results[i];
                            var curr = row.currency_type;
                            amounts[curr] = row.sm;
                        }
                    }

                    callback(true, amounts);
                });
        },
        getCurrencyAmount: function( currType ) {
            return (currType in amounts)?amounts[currType]:0;
        },
        getAllAmounts: function(expectCurr) {
            expectCurr = expectCurr || [];
            if (typeof(expectCurr)=='string') {
                expectCurr = [expectCurr];
            }
            var res = {};
            var keys = Object.getOwnPropertyNames(amounts);
            for (var i=0;i<keys.length; i++) {
                var key = keys[i];
                if (expectCurr.indexOf(key)>=0) continue;
                res[key] = amounts[key];
            }
            return res;
        }
    }
})();

var scManager = new (function() {

    return {
        update: function( callback ) {
            balanceWatcher.getCurrentMcnBalance()
        }
    }
})();

function updateMetrics( callback ) {
    callback = callback || function() {};
    walletHistory.update(function( success, result ) {
        mcnPayments.updatePayUsersCount(function( success, result ) {
            callback(success, result);
        });
    });
}

util.scheduler(function( callback ) {
    log.info("Update metrics started");
    updateMetrics(function( success, result ) {
        log.info("Update metrics finished");
        if (!success) {
            log.error("Update metrics failed with error: "+result);
        }
        callback();
    });
}, config.get('metric-thread-schedule-timeout') || 60000*30);


util.scheduler(function( callback ) {
    log.debug("Start update tokens supply");
    mcnPayments.updateTokensSupply(function( success ) {
        log.debug("Tokens supply update successfuly");
        callback();
    });
}, config.get('metric-thread-contract-watcher-timeout') || 10000);

module.exports.getCurrencyAmount = function( currType ) {
    return walletHistory.getCurrencyAmount(currType);
};

module.exports.getAllCurrencyAmount = function( expectCurr ) {
    return walletHistory.getAllAmounts(expectCurr);
};

module.exports.getPaymentUsersCount = function() {
    return mcnPayments.getPayUsersCount();
};

module.exports.getTokenSupply = function( name ) {
    return mcnPayments.getToken(name);
};

module.exports.getAllTokns = function() {
    return mcnPayments.getAllTokens();
};


// ---------------------- MODULE LOGIC --------------------------
updateMetrics(function() {
    mcnPayments.updateTokensSupply(function( success ) {});
});