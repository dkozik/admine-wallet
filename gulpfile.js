var gulp = require('gulp');
var pug = require('gulp-pug');
var crypto = require('crypto');
var through = require('through2');
var fs = require('fs');

var encodePasswordFile = './config/config.encrypt.password';
var sourceJson = './config/contours/prod/config.dec.json';
var destJson = './config/contours/prod/config.enc.json';

function cryptConfig( src, dst, pwd, callback) {

    console.info("Encrypt config file "+src);
    var cipher = crypto.createCipher('aes-256-ctr', pwd);
    var srcData = fs.readFileSync(src);
    var crypted = cipher.update(srcData, 'utf8', 'hex');
    crypted+=cipher.final('hex');

    fs.writeFileSync(dst, crypted);
    console.info("Successfuly encoded to "+dst);

}

gulp.task('encrypt-config-prod', function( callback ) {
    var encodePassword = fs.readFileSync(encodePasswordFile);
    cryptConfig(sourceJson, destJson, encodePassword.toString(), callback);
});