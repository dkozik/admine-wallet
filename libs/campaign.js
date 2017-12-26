var mysql = require('./mysql');
var log = require('./log')(module);
var async = require('async');
var currentCampaign = null;
var currentDate = new Date();

function twoDigits(d) {
    return ('0'+d.toString()).substr(-2);
}

function dateToMySQL( date ) {
    return date.getUTCFullYear() + "-" + twoDigits(1 + date.getUTCMonth()) + "-" + twoDigits(date.getUTCDate());
}

function getCampaingToDate( date, callback ) {
    var dateStr = dateToMySQL(date);
    mysql.query(
        "SELECT " +
            "p.id, p.bonus_percent, p.date_start, p.date_end, t.mnemo, t.descr, t.percent as mcn_percent " +
        "FROM " +
            "`token-type-periods` p, `token-types` t " +
        "WHERE " +
            "t.id = p.link_token_type " +
        "AND " +
            "p.date_start<=str_to_date(?, '%Y-%m-%d') " +
        "AND " +
            "p.date_end>=str_to_date(?, '%Y-%m-%d')", [dateStr, dateStr],
        function(error, results, fields) {
            if (error) {
                log.error(error);
                return callback(false, error);
            }

            if (results.length>0) {
                var row = results[0];
                return callback(true, {
                    id: row.id,
                    bonus: row.bonus_percent,
                    date_start: row.date_start,
                    date_end: row.date_end,
                    mnemo: row.mnemo,
                    descr: row.descr,
                    mcn_percent: row.mcn_percent
                });
            }

            callback(true, null);
        });

}

function updateCurrentCampaign( callback ) {
    callback = callback || function() {};
    getCampaingToDate(currentDate, function( success, result ) {
        if (!success) {
            log.error("Unable to update current campaign");
            return callback(false, result);
        }
        currentCampaign = result;

        if (result==null) {
            log.info("There no campaign for today ("+dateToMySQL(currentDate)+")! All payments will be frozen on wallets");
        } else {
            var c = result;
            log.info("Today ("+dateToMySQL(currentDate)+") campaign: "+c.mnemo+" ("+c.descr+"); campaign starts at "+dateToMySQL(c.date_start)+" and ends at "+dateToMySQL(c.date_end)+"; today bonus: "+c.bonus);
        }

        callback(true, result);
    });
}

async.parallel([
    function() {
        setInterval(function() {
            var date = new Date();
            if (dateToMySQL(date)!=dateToMySQL(currentDate)) {
                log.info("Campaign changed current date ("+dateToMySQL(currentDate)+") to "+dateToMySQL(date));
                currentDate = date;
                updateCurrentCampaign();
            }
        }, 4000);
    }
]);

module.exports.getCampaingToDate = getCampaingToDate;
module.exports.getTodayCampaign = function( callback ) {
    return getCampaingToDate(new Date(), callback);
};
module.exports.getCurrentCampaign = function() {
    return currentCampaign;
};

// ------------------ module logic -------------------------
updateCurrentCampaign();