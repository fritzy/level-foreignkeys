var level = require('level');
var LevelForeignKeys = require('../index.js');
var sconcat = require('concat-stream');

process.on('uncaughtException', function (err) {
    console.trace();
    console.error(err.stack);
    process.exit();
});

var db = LevelForeignKeys(level('./test.db'));

module.exports = {
    "create two keys, delete the latter": function (test) {
        function s1() {
            db.put('one', 'hai', s2);
        };
        function s2(err) {
            db.put('two', 'bye', s3);
        };
        function s3(err) {
            db.addForeignKey('one', 'link', 'two', s4);
        };
        function s4(err) {
            db.readForeignKeys('one', 'link').pipe(new sconcat(s5));
        };
        function s5(keys) {
            test.equals(keys[0].key, 'two');
            test.equals(keys.length, 1);
            test.equals(keys[0].value, 'bye');
            db.readReverseForeignKeys('two', 'link').pipe(new sconcat(s6));
        };
        function s6(keys) {
            test.equals(keys[0].key, 'one');
            test.equals(keys.length, 1);
            test.equals(keys[0].value, 'hai');
            db.del('two', function (err) {
                db.readForeignKeys('one', 'link').pipe(new sconcat(s8));
            });
        };
        function s8(keys) {
            test.equals(keys.length, 0);
            db.readForeignKeys('two', 'link').pipe(new sconcat(s9));
        };
        function s9(keys) {
            test.equals(keys.length, 0);
            test.done();
        };
        s1();
    },
    "create three keys, delete the first": function (test) {
        function s1() {
            db.put('one', 'hai', s2);
        };
        function s2(err) {
            db.put('two', 'bye', s2b);
        };
        function s2b(err) {
            db.put('trhee', 'bye', s3);
        };
        function s3(err) {
            db.addForeignKey('one', 'link', 'two', s3b);
        };
        function s3b(err) {
            db.addForeignKey('one', 'link', 'three', s4);
        };
        function s4(err) {
            db.readForeignKeys('one', 'link').pipe(new sconcat(s5));
        };
        function s5(keys) {
            test.equals(keys.length, 2);
            db.readReverseForeignKeys('two', 'link').pipe(new sconcat(s6));
        };
        function s6(keys) {
            test.equals(keys[0].key, 'one');
            test.equals(keys.length, 1);
            test.equals(keys[0].value, 'hai');
            db.del('one', function (err) {
                db.readForeignKeys('one', 'link').pipe(new sconcat(s8));
            });
        };
        function s8(keys) {
            test.equals(keys.length, 0);
            db.readForeignKeys('two', 'link').pipe(new sconcat(s9));
        };
        function s9(keys) {
            test.equals(keys.length, 0);
            test.done();
        };
        s1();
    },
};
