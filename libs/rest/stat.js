var express = require('express');
var router = express.Router();
var mysql = require('mysql');
var config = require('../config');
var metric = require('../metric');
var wallet = require('../wallet');
var auth = require('../auth');
var currency = require('../currency');
var analytics = require('../pay/analytics');
var log = require('../log')(module);

router.use(function(req, res, next) {
    next();
});

router.get('/ts', function(req, res, next) {
    res.send({ts: Date.now()});
});

router.get('/full', function(req, res, next) {
    var amounts = metric.getAllCurrencyAmount('MCN');
    var tokens = metric.getAllTokns();
    var resObject = {
        amounts: amounts,
        ts: Date.now(),
        mcn_usd_price: config.get('mcn-usd-price') || 2.5,
        pre_sale_tokens: 5000000,
        total_mcn_amount: wallet.getMCNBalance(),
        users_count: auth.getUsersCount(),
        pay_users_count: metric.getPaymentUsersCount(),
        tokens: tokens
    };
    var mcnCurrencies = {};
    var usdCurrencies = {};
    for (var key in amounts) {
        mcnCurrencies[key] = currency.calcMCNPriceForCurrency(key, 1);
        usdCurrencies[key] = currency.getCurrencyPrice(key);
    }

    resObject.mcn_currencies = mcnCurrencies;
    resObject.usd_currencies = usdCurrencies;

    res.send({ok:true, metric: resObject });
});

router.get('/counters', function(req, res, next) {
    var result = {ok: true};
    result.contract = metric.getAllTokns();
    res.send(result);
});

router.get('/pre_sale_supply', function(req, res, next) {
    wallet.contract.getBalances(function( success, result ) {
        res.send({ ok: success, result: result });
    });
});

router.get('/get_transaction_log', function(req, res, next) {
    var count = parseInt(req.query.count || 15);
    var from = parseInt(req.query.from || 0)
    if (isNaN(count) || count<5) {
        return next({ message: 'Parameter [count] must be more or equals 5'});
    }
    if (isNaN(from)) {
        return next({ message: 'Parameter [from] ivalid' });
    }
    auth.getSession(req, function( err, data ) {
        if (err) return next({message: data});

        var userId = data;

        if (auth.getUserAccessLevel(userId) <= 1) return next({message: "Permission denied "});

        analytics.getTransactionLog(req, function( success, result, count, pos ) {
            if (!success) {
                log.error("Error query transaction log: ", result);
                return next({ message: result });
            }

            res.send({ ok: true, total_count: count, pos: pos, rows: result });
        });
    });
});

module.exports = router;
