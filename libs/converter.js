var log = require('./log')(module);
var mysql = require('./mysql');
var async = require('async');
var currency = require('./currency');
var lastUpdateDate = null;
var currentPriceList = {};

function updatePriceList() {
    log.info("Update price list");
    mysql.query(
        "SELECT " +
            "p.currency_type, p.price, p.date " +
        "FROM " +
            "`price-hist` p, (SELECT currency_type, max(date) dt FROM `price-hist` GROUP BY currency_type) ds " +
        "WHERE " +
            "p.date = ds.dt and p.currency_type = ds.currency_type",
        [],
        function(error, results, fields) {
            if (error) {
                log.error(error);
                return;
            }

            for (var i=0; i<results.length; i++) {
                var row = results[i];
                log.info("Price for "+row.currency_type+": "+row.price+"; last update date: "+row.date);
                currentPriceList[row.currency_type] = {
                    date: row.date,
                    price: row.price
                }
            }

            lastUpdateDate = Date.now();
            log.info("Update price list finished");
        });
}

async.parallel([function() {

    setInterval(function() {
        updatePriceList();
    }, 60000*5);

}]);

module.exports.convertToMcn = function( type, amount ) {
    var priceElement = currentPriceList[type];
    log.info("Convert ["+type+":"+amount+"] to MCN, price: "+(priceElement!=null?priceElement.price:"NOT FOUND!"));
    if (priceElement!=null) {
        var price = priceElement.price;
        return parseFloat(amount)*parseFloat(price);
    }
    log.error("Unknown currency type: "+type);
    return -1;
}

module.exports.convertToEth = function( type, amount ) {
    if (type=='ETH') {
        log.error("Can't convert ETH to ETH");
        return amount;
    }
    var ethPrice = priceElement['ETH'].price;
    var priceElement = currentPriceList[type];
    if (priceElement!=null) {
        var price = priceElement.price;
        return amount*price/ethPrice;
    }
    return -1;
}

updatePriceList();