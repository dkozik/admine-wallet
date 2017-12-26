var express = require('express');
var router = express.Router();
var log = require('../log')(module);
var mysql = require('../mysql');
var auth = require('../auth');
var wallet = require('../wallet');
var util = require('../util');
var converter = require('../converter');
var users = require('../users');
var audit = require('../audit');
var internalTransaction = require('../pay/internal_transaction');
var externalTransaction = require('../pay/external_transaction');

router.use(function(req, res, next) {
    next();
});

router.post('/broadcast_external_tokens', function( req, res, next) {
    var addr = req.body.addr;
    var tokenType = req.body.tokenType;
    var reason = req.body.reason;
    var amount = req.body.amount;

    auth.getSession(req, function( err, data) {
        if (err) return next({message: data});

        var userId = data;
        if (!auth.userInGroup(userId, 'support', 'master')) {
            audit.customEvent(userId, 'permission', 'Broadcast tokens permission denied. ip: ' + req.remoteIpAddr);
            return next({message: 'Permission denied'});
        }

        audit.customEvent(userId, 'support', 'Broadcast ' + amount + ' external tokens to ' + addr.length + ' addreses, reason ' + reason);
        wallet.broadcastExternalTokens(userId, addr, reason, tokenType, amount, function(success, result) {
            if (!success) {
                audit.customEvent(userId, 'support', 'Broadcast external tokens error: '+result);
                return next({ message: result });
            }

            res.send({ ok: true });
        });
    });

});

router.post('/broadcast_tokens', function(req, res, next) {
    var userIds = req.body.users;
    var reason = req.body.reason;
    var tokenType = req.body.tokenType;
    var amount = req.body.amount;
    auth.getSession(req, function( err, data) {
        if (err) return next({ message: data });

        var userId = data;
        if (!auth.userInGroup(userId, 'support', 'master')) {
            audit.customEvent(userId, 'permission', 'Broadcast tokens permission denied. ip: '+ req.remoteIpAddr)
            return next({ message: 'Permission denied' });
        }

        audit.customEvent(userId, 'support', 'Broadcast '+amount+' tokens to '+userIds.length+' users, reason '+reason);
        wallet.broadcastTokens(userId, userIds, reason, tokenType, amount, function( success, result ) {
            if (!success) {
                audit.customEvent(userId, 'support', 'Broadcast tokens error: '+result);
                return next({ message: result });
            }

            res.send({ ok: true });
        })

    });
});

router.post('/transfer', function(req, res, next) {
    var destUserId = req.body.destUserId;
    var amount = req.body.amount;
    var type = req.body.transferType;
    var reason = req.body.reason;
    auth.getSession(req, function( err, data ) {
        if (err) {
            return next({ message: data });
        }
        var userId = data;
        if (!auth.userInGroup(userId, 'support', 'master')) {
            audit.customEvent(userId, 'permission', 'Transfere tokens permission denied, ip: '+req.remoteIpAddr);
            return next({ message: 'Permission denied' });
        }


        internalTransaction.createTokenTransferRequest(type, destUserId, amount, userId, reason, function( success, result ) {
            if (!success) {
                audit.customEvent(userId, 'transfere', 'Tokens transfere error: '+result);
                return next({ message: result });
            }

            audit.customEvent(userId, 'transfere', 'Transfere '+amount+' ['+type+'] tokens to uid: '+userId+', reason: '+reason);
            res.send({ ok: true, transactionId: result });
        });
    });
});

router.post('/accept_token', function(req, res, next) {
    var transactionId = req.body.transactionId;
    auth.getSession(req, function( err, data ) {
        if (err) {
            return next({message: data});
        }
        var userId = data;
        if (!auth.userInGroup(userId, 'master')) {
            audit.customEvent(userId, 'permission', 'Accept tokens permission denied, ip: '+req.remoteIpAddr);
            return next({message: 'Permission denied'});
        }

        internalTransaction.acceptTransaction(transactionId, userId, function( success, result ) {
            if (!success) {
                audit.customEvent(userId, 'accepttokens', 'Accept tokens error: '+ result);
                return next({ message: result });
            }

            audit.customEvent(userId, 'accepttokens', 'Accepted tokens '+transactionId);
            res.send({ ok: true });
        });
    });
});

router.post('/decline_token', function(req, res, next) {
    var transactionId = req.body.transactionId;
    auth.getSession(req, function( err, data ) {
        if (err) {
            return next({message: data});
        }
        var userId = data;
        if (!auth.userInGroup(userId, 'master')) {
            return next({message: 'Permission denied'});
        }

        internalTransaction.declineRequest(transactionId, userId, function( success, result ) {
            if (!success) {
                return next({ message: result });
            }

            res.send({ ok: true });
        });
    });
});

router.post('/register_wallet', function(req, res, next) {
    var type = req.body.type;
    auth.getSession(req, function( err, data ) {
        if (!err) {
            var userId = data;
            wallet.registerWallet(type, userId, function(success, result, inserId) {
                if (!success) {
                    return next({ message: result });
                }
                var addr = result;
                audit.customEvent(userId, 'register', 'Register new wallet ['+type+'] '+addr);
                res.send({ ok: true, addr: newAddr, id: results.insertId });
            });
        } else {
            return next({ message: data });
        }
    });
});

router.get('/list_token_type', function( req, res, next ) {
    auth.getSession(req, function( err, data ) {
        if (err) return next({message: data});

        wallet.getTokenTypes(function( success, result ) {
            if (!success) return next({message: result});

            res.send({ ok: true, types: result });
        });

    });
});

router.get('/list_users', function( req, res, next ) {
    auth.getSession(req, function( err, data ) {
        if (err) return next({message: data});

        var userId = data;

        if (auth.getUserAccessLevel(userId)<=0) return next({message: "Permission denied"});

        users.listUsers(function (success, result) {
            if (!success) return next({message: result});

            res.send({ok: true, users: result});
        });

    });
});

router.get('/list_requests', function( req, res, next ) {
    auth.getSession(req, function( err, data ) {
        if (err) return next({ message: data });

        var userId = data;

        if (auth.getUserAccessLevel(userId)<=1) return next({ message: "Permission denied "});

        internalTransaction.listRequests(function( success, result ) {
            if (!success) return next({ message: result });

            res.send({ ok: true, requests: result });
        })
    });

});

router.get('/list_external_requests', function( req, res, next) {
    auth.getSession(req, function( err, data ) {
        if (err) return next({ message: data });

        var userId = data;

        if (auth.getUserAccessLevel(userId)<=1) return next({ message: "Permission denied "});

        externalTransaction.listRequests(function( success, result ) {
            if (!success) return next({ message: result });

            res.send({ ok: true, requests: result });
        });
    });
});

router.post('/confirm_external_tokens', function(req, res, next) {
    var transactions = req.body.transactions;

    auth.getSession(req, function( err, data ) {
        if (err) return next({message: data});

        var userId = data;

        if (auth.getUserAccessLevel(userId) <= 1) {
            audit.customEvent(userId, 'permission', 'Confirm external tokens permission denied, ip: ' + req.remoteIpAddr);
            return next({message: "Permission denied "});
        }

        externalTransaction.acceptTransactions(userId, transactions, function( success, result ) {
            if (!success) {
                audit.customEvent(userId, 'confirmtokens', 'Confirm external tokens error: '+result);
                return next({ message: result });
            }

            res.send({ ok: true });
        })
    });
});

router.post('/confirm_tokens', function( req, res, next ) {
    var transactions = req.body.transactions;
    auth.getSession(req, function( err, data ) {
        if (err) return next({ message: data });

        var userId = data;

        if (auth.getUserAccessLevel(userId)<=1) {
            audit.customEvent(userId, 'permission', 'Confirm tokens permission denied, ip: '+req.remoteIpAddr);
            return next({ message: "Permission denied "});
        }

        internalTransaction.acceptTransactions(userId, transactions, function( success, result ) {
            if (!success) {
                audit.customEvent(userId, 'confirmtokens', 'Confirm tokens error: '+result);
                return next({ message: result });
            }

            res.send({ ok: true });
        });

    });
});

router.post('/decline_external_tokens', function(req, res, next) {
    var transactions = req.body.transactions;
    auth.getSession(req, function( err, data ) {
        if (err) return next({ message: data });

        var userId = data;

        if (auth.getUserAccessLevel(userId)<=1) {
            audit.customEvent(userId, 'permission', 'Decline external tokens permission denied, ip: '+req.remoteIpAddr);
            return next({ message: "Permission denied "});
        }

        externalTransaction.declineRequests(userId, transactions, function( success, result ) {
            if (!success) {
                audit.customEvent(userId, 'declinetokens', 'Decline external tokens error: '+result);
                return next({ message: result });
            }

            res.send({ ok: true });
        });

    });
});

router.post('/decline_tokens', function( req, res, next ) {
    var transactions = req.body.transactions;
    auth.getSession(req, function( err, data ) {
        if (err) return next({ message: data });

        var userId = data;

        if (auth.getUserAccessLevel(userId)<=1) {
            audit.customEvent(userId, 'permission', 'Decline tokens permission denied, ip: '+req.remoteIpAddr);
            return next({ message: "Permission denied "});
        }

        internalTransaction.declineRequests(userId, transactions, function( success, result ) {
            if (!success) {
                audit.customEvent(userId, 'declinetokens', 'Decline tokens error: '+result);
                return next({ message: result });
            }

            res.send({ ok: true });
        });

    });
});

router.post('/save_custom_eth_wallet', function(req, res, next) {
    var addr = req.body.addr;
    auth.getSession(req, function( err, data ) {
        if (err) return next({ message: data });

        if (!util.isEthAddressCorrect(addr)) {
            log.error("Save custome ETH address error: address value ["+addr+"] incorrect");
            return next({ message: "Incorrect ETH address" });
        }

        var userId = data;
        wallet.addPersonalEthAddress(userId, addr, function( success, result ) {
            if (!success) {
                log.error("Error save personal ETH address: "+result);
                return next({ message: result });
            }

            res.send({ ok: true });
        });
    });
});

router.post('/remove_custom_eth_wallet', function( req, res, next) {
    auth.getSession(req, function( err, data ) {
        if (err) return next({message: data});

        var userId = data;
        wallet.removePersonalEthWallet(userId, function( success, result ) {
            if (!success) {
                log.error("Error remove personal ETH address: ", result);
                return next({ message: result });
            }

            res.send({ ok: true });
        });
    });
});

router.post('/add_wallet', function( req, res, next) {
    var addr = req.body.addr;
    var type = req.body.type;
    auth.getSession(req, function( err, data ) {
        if (!err) {
            var userId = data;
            mysql.query("SELECT * FROM `user-wallets` WHERE link_user=? and link_wallet_type=?", [userId, type], function(error, results, fields) {
                if (error) {
                    log.error(error);
                    return next(error);
                }
                if (results.length<=0) {
                    mysql.query("INSERT INTO `user-wallets` (link_user, addr, link_wallet_type, create_date, last_update_date) VALUES (?,?,?, now(), now())", [userId, addr, type], function(error, results, fields) {
                        if (error) {
                            log.error(error);
                            return next(error);
                        }
                        audit.customEvent(userId, 'wallets', 'Create new wallet type: '+type);
                        res.send({ ok: true, walletId: results.insertId });
                    });
                } else {
                    return next({ message: 'User already have wallet with that type' });
                }
            });
        } else {
            return next({ message: data });
        }
    });

});

router.post('/collect_ether', function(req, res, next) {
    var addr = (req.body.addr||'');
    if (!addr) {
        return next({ message: "Incorrect parameters" });
    }
    auth.getSession(req, function( err, data ) {
        if (err) return next({message: data});

        var userId = data;

        if (auth.getUserAccessLevel(userId) <= 1) {
            audit.customEvent(userId, 'permission', 'Decline tokens permission denied, ip: ' + req.remoteIpAddr);
            return next({message: "Permission denied "});
        }

        mysql.query(
            "SELECT " +
                "id, link_user, addr, hash, amount " +
            "FROM " +
                "`user-wallets` " +
            "WHERE " +
                "addr=? AND link_wallet_type=2", [addr],
            function(error, results, fields) {
                if (error) {
                    log.error("Error query user wallet ["+addr+"], reason: ", error);
                    return next({ message: error.sqlMessage});
                }

                if (results.length<=0) {
                    log.error("User ETH wallet ["+addr+"] not found!");
                    return next({ message: "Wallet not found" });
                }

                var row = results[0];
                log.info("Run collect wallet ["+row.id+"] user ["+row.link_user+"] ether ["+row.amount+"] to central wallet");
                wallet.collectWalletEth(row.addr, row.hash, row.amount, function( success, result ) {
                    if (!success) {
                        log.error("Error collect ["+addr+"] ethereum amount ["+row.amount+"], reason: "+result);
                        return next({ message: result });
                    }

                    res.send({ ok: true });
                });
            });

    });
});

router.post('/update_walets', function(req, res, next) {

    auth.getSession(req, function( err, data ) {
        if (err) return next({message: data});

        var userId = data;

        if (auth.getUserAccessLevel(userId) <= 1) {
            audit.customEvent(userId, 'permission', 'Decline tokens permission denied, ip: ' + req.remoteIpAddr);
            return next({message: "Permission denied "});
        }

        wallet.updaetAdmineWallets(function(success, result) {
            if (!success) {
                log.error("Error update admine wallets: ", result);
                return next({ message: result });
            }

            res.send({ ok: true });
        });

    });

});

router.post('/send_my_tokens', function( req, res, next) {
    var addr = (req.body.addr||'');
    var amount = (req.body.amount||'');
    var addrFrom = (req.body.from||'');

    if (!util.isEthAddressCorrect(addr)) {
        return next({ message: 'Invalid ETH wallet address' });
    }

    if (!util.isEthAddressCorrect(addrFrom)) {
        return next({ message: 'Invalid ETH source wallet address'});
    }

    if (amount.length<1) {
        return next({ message: 'Invalid amount' });
    }
    auth.getSession(req, function( err, data ) {
        if (err) return next({message: data});

        if (!util.isEthAddressCorrect(addr)) {
            log.error("Save custome ETH address error: address value [" + addr + "] incorrect");
            return next({message: "Incorrect ETH address"});
        }

        var userId = data;
        wallet.sendUserTokensFromWalletTo( userId, addrFrom, addr, amount, function( success, result) {
            if (!success) {
                log.error("Send user tokens to ["+addr+"] failed with message: "+result);
                return next({ message: result });
            }

            res.send({ ok: true });
        });
    });


});

module.exports = router;
