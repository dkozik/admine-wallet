var args = {

};

var skipNext = false;
for (var i=0; i<process.argv.length; i++) {
    if (skipNext) {
        skipNext = false;
        continue;
    }
    var ar = process.argv[i];
    if (ar.indexOf('--')==0) {
        if (ar.indexOf('=')>0) {
            var vls = ar.split('=');
            args[vls[0].substr(2)] = vls[1];
        } else {
            args[ar.substr(2)] = process.argv[i+1];
            skipNext = true;
        }
    }
}

module.exports = {
    get: function( name ) {
        return args[name] || '';
    }
};