var mysql = require('../mysql');
var log = require('../log')(module);
var wallet = require('../wallet')
var audit = require('../audit');

module.exports = {
    addTransferLog: function(tokenTypeId, senderUserId, destUserId, ethAddr, amount, descr, requestId, callback) {
        mysql.query(
            "INSERT INTO " +
                "`token-transfer-log` (link_user_sender, link_user_dest, token_type, eth_addr, amount, descr, link_transfer_request, is_internal_addr, date) " +
            "VALUES " +
                "(?,?,?,?,?,?,?,0, now())", [senderUserId, destUserId, tokenTypeId, ethAddr, amount, descr, requestId],
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
    declineRequest: function(requestId, declineUserId, callback) {
        mysql.query(
            "UPDATE " +
                "`token-requests-external` " +
            "SET " +
                "status=?, link_user_manager=?, date_update=now() " +
            "WHERE id=?", [2, declineUserId, requestId],
            function( error, results, fileds ) {
                if (error) {
                    log.error(error);
                    return callback(false, error.sqlMessage);
                }

                callback(true);
            });
    },
    updateRequestStatus: function( requestId, userId, status, callback ) {
        mysql.query(
            "UPDATE " +
                "`token-requests-external` " +
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

        this.updateRequestStatus(requestId, acceptUserId, 1,
            function(success, result) {
                if (!success) {
                    log.error("Can't update request [requestId: "+requestId+"] status: ", result);
                    return callback(false, result);
                }

                mysql.query(
                    "SELECT " +
                        "tp.mnemo, t.ext_eth_address, t.amount, t.link_token_type, t.link_user_src, t.reason " +
                    "FROM " +
                        "`token-requests-external` t, `token-types` tp " +
                    "WHERE tp.id = t.link_token_type AND t.id=?", [requestId],
                    function(error, results, fields) {
                        if (error) {
                            log.error(error);
                            return callback(false, error.sqlMessage);
                        }

                        if (results.length<0) {
                            log.error("Transaction "+requestId+" not found");
                            return callback(false, "Transaction "+requestId+" not found");
                        }

                        var row = results[0];
                        if (!wallet.contract.tokenTypeAllowed(row.mnemo)) {
                            log.error("Transaction token type not allowed: "+row.mnemo);
                            return callback(false, "Transaction token type not allowed: "+row.mnemo);
                        }

                        wallet.contract.transferTokenByType(row.mnemo, row.ext_eth_address, row.amount, function(success, result) {
                            if (!success) {
                                log.error("Transfere external tokens (type:"+row.mnemo+") to "+row.ext_eth_addr+" amount "+row.amount+" failed with error: "+result);
                                audit.logTransfereError(row.link_token_type, row.ext_eth_address, row.amount, result);
                                var errMessage = result;
                                this.updateRequestStatus(requestId, acceptUserId, 2, function( success, result ) {
                                    if (!success) {
                                        log.error("Can't update request status: ", result);
                                    }
                                    return callback(false, errMessage);
                                });
                            } else {
                                this.addTransferLog(row.link_token_type, row.link_user_src, null, row.ext_eth_address, row.amount, row.reason, requestId, function(success, result) {
                                    if (!success) log.error("Error add transfere log record: "+result);
                                    callback(true);
                                });
                            }

                        }.bind(this));
                    }.bind(this));
            }.bind(this));
    },
    createTokenTransferRequest: function(tokenType, ethAddr, amount, fromUserId, reason, callback) {
        if (!wallet.contract.tokenTypeAllowed(tokenType)) {
            return callback(false, "Unknown token type: "+tokenType);
        }

        var mcnBalance = wallet.getMCNBalance();
        var mcnCount = parseFloat(mcnBalance);
        if ( isNaN(mcnCount) || parseFloat(mcnCount.toFixed(2))<=parseFloat(amount.toFixed(2)) ) {
            return callback(false, "Transfere declined, MCN balance ("+mcnBalance+") to low for transfere "+amount+" tokens");
        }

        var tokenTypeId = wallet.contract.getTokenTypeId(tokenType);

        mysql.query(
            "INSERT INTO " +
                "`token-requests-external` (link_token_type, ext_eth_address, link_user_src, amount, reason, status, date_create) " +
            "VALUES (?,?,?,?,?, 0, now())", [tokenTypeId, ethAddr, fromUserId, amount, reason],
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
                "tt.mnemo as token_mnemo, tt.descr as transfere_descr, su.id as src_userid, su.login as src_user_login, " +
                "tr.ext_eth_address, tr.reason " +
            "FROM " +
                "`token-requests-external` tr " +
            "LEFT JOIN " +
                "`token-types` tt ON tt.id = tr.link_token_type " +
            "LEFT JOIN " +
                "users su ON su.id = tr.link_user_src " +
            "WHERE " +
                "tr.status = 0", [],
            function( error, results, fields) {
                if (error) {
                    log.error(error);
                    return callback(false, error.sqlMessage);
                }

                callback(true, results);
            });
    }
 }