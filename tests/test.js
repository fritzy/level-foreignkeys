var level = require('level');
var LevelForeignKeys = require('../index.js');
var sconcat = require('concat-stream');

var db = LevelForeignKeys(level('./test.db'));

module.exports = {
    "create two keys, load from each other": function (test) {
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
            test.done();
        };
        s1();
    },
};
