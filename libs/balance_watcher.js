var mysql = require('./mysql');
var wallet = require('./wallet');
var log = require('./log.js')(module);
var converter = require('./converter');
var config = require('./config');
var async = require('async');
var internalTransaction = require('./pay/internal_transaction');
var externalTransaction = require('./pay/external_transaction');
var online = false;
var watchList = {};
var userWallets = {};
var watcher = null;
var onError = null;

var doAcceptPayments = config.get('accept-payments');
if (doAcceptPayments == null) {
    doAcceptPayments = true;
}
var allowedTestAccounts = config.get('allowed-test-accounts') || [];

function WalletNode( row ) {

    var checkStarted = false;
    var walletId = row.id;
    var linkUser = row.link_user;
    var type = row.mnemo;
    var address = row.addr;
    var password = row.hash;
    var amount = row.amount;
    var mcnAmount = row.mcn_amount;

    function insertHistoryRecord( currencyType, prevValue, newValue, callback ) {
        var diff = 0;
        if (newValue>prevValue) {
            diff = newValue-prevValue;
        } else {
            diff = (prevValue-newValue)*-1;
        }
        log.info("User ["+linkUser+"] "+currencyType+" balance at address ["+address+"] changed to "+newValue+", diff: "+diff);

        mysql.query(
            "INSERT INTO `user-wallet-history` " +
                "(link_user_wallet, amount, prev_balance, new_balance, currency_type, date) " +
            "VALUES " +
                "(?,?,?,?,?, now())", [walletId, diff, prevValue, newValue, currencyType],
            function(error, results, fields) {
                if (error) {
                    log.error(error);
                    callback(false, error);
                    return;
                }

                callback(true, diff);
            });

    }

    function mcnBalanceChanged( prevValue, newValue, callback ) {
        insertHistoryRecord('MCN', prevValue, newValue, function( success, result ) {
            if (!success) return callback(success, result);
            var diff = result;
            mysql.query(
                "UPDATE " +
                    "`user-wallets` w " +
                "SET " +
                    "w.mcn_amount=?, last_update_date=now()" +
                "WHERE id=?", [newValue, walletId],
                function(error, results, fields) {
                    if (error) {
                        log.error(error);
                        callback(false, error);
                        return;
                    }

                    mcnAmount = newValue;
                    callback(true, diff, newValue);
                });
        });

    }

    function balanceChanged( prevValue, newValue, callback ) {
        insertHistoryRecord(type, prevValue, newValue, function( success, result ) {
            if (!success) return callback(success, result);

            var diff = result;
            mysql.query(
                "UPDATE " +
                    "`user-wallets` w " +
                "SET " +
                    "w.amount=?, last_update_date=now()" +
                "WHERE id=?", [newValue, walletId],
                function(error, results, fields) {
                    if (error) {
                        log.error(error);
                        callback(false, error);
                        return;
                    }

                    log.info("User ["+linkUser+"] update current wallet amount ["+amount+"] to new value: ["+newValue+"]");
                    amount = newValue;

                    var mcnAmountValue = 0;
                    if (diff>0) {
                        mcnAmountValue = converter.convertToMcn(type, amount);
                        if (type == 'BTC') {
                            log.info("User [" + linkUser + "] correct BTC value from amount [" + amount + "] to diff [" + diff + "]");
                            mcnAmountValue = converter.convertToMcn(type, diff);
                        }
                    }


                    if (!doAcceptPayments && allowedTestAccounts.indexOf(linkUser)<0) {
                        log.error("User ["+linkUser+"] tokens transfere denied in configuration, and user ["+linkUser+"] not in allowance list. Keep amount on wallet, charge skipped.");
                        internalTransaction.createTokenTransferRequest(1, linkUser, amount, 1, 'Do not accept! Autopayment tokens transfere redirect.', function(success, result) {
                            log.info("Internal token transfer request created");
                        });
                        return callback(true, diff, newValue);
                    }

                    if (diff>0) {
                        log.info("User [" + linkUser + "] balance diff: [" + diff + "] mcnAmountValue: [" + mcnAmountValue + "]");
                    } else {
                        log.info("User [" + linkUser + "] balance diff: [" + diff + "], MCN amount ignore");
                    }

                    if (diff>0 && mcnAmountValue>0.1) {
                        log.info("User ["+linkUser+"] run token charger to wallet ["+walletId+"] amount ["+amount+"]");
                        wallet.tokensCharger(type, walletId, amount, mcnAmountValue, function( success, result ) {
                            if (!success) {
                                log.error(result);
                                return;
                            }
                        });
                    } else {
                        log.info("User ["+linkUser+"] tokens charge skipping, diff <= 0 or mcnAmountValue < 0.1");
                    }
                    callback(true, diff, newValue);
                });
        })
    }

    return {
        getId: function() {
            return walletId;
        },
        getMcnBalance: function() {
            return mcnAmount;
        },
        checkBalance: function( callback ) {
            if (checkStarted) {
                return callback(false, 'Wallet still checking balance');
            }
            log.debug("Check balance of ["+type+"] "+address);
            checkStarted = true;
            wallet.unlockAccount(type, address, password, function( success, data ) {
                if (!success) {
                    log.error('Check wallet balance failed with message: '+data.message);
                    checkStarted = false;
                    callback(false, data.message);
                    return;
                }
                wallet.getBalance(type, address, function( success, data ) {

                    log.debug(address+" success: "+success, "data: ", data);
                    if (type=='ETH') {
                        wallet.getMcnBalanceOf(address, function(success, result) {
                            if (!success) {
                                log.error("Can't check wallet (addr: "+address+") MCN balance: ", result);
                                return;
                            }

                            if (parseFloat(mcnAmount)!=parseFloat(result)) {
                                mcnBalanceChanged(mcnAmount, result, function(success, result) {
                                    if (!success) {
                                        log.error("MCN balance update failed: ", result);
                                    }
                                });
                            }
                        });
                    }

                    if (success) {
                        var currentBalance = data;
                        if (currentBalance!=amount) {
                            balanceChanged(amount, currentBalance, function() {
                                checkStarted = false;
                                callback(true, true);
                            });
                        } else {
                            checkStarted = false;
                            callback(true, false);
                        }
                    } else {
                        log.error("Can't check wallet balance "+address, 'error: ',data.error);
                        checkStarted = false;
                        callback(false, data.error);
                    }

                });
            });

        }

    }
}


function updateWatchList( callback ) {
    log.info('Update wallets watch list');
    callback = callback || function() {

    };

    mysql.query(
        "SELECT " +
            "w.id, w.addr, w.link_user, w.link_wallet_type, w.amount, w.mcn_amount, w.hash, t.mnemo " +
        "FROM " +
            "`user-wallets` w, users u, `user-wallet-type` t " +
        "WHERE " +
            "t.id = w.link_wallet_type AND u.id=w.link_user AND u.is_active = 1",
        [],
        function(error, results, fields) {
            if (error) {
                log.error(error);
                return callback(false, error);
            }

            for (var i=0; i<results.length; i++) {
                var row = results[i];
                if (watchList[row.id]) continue;
                watchList[row.id] = new WalletNode(row);
                if (!userWallets[row.link_user]) {
                    userWallets[row.link_user] = {};
                }
                userWallets[row.link_user][row.mnemo] = row.id;
            }

            mysql.query(
                "SELECT " +
                    "w.id " +
                "FROM " +
                    "`user-wallets` w, users u " +
                "WHERE " +
                    "u.id=w.link_user AND u.is_active = 0",
                [],
                function(error, results, fields) {
                    if (error) {
                        log.error(error);
                        return callback(false, error);
                    }

                    for (var i=0; i<results.length; i++) {
                        var row = results[i];
                        if (!watchList[row.id]) continue;
                        delete(watchList[row.id]);
                    }

                    log.info('Wallets list successfuly updated');
                    callback(true);
                });
        });
}

function checkBalances( threadCount, callback ) {
    var walletIds = Object.getOwnPropertyNames(watchList);
    if (walletIds.length<=0) {
        return callback(true);
    }

    log.info('Check account balances, thread count: '+threadCount);
    var onlineCount = 0;

    function doCheck() {
        var walletId = walletIds.pop();
        if (walletId) {
            onlineCount++;
            watchList[walletId].checkBalance(function( success, result ) {
                onlineCount--;
                doCheck();
            });
        } else if (onlineCount<=0) {
            // Очередь закончилась
            log.info("Check account balances finished");
            callback(true);
        }
    }

    for (var i=0; i<threadCount; i++) {
        doCheck();
    }
}

function watcherIteration( callback ) {
    if (online==true) {
        updateWatchList(function( success, result ) {
            if (success) {
                checkBalances(10, function(success, result) {
                    if (success) {
                        wallet.updateMcnBalance();
                        callback(true);
                    } else callback(false, result);
                });
            } else callback(false, result);
        });
    } else {
        callback(false, 'System offline');
    }
}

async.parallel([function() {

    var iterationNumber = 0;
    var watcherThread = null;

    function scheduleNextWatcherIteration( timeout ) {
        watcherThread = setTimeout(function() {
            iterationNumber++;
            watcherIteration(function( success, result ) {
                clearTimeout(watcherThread);
                scheduleNextWatcherIteration( timeout );
            });
        }, timeout);
    }

    scheduleNextWatcherIteration(config.get('watch-thread-schedule-timeout') || 5000);
}]);

module.exports.start = function() {
    if (!online) {
        log.info('Start balance watch thread');
        online = true;
    }
};

module.exports.end = function() {
    if (online) {
        log.info('Stop balance watch thread');
        online = false;
    }
};

module.exports.onError = function( callback ) {
    onError = callback;
};

module.exports.updateWatchList = function( callback ) {
    return async.parallel([
        function() {
            updateWatchList(callback);
        }
    ]);
};

module.exports.getEthWallet = function( userId ) {
    var wallets = userWallets[userId];
    if (!wallets) return null;

    return watchList[wallets.ETH].getId();
};

module.exports.getCurrentMcnBalance = function( userId ) {
    var wallets = userWallets[userId];
    if (!wallets) return 0;

    if (!watchList[wallets.ETH]) {
        log.error("Wallet ["+wallets.ETH+"] for user ["+userId+"] not in watch list!");
        return 0;
    }
    return watchList[wallets.ETH].getMcnBalance();
};