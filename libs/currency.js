var log = require('./log')(module);
var mysql = require('./mysql');
var async = require('async');
var config = require('./config');
var https = require('https');
var lastUpdateDate = null;

var urls = config.get('currency') || {};
var usdPrice = config.get('mcn-usd-price') || 2.5;
var currentValues = {};

function updateCurrencyList( list, urls, callback ) {
    if (list.length>0) {
        var currency = list.pop();

        https.get(urls[currency], function( resp ) {
            var buf = [];
            resp.on('data', function( chunk ) {
                buf.push(chunk);
            });

            resp.on('end', function() {
                currentValues[currency] = JSON.parse(buf.join(''))[0];
                updateCurrencyList( list, urls, callback );
            });

        }).on('error', function(err) {
            log.error(err.message);
            updateCurrencyList( list, urls, callback );
        });
    } else {
        callback(true);
    }
}

function calcMCNPriceForCurrency( currency, value ) {
    if (!currentValues[currency]) {
        log.error("Requested unknown currency: "+currency+"; currency not exists in current list");
        return null;
    }

    var $cur = parseFloat(currentValues[currency].price_usd);
    return $cur/usdPrice;
}

function updateMinorCurrencies( callback ) {
    for (var key in currentValues) {
        var MCNPrice = calcMCNPriceForCurrency(key, 1);
        mysql.query("INSERT INTO `price-hist` (date, currency_type, price) VALUES (now(), ?, ?)", [key, MCNPrice], function(error, results, fields) {
            if(error) {
                log.error("Can't insert new currency price ("+key+")");
                return callback(false, error.sqlMessage);
            }

            callback(true, results.insertId);
        });
    }
}

function updateCurrency( callback ) {
    var currencies = Object.getOwnPropertyNames(urls);
    updateCurrencyList(currencies, urls, function(success, error) {

        for (var key in urls) {
            if (!currentValues[key]) continue;
            log.info("\t"+key+": $"+currentValues[key].price_usd);
        }

        if (success) {
            updateMinorCurrencies(function(success, result) {
                callback(success, result);
            });
        } else {
            callback(success, error);
        }

    });
}

async.parallel([function() {
    var iterationNumber = 0;
    var currencyThread = null;

    function scheduleNextUpdateIteration( timeout ) {
        currencyThread = setTimeout(function() {
            iterationNumber++;
            log.info("Update currency list started.");
            updateCurrency(function( success, result ) {
                log.info("Update currency list finished.");
                if (!success) {
                    log.error("Update currency failed, error: "+result);
                }
                clearTimeout(currencyThread);
                scheduleNextUpdateIteration(timeout);
            });
        }, timeout);
    }

    scheduleNextUpdateIteration(config.get('currency-thread-schedule-timeout') || 60000*15);
}]);

module.exports.getCurrencyPrice = function( currency ) {
    if (!currentValues[currency]) {
        log.error("Requested unknown currency: "+currency+"; currency not exists in current list");
        return null;
    }
    return currentValues[currency].price_usd;
}

module.exports.calcMCNPriceForCurrency = calcMCNPriceForCurrency;


// ------------ module logic -------------------
updateCurrency(function( success, result ) {
    log.info("Currency list update finished.");
});