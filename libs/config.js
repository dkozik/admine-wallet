var fs = require('fs');
var log = require('./log')(module);
var crypto = require('crypto');

var config = new (function ( root ) {
    var confData = {};
    var params = {};

    var encJson = root+'/config.enc.json';
    var decJson = root+'/config.json';
    var checkSumFile = root+'/checksum'
    var defaultHashSum = "45A456LdV%+GgroM";

    function makeTree( obj, res, prefix, level ) {
        for (var key in obj) {
            var keys = Object.keys(obj[key]);
            if (typeof(obj[key])=='object' && keys.length>0 && level<1) {
                makeTree(obj[key], res, prefix+key+':', level+1);
                res[prefix+key] = obj[key];
            } else {
                res[prefix+key] = obj[key];
            }
        }
        return res;
    }

    function loadConfig() {
        if (fs.existsSync(encJson)) {
            log.info('Read config from '+encJson);
            var checksum = fs.existsSync(checkSumFile)?fs.readFileSync(checkSumFile):defaultHashSum;
            var decipher = crypto.createDecipher('aes-256-ctr', checksum);
            var encData = fs.readFileSync(encJson);
            var dec = decipher.update(encData.toString(), 'hex', 'utf8');
            dec+=decipher.final('utf8');
            var json = JSON.parse(dec);
            params = makeTree(json, {}, '', 0);
        } else if (fs.existsSync(decJson)) {
            log.info('Read config from '+decJson);
            var json = JSON.parse(fs.readFileSync(decJson));
            params = makeTree(json, {}, '', 0);
        } else {
            log.error("There no config files for project!");
        }
    }

    try {
        loadConfig();
    } catch(e) {
        log.error("Load config file failed: ", e);
        process.exit();
    }

    return {
        get: function( name ) {
            return params[name];
        }
    }
})( './config' );


module.exports = config;