var config = require('./config');
var log = require('./log')(module);
var mysql = require('./mysql');
var email = require('./email');
var eth = require('./wallets/eth');
var btc = require('./wallets/btc');
var util = require('./util');
var balanceWatcher = require('./balance_watcher');
var campaign = require('./campaign');
var users = require('./users');
var internalTransaction = require('./pay/internal_transaction');
var externalTransaction = require('./pay/external_transaction');

var mcnBalance = 0;
var collectors = config.get('wallet:collectors');
var dontTransfereAmounts = config.get('dev:dont-transfere-amount');
var admineWallets = {};

var contract = new (function( abi, contractAddr, ethAddrFrom, ethAddrPwd ) {
    var ctr = eth.getContract(abi, contractAddr);
    var payMethods = {};
    var tokenTypes = {};

    function contractPay( method, to, amount, callback ) {

        if (! (method in ctr.methods)) {
            log.error("Contract does not have function ["+method+"], pay "+amount+" MCN to "+to+" failed");
            return callback(false, "Payment method not found");
        }

        eth.unlockAccount(ethAddrFrom, ethAddrPwd, function( success, result ) {
            if (!success) {
                log.error("Master wallet unlock failed with message: ", result);
                return callback(false, result);
            }

            var realAmount = eth.toContractDecimal(amount);
            ctr.methods[method](to, realAmount).send({ from: ethAddrFrom }).then(
                function( transact ) {
                    log.info("Tokens ["+amount+"] (method:"+method+") successful transfered to address: "+to);
                    callback(true, transact);
                },
                function( err ) {
                    log.error("Tokens ["+amount+"] (method:"+method+") transfere to address ["+to+"] failed: ", err);
                    log.error(err.stack);
                    util.filterEthErrors(err.message, callback);
                    //callback(false, err.message);
                }
            );
        });
    }

    function updateTokenTypes() {
        mysql.query("SELECT id, mnemo, percent FROM `token-types`", [], function(error, results, fields) {
            if (error) {
                log.error(error);
                return;
            }

            function proxyContractMethod(methodName) {
                return function (to, amount, callback) {
                    return contractPay(methodName, to, amount, callback);
                }
            }

            var singleMethod = config.get('dev:single-contract-pay-method');

            for (var i = 0; i < results.length; i++) {
                var row = results[i];
                tokenTypes[row.mnemo] = row.id;

                if (singleMethod>'') {
                    payMethods[row.mnemo] = proxyContractMethod(singleMethod);
                    continue;
                }

                switch(row.mnemo) {
                    case 'preSaleTokens':
                        payMethods[row.mnemo] = proxyContractMethod('transferPreSaleTokens');
                        break;
                    case 'ICOTokens':
                        payMethods[row.mnemo] = proxyContractMethod('transferIcoTokens');
                        break;
                    case 'advisorTokens':
                        payMethods[row.mnemo] = proxyContractMethod('transferAdvisorTokens');
                        break;
                    case 'auditTokens':
                        payMethods[row.mnemo] = proxyContractMethod('transferAuditTokens');
                        break;
                    case 'bountyTokens':
                        payMethods[row.mnemo] = proxyContractMethod('transferBountyTokens');
                        break;
                    case 'usersPoolTokens':
                        payMethods[row.mnemo] = proxyContractMethod('transferUserGrowthPoolTokens');
                        break;
                }
            }

        });
    }

    updateTokenTypes();

    return {
        getTokenTypeId: function( tokenType ) {
            return tokenTypes[tokenType];
        },

        tokenTypeAllowed: function( method ) {
            return method in payMethods;
        },
        transferTokenByType: function( method, to, amount, callback ) {
            if (method in payMethods) {
                return payMethods[method](to, amount, callback);
            } else {
                callback(false, "Contract payment method ["+method+"] not found in smart contract");
            }
        },
        eraseUnsoldPreSaletokens: function() {
            eth.unlockAccount(ethAddrFrom, ethAddrPwd, function( success, result ) {
                if (!success) {
                    log.error("Master wallet unlock failed with message: ", result);
                    return callback(false, result);
                }

                ctr.methods.eraseUnsoldPreSaletokens().send({ from: ethAddrFrom }).then(
                    function( transact ) {
                        log.info("Unsold pre sale tokens successfuly erased");
                        callback(true, transaction);
                    },
                    function( err ) {
                        log.error("Unsold pre sale tokens erase failed: ", err);
                        util.filterEthErrors(err.message, callback);
                        //callback(false, err);
                    }
                );
            });
        },

        transfer: function( to, amount, callback) {
            var realAmount = eth.toContractDecimal(amount);
            log.info("Call transfere tokens ["+amount+"] to adress "+to);
            eth.unlockAccount(ethAddrFrom, ethAddrPwd, function( success, result ) {
                if (!success) {
                    log.error("Master wallet unlock failed with message: ", result);
                    return callback(false, result);
                }

                var callable = ctr.methods.transfer(to, realAmount);
                callable.send({ from: ethAddrFrom }).then(
                    function( transaction ) {
                        log.info("Tokens ["+amount+"] successful transfered to address: "+to);
                        callback(true, transaction);
                    },
                    function( err ) {
                        log.error("Tokens ["+amount+"] transfere to address ["+to+"] failed: ", err);
                        util.filterEthErrors(err.message, callback);
                    }
                );

            });

        },

        approve: function( to, from, hash, amount, callback ) {

            eth.unlockAccount(from, hash, function( success, result ) {
                if (!success) {
                    log.error("Error unlock account " + from + ": " + result);
                    return callback(false, "Error unlock account: "+result);
                }

                ctr.methods.approve(to, amount).call().then(function () {
                    log.info("Wallet [" + from + "] successfuly approved [" + amount + "] MCN to smart-contract master address");
                    callback(true);
                }, function (err) {
                    log.error("Wallet ["+from+"] approve "+amount+" failed: ", err);
                    util.filterEthErrors(err.message, callback);
                });
            });
        },

        transferFrom: function( from, to, amount, callback ) {
            var realAmount = eth.toContractDecimal(amount);
            mysql.query(
                "SELECT " +
                    "link_user, amount, mcn_amount, hash " +
                "FROM " +
                    "`user-wallets` WHERE addr=?", [from],
            function(error, results, fields) {
                if (error) {
                    log.error("Can't load user wallet with addr ["+from+"], reason: "+error);
                    return callback(false, error.sqlMessage);
                }

                if (results.length<=0) {
                    log.error("Can't transfer tokens from ["+from+"], addres does not exists");
                    return callback(false, "Address ["+from+"] does not exists");
                }

                var row = results[0];
                var userId = row.link_user;
                log.info("User ["+userId+"] transfere his tokens ["+row.mcn_amount+"] to address ["+to+"]");

                if (parseFloat(amount)>parseFloat(row.mcn_amount)) {
                    log.error("User ["+userId+"] can't transfere ["+amount+"] tokens, insufficient funds: ["+row.amount+"]");
                    return callback(false, "Insufficient funds");
                }

                eth.unlockAccount(ethAddrFrom, ethAddrPwd, function(success, result) {
                    if (!success) {
                        log.error("User ["+userId+"] error unlock main account "+ethAddrFrom+": "+result);
                        return callback(false, "Error unlock account");
                    }

                    ctr.methods.transferUserTokensTo(from, to, realAmount).send({ from: ethAddrFrom }).then(function( transaction ) {
                        log.info("User ["+userId+"] Successfuly transfered ["+amount+"] tokens from ["+from+"] to ["+to+"], tax free for user");
                        callback(true, transaction);
                    }, function(err) {
                        log.error("User ["+userId+"] can't transfere tokens from ["+from+"] to ["+to+"], reason: ", err);
                        util.filterEthErrors(err.message, callback);
                    });

                });

            }.bind(this));

        },

        getBalances: function( callback ) {
            ctr.methods.balances(2).call().then(function (result) {
                callback(true, result);
            }, function (err) {
                log.error("Request smart-contract parameter failed with error: ", err);
                callback(false, err);
            });
        },

        getParameter: function( name, callback ) {
            if (name in ctr.methods) {
                ctr.methods[name]().call().then(function (result) {
                    callback(true, eth.fromContractDecimal(result));
                }, function (err) {
                    log.error("Request smart-contract parameter failed with error: ", err);
                    callback(false, err);
                });
            } else {
                log.error("Requested unknown parameter ["+name+"] of smart-contract");
                callback(false, "No such parameter in smart contract");
            }
        },

        getBalanceOf: function( addr, callback ) {
            eth.unlockAccount(ethAddrFrom, ethAddrPwd, function( success, result ) {
                if (!success) {
                    log.error("Master wallet unlock failed with message: ", result);
                    return callback(false, result);
                }

                ctr.methods.balanceOf(addr).call({ from: ethAddrFrom }, function( err, result ) {
                    if (err) callback(false, err);
                    else {
                        var balance = eth.fromContractDecimal(result);
                        callback(true, balance);
                    }
                });

            });
        },

        getTotalSupply: function( callback ) {
            return this.getBalanceOf(ethAddrFrom, callback);
        }


    }
})(
    config.get('contract:abi'),
    config.get('contract:addr'),
    config.get('contract:master-eth-addr'),
    config.get('contract:master-eth-password')
);

function chainSender( userIds, tokenType, amount, supportUserId, reason ) {
    var userId = userIds.pop();
    if (userId) {
        log.debug("Create token tranfere request { tokenType: '"+tokenType+"', userId: "+userId+", amount: '"+amount+"', supportUserId: "+supportUserId+", reason: '"+reason+"'}");
        internalTransaction.createTokenTransferRequest(tokenType, userId, amount, supportUserId, reason, function (success, result) {
            if (!success) log.error("Create token transfere request failed: ", result);
            else log.debug("Token transfere request successfuly created");

            chainSender(userIds, tokenType, amount, supportUserId, reason);
        });
    }
}

function broadcastTokens(supportUserId, userIds, reason, tokenType, amount, callback) {
    mysql.query("SELECT id FROM users WHERE id IN ("+userIds.map(function(v) { return parseInt(v); }).join()+")",[],
        function(error, results, fields) {
            if (error) {
                log.error(error);
                return callback(false, error.sqlMessage);
            }

            if (results.length!=userIds.length) {
                log.error("Tokens broadcast simulation error, potential hack. Users array: ["+userIds.join()+"], not all users from that array found in table `users`");
                return callback(false, "Internal server error");
            }

            if (!contract.tokenTypeAllowed(tokenType)) {
                log.error("Unsupported token type ["+tokenType+"]!");
                return callback(false, "Internal server error");
            }

            chainSender(userIds, tokenType, amount, supportUserId, reason);

            callback(true);
    });
}

function chainExternalSender(ethAddrs, tokenType, amount, supportUserId, reason) {
    var ethAddr = ethAddrs.pop();
    if (ethAddr) {
        log.debug("Create external token tranfere request { tokenType: '"+tokenType+"', Ethereum address: "+ethAddr+", amount: '"+amount+"', supportUserId: "+supportUserId+", reason: '"+reason+"'}");
        externalTransaction.createTokenTransferRequest(tokenType, ethAddr, amount, supportUserId, reason, function (success, result) {
            if (!success) log.error("Create external token transfere request failed: ", result);
            else log.debug("Token transfere request successfuly created");

            chainExternalSender(ethAddrs, tokenType, amount, supportUserId, reason);
        });
    }
}

function broadcastExternalTokens(supportUserId, addresses, reason, tokenType, amount, callback) {
    if (!contract.tokenTypeAllowed(tokenType)) {
        log.error("Unsupported token type ["+tokenType+"]");
        return callback(false, "Internal server error");
    }

    chainExternalSender(addresses, tokenType, amount, supportUserId, reason);

    callback(true);
}

function transfereMediaCoins( toUserId, amount, callback ) {
    amount = amount.toFixed(2);
    var currentCampaign = campaign.getCurrentCampaign();

    if (!currentCampaign) {
        log.error("There no active campaign now! MCN will no");
        return callback(false, "There no active campaign now, your");
    }
    var tokenTypeId = contract.getTokenTypeId(currentCampaign.mnemo);
    if (!tokenTypeId) {
        log.error("Campaign ["+currentCampaign.mnemo+"] does not exists");
        return callback(false, "Wrong current campaign code: "+currentCampaign.mnemo);
    }

    var transfereDescription = currentCampaign.descr+' [auto payment]';
    var realAmount = parseFloat(amount);
    var prevAmount = parseFloat(amount);
    if (currentCampaign.bonus>0) {
        realAmount = realAmount + parseInt(currentCampaign.bonus) * realAmount / 100;
        amount = parseFloat(amount) + parseInt(currentCampaign.bonus) * amount / 100;
        log.info("Current campaign bonus: "+currentCampaign.bonus+"; user amount "+prevAmount+" now "+amount);
    }

    users.getUserMCNAmountWallet(toUserId, function( success, result, type ) {
        if (!success) {
            log.error("Can't get users ["+toUserId+"] MCN amount wallet, error: ", result);
            return callback(false, result);
        }

        var toEthAddr = result;
        var walletType = type;

        if (walletType=='system') {
            internalTransaction.addTransferLog(tokenTypeId, 1, toUserId, toEthAddr, amount, transfereDescription, null, function( success, result ) {
                if (!success) {
                    log.error("Can't add internal transfere log, error: ",result);
                    return callback(false, result);
                }
                contract.transferTokenByType(currentCampaign.mnemo, toEthAddr, realAmount, callback);
            });
        } else {
            externalTransaction.addTransferLog(tokenTypeId, 1, toUserId, toEthAddr, amount, transfereDescription, null, function( success, result ) {
                if (!success) {
                    log.error("Can't add external transfere log, error: ", result);
                    return callback(false, result);
                }

                contract.transferTokenByType(currentCampaign.mnemo, toEthAddr, realAmount, callback);
            });
        }

    });
}

function updateMcnBalance() {
    contract.getTotalSupply(function( success, result ) {
        log.debug("updateMcnBalance success: "+success+"; result: "+result);
        if (success) {
            if (mcnBalance==null || mcnBalance==0) {
                mcnBalance = result;
            } else if (mcnBalance!=result) {
                var newBalance = result;
                if (mcnBalance>newBalance) {
                    log.info("Correcting current balance to "+newBalance+" from "+mcnBalance);
                } else {
                    log.error("Current MCN balance more than cached! Cached: "+mcnBalance, "; contract balance: "+newBalance);
                }
                mcnBalance = result;
            }
        } else {
            log.error("Can't update current contract balance: ", result);
        }
    });
}


function removePersonalEthWallet( userId, callback ) {
    var ethWalletTypeId = 2;
    mysql.query(
        "UPDATE " +
            "`user-personal-wallets` " +
        "SET " +
            "status = 0 " +
        "WHERE " +
            "link_user=? AND link_wallet_type=? AND status=1", [userId, ethWalletTypeId],
        function(error, results, fields) {
            if (error) {
                log.error(error);
                return callback(false, error.sqlMessage);
            }
            callback(true);
        });
}

function addPersonalEthAddress( userId, addr, callback ) {
    var ethWalletTypeId = 2;
    mysql.query(
        "SELECT " +
            "id " +
        "FROM " +
            "`user-personal-wallets` " +
        "WHERE " +
            "link_user=? AND link_wallet_type=? AND status=1", [userId, ethWalletTypeId],
        function(error, results, fields) {
        if (error) {
            log.error(error);
            return callback(false, error.sqlMessage);
        }

        if (results.length>0) {
            var walletId = results[0].id;
            mysql.query(
                "UPDATE " +
                    "`user-personal-wallets` " +
                "SET " +
                    "addr=?, date_update=now() " +
                "WHERE id = ?", [addr, walletId],
            function(error, results, fields) {
                if (error) {
                    log.error(error);
                    return callback(false, error.sqlMessage);
                }

                callback(true);
            });
        } else {
            mysql.query(
                "INSERT INTO " +
                    "`user-personal-wallets` (link_wallet_type, link_user, addr, date_create, status, amount, mcn_amount) " +
                "VALUES " +
                    "(?,?,?,now(), 1,0,0)", [ethWalletTypeId, userId, addr],
            function(error, results, fields) {
                if (error) {
                    log.error(error);
                    return callback(false, error.sqlMessage);
                }

                callback(true);
            });
        }
    });
}


function sendUserTokensTo( userId, to, amount, callback ) {
    users.getUserMCNAmountWallet(userId, function( success, result ) {
        if (!success) {
            log.error("Can't send user tokens, reason: "+result);
            return callback(false, result);
        }

        var userEthWallet = result;

        contract.transferFrom(userEthWallet, to, amount, function(success, result) {
            if (!success) {
                log.error("Tokens transfere from ["+userEthWallet+"] to ["+to+"] error: ", result);
                return callback(false, result);
            }

            callback(true);
        });
    });
}

function sendUserTokensFromWalletTo( userId, addrFrom, addrTo, amount, callback ) {
    users.checkUserWallet(userId, addrFrom, function( success, result ) {
        if (!success) {
            log.error("Send user tokens from wallet ["+addrFrom+"] failed: ", result);
            return callback(false, result);
        }

        contract.transferFrom(addrFrom, addrTo, amount, function(success, result) {
            if (!success) {
                log.error("Tokens transfere from ["+addrFrom+"] to ["+addrTo+"] failed with error: ", result);
                return callback(false, result);
            }

            externalTransaction.addTransferLog(7, userId, null, addrTo, amount, 'Personal tokens resender', null, function( success, result ) {
                if (!success) {
                    log.error("Can't add transfere log when sen personal tokens from wallet to addres, error: ", result);
                    return callback(false, result);
                }

                callback(true);
            });

        });

    });
}

module.exports.createNewWallet = function( type, password, callback ) {
    switch(type) {
        case 'ETH': eth.createNewWallet(password, callback);
            break;
        case 'BTC': btc.createNewWallet(password, callback);
            break;
    }

};

module.exports.getBalance = function(type, addr, callback) {
    switch(type) {
        case 'ETH':
            eth.getBalance(addr, callback);
            break;
        case 'BTC':
            btc.getBalance(addr, callback);
            break;
    }

};

module.exports.getMcnBalanceOf = function( addr, callback ) {
    contract.getBalanceOf(addr, callback);
}

module.exports.unlockAccount = function( type, address, password, callback ) {
    switch(type) {
        case 'ETH': eth.unlockAccount(address, password, callback);
            break;
        case 'BTC': btc.unlockAccount(address, password, callback);
            break;
    }

}

module.exports.transfereMediaCoins = transfereMediaCoins;

module.exports.readTotalSupply = function( callback ) {
    contract.getTotalSupply(callback);
};

module.exports.getContractParam = function( name, callback ) {
    contract.getParameter(name, callback);
};

module.exports.updateMcnBalance = updateMcnBalance;
module.exports.registerWallet = function( type, userId, callback ) {
    var self = this;
    mysql.query("SELECT id FROM `user-wallet-type` WHERE mnemo=?",[type], function(error, results, fields) {
        if (error) {
            log.error(error);
            return callback(false, error.sqlMessage);
        }
        if (results.length<=0) {
            return callback(false, 'Unknown wallet type');
        }

        var walletTypeId = results[0].id;

        mysql.query("SELECT id, addr FROM `user-wallets` WHERE link_user=? and link_wallet_type=?", [userId, walletTypeId], function(error, results, fields) {
            if (error) {
                log.error(error);
                return callback(false, error.sqlMessage);
            }

            if (results.length>0) {
                return callback(false, "Wallet with type "+type+" already registered for user");
            }

            var pwd = util.generateHashString(15);

            self.createNewWallet(type, pwd, function( success, data ) {
                if (success) {
                    var newAddr = data;
                    mysql.query(
                        "INSERT INTO " +
                        "`user-wallets` (link_user, addr, link_wallet_type, hash, amount, mcn_amount, create_date, last_update_date) " +
                        "VALUES " +
                        "(?,?,?,?,0,0,now(),now())", [userId, newAddr, walletTypeId, pwd], function(error, results, fields) {
                            if (error) {
                                log.error(error);
                                return callback(false, error.sqlMessage);
                            }

                            return callback(true, newAddr, results.insertId);
                        });
                } else {
                    log.error(data.stack);
                    return callback(false, data.message);
                }
            });

        });

    });
}

module.exports.collectWalletEth = function( addrFrom, hash, amount, callback  ) {
    var addrTo = collectors['ETH'];
    if (!addrTo) {
        log.error("Can't transfere wallet ETH to collector, collector address undefined!");
        return callback(false, "Collector address undefined");
    }
    eth.estimateGasPrice(addrFrom, addrTo, amount, function( success, result ) {
        if (!success) return callback(success, result);
        var gasPrice = result;
        if (gasPrice>=amount) {
            log.error("Gas price ["+gasPrice+"] more than amount ["+amount+"], collect wallet eth failed!");
            return callback(false, "Gas price more than amount");
        }
        var amountWithGas = amount - (gasPrice+gasPrice*0.1);
        log.info("Gas price: "+gasPrice+"; amount: ["+amount+"] amount with gas ["+amountWithGas+"]");
        // Сокращение до 4х знаков после запятой
        amountWithGas = Math.floor(amountWithGas* 1000000)/1000000;
        log.info("Amount with gas after floor: ["+amountWithGas+"]");
        // 3. Отправить эфир на кошелёк - холдер
        // If dev mode enabled
        if (dontTransfereAmounts) {
            log.debug("Tokens transfere disabled by dev configuration parameter");
            return callback(true);
        }
        eth.sendEther(addrFrom, hash, addrTo, amountWithGas.toString(), function( success, result ) {
            if (!success) {
                log.error("Ether transfer from "+addrFrom+" to "+addrTo+" failed, reason: ", result);
                return callback(false, result);
            }
            log.info("Ether transfer from "+addrFrom+" to "+addrTo+" successful.");
            return callback(true);

        });
    });
};

module.exports.tokensCharger = function( type, walletId, amount, mcnAmount, callback ) {
    if (!collectors[type]) {
        callback(false, "Wallet collector for currenct "+type+" not defined!");
        return;
    }

    var addrTo = collectors[type];

    mysql.query("SELECT addr, hash, link_user FROM `user-wallets` WHERE id=?", [walletId], function(error, results, fields) {
        if (error) {
            log.error(error);
            return callback(false, error.sqlMessage);
        }

        if (results.length<=0) {
            log.error("Wallet with id "+walletId+" not found");
            return callback(false, "Wallet not found!");
        }

        var wallet = results[0];

        switch(type) {
            case 'ETH':
                setTimeout(function() {
                    transfereMediaCoins(wallet.link_user, mcnAmount, function( success, result ) {
                        if (!success) {
                            log.error("User ["+wallet.link_user+"] balance charger error: can't send MCN tokens to user ["+wallet.link_user+"], error: ", result);
                        }
                    });
                }, 0);
                eth.estimateGasPrice(wallet.addr, addrTo, amount, function( success, result ) {
                    if (!success) return callback(success, result);
                    var gasPrice = result;
                    log.info("Gas price: "+gasPrice);
                    var amountWithGas = amount - (gasPrice+gasPrice*0.1);
                    amountWithGas = Math.floor(amountWithGas* 1000000)/1000000;
                    if (dontTransfereAmounts) {
                        log.debug("Tokens transfere disabled by dev configuration parameter");
                        return callback(true);
                    }
                    eth.sendEther(wallet.addr, wallet.hash, addrTo, amountWithGas.toString(), function( success, result ) {
                        if (!success) {
                            log.error("Ether transfer from "+wallet.addr+" to "+addrTo+" failed, reason: ", result);
                            return callback(false, result);
                        }
                        log.info("Ether transfer from "+wallet.addr+" to "+addrTo+" successful.");
                        return callback(true);

                    });
                });
                break;
            case 'BTC':
                setTimeout(function() {
                    transfereMediaCoins(wallet.link_user, mcnAmount, function (success, result) {
                        if (!success) {
                            log.error("User balance charger error: can't send MCN tokens to user [" + wallet.link_user + "], error: ", result);
                        }
                    });
                }, 0);
                if (dontTransfereAmounts) {
                    log.debug("Tokens transfere disabled by dev configuration parameter");
                    return callback(true);
                }

                callback(true);
                break;
        }
    });
}

module.exports.sendEther = eth.sendEther;

function updaetAdmineWallets( callback ) {
    callback = callback || function() {};
    mysql.query(
        "SELECT " +
            "id, link_user, addr, link_wallet_type, amount, hash " +
        "FROM " +
            "`admine-wallet`", [],
        function(error, results, fields) {
            if (error) {
                log.error("Error update admine wllets list: ", error);
                return callback(false, error.sqlMessage);
            }

            admineWallets = {};
            for (var i=0; i<results.length; i++) {
                var row = results[i];
                admineWallets[row.addr] = row.id;
            }

            callback(true);
        });
}

module.exports.getUserWallets = function( userId, callback ) {
    mysql.query(
        "SELECT " +
            "w.id, w.addr, w.amount, w.mcn_amount, t.mnemo as type " +
        "FROM " +
            "`user-wallets` w, `user-wallet-type` t " +
        "WHERE " +
            "t.id=w.link_wallet_type AND link_user=?", [userId],
        function(error, results, fields) {
            if (error) {
                log.error(error);
                return callback(false, error.sqlMessage);
            }

            callback(true, results);
        });
};

module.exports.getUserWalletsHistory = function( userId, callback ) {
    mysql.query(
        "SELECT " +
            "date_format(h.date, '%d.%m.%Y %H:%m:%s') as date, h.currency_type as currency, h.amount, w.addr, h.prev_balance, h.new_balance " +
        "FROM " +
            "`user-wallet-history` h, `user-wallets` w " +
        "WHERE " +
            "w.id = h.link_user_wallet AND w.link_user=?", [userId],
        function( error, results, fields) {
            if (error) {
                log.error(error);
                return callback(false, error.sqlMessage);
            }

            callback(true, results);
        });
};

module.exports.getUserPersonalETHWallet = function( userId, callback ) {
    mysql.query(
        "SELECT " +
            "addr, amount, mcn_amount, date_create " +
        "FROM " +
            "`user-personal-wallets` " +
        "WHERE " +
            "link_user=? AND link_wallet_type=? AND status=1", [userId, 2],
    function(error, results, fields) {
        if (error) {
            log.error(error);
            return callback(false, error.sqlMessage);
        }

        callback(true, results);
    });
};

module.exports.getTokenTypes = function( callback ) {
    mysql.query(
        "SELECT " +
            "mnemo, descr " +
        "FROM " +
            "`token-types` " +
        "WHERE " +
            "mnemo in ('advisorTokens', 'auditTokens','bountyTokens')", [], function(error, results, fields) {
        if (error) {
            log.error(error);
            return callback(false, error.sqlMessage);
        }

        callback(true, results);
    })
};

module.exports.getMCNBalance = function() {
    return mcnBalance;
}

module.exports.broadcastTokens = broadcastTokens;
module.exports.broadcastExternalTokens = broadcastExternalTokens;
module.exports.addPersonalEthAddress = addPersonalEthAddress;
module.exports.removePersonalEthWallet = removePersonalEthWallet;
module.exports.contract = contract;
module.exports.sendUserTokensTo = sendUserTokensTo;
module.exports.sendUserTokensFromWalletTo = sendUserTokensFromWalletTo;
module.exports.updaetAdmineWallets = updaetAdmineWallets;

// ------------- RUN MODULE LOGIC PART ------------------
updateMcnBalance();
updaetAdmineWallets();