var async = require('async');
var config = require('../config');

var storageExpireTime = config.get('web-storage-expire-time') || 60000;

function storageElement() {
    var permanentKeys = {};
    var values = {}, updateTime = null, accessTime = null;

    return {
        put: function( name, value, permanent ) {
            values[name] = { value: value, permanent: permanent };
            if (permanent) {
                permanentKeys[name] = true;
            }
            updateTime = Date.now();
        },
        get: function( name ) {
            accessTime = Date.now();
            return values[name];
        },
        remove: function(name) {
            if (name in values) delete(values[name]);
            return this;
        },
        clear: function() {
            var pkeys = Object.getOwnPropertyNames(permanentKeys);
            if (pkeys.length<=0) {
                values = {};
            } else {
                for (var key in values) {
                    if (!permanentKeys[key]) delete(values[key]);
                }
            }
            return pkeys.length>0;
        },
        getAccessTime: function() {
            return accessTime;
        },
        getUpdateTime: function() {
            return updateTime;
        }
    }
}

var storageManager = new (function() {

    var storage = {};

    function timerIteration( callback ) {
        var now = Date.now();
        for (var sessionId in storage) {
            var item = storage[sessionId];
            if (now - item.getAccessTime() > storageExpireTime) {
                if (!item.clear()) delete(storage[sessionId]);
            }
        }
        callback(true);
    }

    async.parallel([function() {
        var watcherThread = null;
        function scheduleNextStep( timeout ) {
            watcherThread = setTimeout(function() {
                timerIteration(function( success, result ) {
                    clearTimeout(watcherThread);
                    scheduleNextStep( timeout );
                });
            }, timeout);
        }

        scheduleNextStep( storageExpireTime );
    }]);

    return {
        put: function( sessionId, key, value, permanent ) {
            if (!storage[sessionId]) {
                storage[sessionId] = new storageElement();
            }
            storage[sessionId].put(key, value, permanent);
            return this;
        },
        get: function( sessionId, key ) {
            return (sessionId in storage)?storage[sessionId].get(key):null;
        },
        save: function( sessionId, key, value) {
            return this.put(sessionId, key, value, true);
        },
        getSessionStorage: function( sessionId ) {
            if (!storage[sessionId]) {
                storage[sessionId] = new storageElement();
            }
            return storage[sessionId];
        }
    }
})();

module.exports = storageManager;