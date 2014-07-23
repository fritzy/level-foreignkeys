var Padlock = require('padlock').Padlock;
var lstreams = require('level-streams');
var underscore = require('underscore');

function LevelForeignKeys(_db, fkopts) {

    fkopts = fkopts || {};
    fkopts.sep = fkopts.sep || '!';
    var lock = new Padlock();
    
    function DB() {};
    DB.prototype = _db;
    var db = new DB();
    db.parent = _db;

    db.addForeignKey = function (key, field, fkey, opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        lock.runwithlock(function () {
            db.parent.put(['__foreign__', key, field, fkey].join(fkopts.sep), fkey, opts, function (err) {
                db.parent.put(['__rev_foreign__', fkey, field, key].join(fkopts.sep), key, opts, function (err) {
                    lock.release();
                    cb();
                });
            });
        });
    };

    db.delForeignKey = function (key, field, fkey, opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        lock.runwithlock(function () {
            db.parent.del(['__foreign__', key, field, fkey].join(fkopts.sep), opts, function (err) {
                db.parent.del(['__rev_foreign__', fkey, field, key].join(fkopts.sep), opts, function (err) {
                    lock.release();
                    cb();
                });
            });
        });
    };

    db.readForeignKeys = function (key, field, opts, rev_lookup) {
        opts = opts || {};
        var prefix = '__foreign__';
        if (rev_lookup) {
            prefix = '__rev_foreign__';
        }
        return lstreams.createPrefixReadStream(db, [prefix, key, field].join(fkopts.sep), opts)
            .pipe(new lstreams.GetKeyOfValue(db, opts));
    };

    db.readReverseForeignKeys = function (key, field, opts) {
        return db.readForeignKeys(key, field, opts, true);
    };

    db.del = function (key, opts, cb) {
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        var readOpts = underscore.clone(opts);
        readOpts.values = false;
        lstreams.createPrefixReadStream(db, ['__foreign__', key].join(fkopts.sep), readOpts)
            .pipe(new lstreams.DeleteEvery(db, opts));
        lock.runwithlock(function () {
            db.parent(key, opts, function (err) {
                lock.release();
                cb(err)
            });
        });
    };

    return db;
}

module.exports = LevelForeignKeys;
