var config = require('../config');
var log = require('../log')(module);
var Web3 = require('web3');
var web3 = web3 = new Web3(new Web3.providers.HttpProvider(config.get('wallet:eth')));
var web3Utils = require('web3-utils');

var decimals = Math.pow(10, config.get('contract-decimals') || 5);

module.exports = {
    createNewWallet: function(password, callback) {
        web3.eth.personal.newAccount( password ).then(function( newAddr ) {
                callback(true, newAddr);
            },
            function( err ) {
                callback(false, err);
            });
    },
    getBalance: function(addr, callback) {
        web3.eth.getBalance(addr, 'latest', function( err, data ) {
            if (err) {
                callback(false, err);
            } else {
                callback(true, web3Utils.fromWei(data, 'ether'));
            }
        });
    },
    unlockAccount: function(addr, password, callback) {
        web3.eth.personal.unlockAccount(addr, password, function(error, isOpened) {
            if (isOpened) {
                callback(true);
            } else {
                callback(false, error);
            }
        });
    },
    toWei: function( amount ) {
        return web3Utils.toWei(amount, 'ether');
    },
    fromWei: function( amount ) {
        return web3Utils.fromWei(amount, 'ether');
    },
    toBn: function( amount ) {
        return new web3.utils.BN(amount);
    },
    toContractDecimal: function( amount ) {
        return parseFloat(amount).toFixed(5)*decimals;
    },
    fromContractDecimal: function( amount ) {
        return amount/decimals;
    },
    estimateGasPrice: function(from, to, amount, callback) {
        web3.eth.estimateGas({ from: from, to: to, amount: web3Utils.toWei(amount.toString(), 'ether') }).then(
            function( gasAmount ) {
                web3.eth.getGasPrice().then(
                    function( gasPrice ) {
                        var gasAmountHigh = gasAmount + 100000;
                        var estimateGas = web3Utils.fromWei(gasAmountHigh.toString(), 'ether') * gasPrice.toString();
                        callback(true, estimateGas);
                    },
                    function( err ) {
                        callback(false, err);
                    }
                );
            },
            function( err) {
                callback(false, err);
            }
        );
    },
    sendEther: function(from, password, to, amount, callback) {
        this.unlockAccount(from, password, function( success, result ) {
            if (!success) return callback(success, result.message);
            log.info("Send ether from "+from+" to "+to+" amount: "+amount);
            web3.eth.sendTransaction({
                from: from,
                to: to,
                value: web3Utils.toWei(amount, 'ether')
            }).then(function() {
                    log.info("Successfuly sent ether from "+from+" to "+to+" amount: "+amount);
                    callback(true);
                },
                function( err ) {
                    log.error("Error sending ether from "+from+" to "+to+" amount: "+amount+"; reason: "+err);
                    callback(false, err);
                });
        });
    },
    getContract: function( abi, contractAddr ) {
        return new web3.eth.Contract(abi, contractAddr);
    },
    getStorage: function( contractAddr, offset ) {
        return web3.eth.getStorageAt(contractAddr, offset);
    }
}