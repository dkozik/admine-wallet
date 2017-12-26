var mysql = require('../mysql');
var log = require('../log')(module);
var wallet = require('../wallet')
var users = require('../users');
var audit = require('../audit');

module.exports = {
    addTransferLog: function(tokenTypeId, senderUserId, destUserId, ethAddr, amount, descr, requestId, callback) {
        mysql.query(
            "INSERT INTO " +
                "`token-transfer-log` (link_user_sender, link_user_dest, token_type, eth_addr, amount, descr, link_transfer_request, is_internal_addr, date) " +
            "VALUES " +
                "(?,?,?,?,?,?,?,1,now())", [senderUserId, destUserId, tokenTypeId, ethAddr, amount, descr, requestId],
            function(error, results, fields) {
                if (error) {
                    log.error(error);
                    return callback(false, error.sqlMessage);
                }

                callback(true);
            });
    },
    acceptTransactions: function( acceptUserId, transactions, callback ) {
        var requestId = transactions.pop();
        callback = callback || function() {};
        if (requestId) {
            log.debug("Run confirm transaction "+requestId);
            this.acceptTransaction(requestId, acceptUserId, function( success, result ) {
                if (!success) log.error("Error transaction ["+requestId+"] confirm: ", result);
                else log.debug("Transaction ["+requestId+"] confirmed successfuly");
                this.acceptTransactions(acceptUserId, transactions);
            }.bind(this));
            callback(true);
        } else {
            return callback(false, "No transactions");
        }
    },
    declineRequest: function(requestId, declineUserId, callback) {
        mysql.query(
            "UPDATE " +
                "`token-requests` " +
            "SET " +
                "status=?, link_user_manager=?, date_update=now() " +
            "WHERE id=?", [2, declineUserId, requestId],
            function(error, results, fields) {
                if (error) {
                    log.error(error);
                    return callback(false, error.sqlMessage);
                }

                callback(true);
            });
    },
    declineRequests: function( declineUserId, transactions, callback ) {
        var requestId = transactions.pop();
        callback = callback || function() {};
        if (requestId) {
            log.debug("Run decline transaction "+requestId);
            this.declineRequest(requestId, declineUserId, function( success, result ) {
                if (!success) log.error("Decline transaction ["+requestId+"] decline failed: ", result);
                else log.debug("Transaction ["+requestId+"] declined successfuly");
                this.declineRequests(declineUserId, transactions);
            }.bind(this));
        } else {
            return callback(false, "No transactions");
        }
    },
    updateRequestStatus: function( requestId, userId, status, callback ) {
        mysql.query(
            "UPDATE " +
                "`token-requests` " +
            "SET " +
                "status=?, link_user_manager=?, date_update=now() " +
            "WHERE id=?", [status, userId, requestId],
            function(error, results, fields) {
                if (error) {
                    log.error(error);
                    return callback(false, error.sqlMessage);
                }

                callback(true);
            });
    },
    acceptTransaction: function( requestId, acceptUserId, callback ) {


        this.updateRequestStatus(requestId, acceptUserId, 1, function(success, result) {
                if (!success) {
                    log.error("Can't update request [requestId: "+requestId+"] status: ", result);
                    return callback(false, result);
                }

                mysql.query(
                    "SELECT " +
                        "tp.mnemo, t.link_user_dest, t.amount, t.link_token_type, t.link_user_src, t.reason " +
                    "FROM " +
                        "`token-requests` t, `token-types` tp " +
                    "WHERE tp.id = t.link_token_type AND t.id=?", [requestId], function(error, results, fields) {
                        if (error) {
                            log.error(error);
                            return callback(false, error.sqlMessage);
                        }

                        if (results.length<0) {
                            return callback(false, "Transaction not found");
                        }

                        var row = results[0];
                        var userDestId = row.link_user_dest;
                        var userSrcId = row.link_user_src;
                        var amount = row.amount;
                        var mnemo = row.mnemo;
                        var linkTokenType = row.link_token_type;
                        var reason = row.reason;
                        users.getUserMCNAmountWallet(userDestId, function(success, result, walletType) {
                            if (!success) {
                                log.error("User ["+userDestId+"] MCN amount wallet not found");
                                return callback(false, result);
                            }

                            log.debug("User "+userDestId+" use ["+walletType+"] wallet with address: "+result+"; Start transfere tokens (type:"+row.mnemo+") amount "+row.amount);
                            var ethWalletAddr = result;
                            wallet.contract.transferTokenByType(mnemo, ethWalletAddr, amount, function( success, result) {
                                if (!success) {
                                    log.error("Transfere internal tokens (type:"+mnemo+") to "+ethWalletAddr+" amount "+amount+" failed with error: "+result);
                                    audit.logTransfereError(linkTokenType, ethWalletAddr, row.amount, result);
                                    var errMessage = result;
                                    this.updateRequestStatus(requestId, acceptUserId, 2, function(success, result) {
                                        if (!success) {
                                            log.error("Can't update request status: ", result);
                                        }
                                        return callback(false, errMessage);
                                    });
                                }

                                this.addTransferLog(linkTokenType, userSrcId, userDestId, ethWalletAddr, amount, reason, requestId, function( success, result ) {
                                    if (!success) log.error("Error add transfer log record: "+result);
                                    callback(true);
                                });

                            }.bind(this));

                        }.bind(this));

                    }.bind(this));
            }.bind(this));
    },
    createTokenTransferRequest: function( tokenType, toUserId, amount, fromUserId, reason, callback ) {
        if (!wallet.contract.tokenTypeAllowed(tokenType)) {
            return callback(false, "Unknown token type: "+tokenType);
        }

        var mcnBalance = wallet.getMCNBalance();
        var mcnCount = parseFloat(mcnBalance);
        if ( isNaN(mcnCount) || mcnCount.toFixed(2)<=amount.toFixed(2) ) {
            return callback(false, "Transfere declined, MCN balance ("+mcnBalance+") to low for transfere "+amount+" tokens");
        }

        var tokenTypeId = wallet.contract.getTokenTypeId(tokenType);

        mysql.query(
            "INSERT INTO " +
                "`token-requests` (link_token_type, link_user_dest, link_user_src, amount, reason, date_create) " +
            "VALUES (?,?,?,?,?, now())", [tokenTypeId, toUserId, fromUserId, amount, reason],
            function(error, results, fields) {
                if (error) {
                    log.error(error);
                    return callback(false, error.sqlMessage);
                }

                callback(true, results.insertId);
            });

    },
    listRequests: function( callback ) {
        mysql.query(
            "SELECT " +
                "tr.id, tr.status, tr.amount, tr.reason, DATE_FORMAT(tr.date_create, '%Y-%m-%d %H:%i') as date_create, " +
                "tt.mnemo as token_mnemo, tt.descr as transfere_descr, du.id as dest_userid, " +
                "du.login as dest_user_login, su.id as src_userid, su.login as src_user_login, " +
                "wl.addr as eth_wallet_addr, wl.mcn_amount as mcn_amount, wl.create_date as wallet_create_date " +
            "FROM " +
                "`token-requests` tr " +
            "LEFT JOIN " +
                "`token-types` tt ON tt.id = tr.link_token_type " +
            "LEFT JOIN " +
                "users du ON du.id = tr.link_user_dest " +
            "LEFT JOIN " +
                "users su ON su.id = tr.link_user_src " +
            "LEFT JOIN " +
                "`user-wallets` wl ON wl.link_user = du.id " +
            "WHERE " +
                "tr.status = 0 AND wl.link_wallet_type=2", [],
            function(error, results, fields) {
                if (error) {
                    log.error(error);
                    return callback(false, error.sqlMessage);
                }

                callback(true, results);
            });
    }
}