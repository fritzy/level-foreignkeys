# level-foreignkeys

Manage relationships between keys, and stream the results.

Deleting keys automatically cleans up their relationships.

##Full Use Example

```js
var level = require('level');
var LevelForeignKeys = require('level-foreignkeys');
var ConcatStream = require('concat-stream');

var db = LevelForeignKeys(level('./some-path.db'));

function put1() {
    db.put('greeting1', 'hello', put2);
}
function put2() {
    db.put('greeting2', 'hi', put3);
}
function put3() {
    db.put('signoff1', 'bye', link1);
}
function link1() {
    db.addForeignKey('greeting1', 'response', 'signoff1', link2);
}
function link2() {
    db.addForeignKey('greeting2', 'response', 'signoff1', get1);
}
function get1() {
    var results = readForeignKeys('greeting1', 'response', {});
    results.pipe(new ConcatStream(function (entries) {
        console.log(entries);
        /*
        [{key: 'signoff1', value: 'bye'}]
        */
        get2();
    }));
}
function get2() {
    var results = readReverseForeignKeys('signoff1', 'response', {});
    results.pipe(new ConcatStream(function (entries) {
        console.log(entries);
        /*
        [{key: 'greeting1', value: 'hello'}, {key: 'greeting2': value: 'hi'}]
        */
    }));

}

put1();
```

##Installing

`npm install --save level-foreignkeys`

##Running Tests

```bash
cd node_modules/level-foreignkeys
npm i
npm test
```

##Wrapping LevelUp to "Mix-in" Foreign Key Methods

```javascript
var level = require('level'); //by default, uses leveldown+levelup
var LevelForeignKeys = require('level-foreignkeys');

var db = LevelForeignKeys(level('./some-path.db'));
```

##Adding Foreign Key

__addForeignKey(key, field, foreignKey, putOptions, callback)__

Arguments:

* key: The key you want the relationship to start from.
* field: The name of the relationship type. This may represent the field in your value object. It might not. It is the name that categorizes the relationship.
* foreignKey: The key you want to link the first key to.
* putOptions: In running this function, it does several puts. Pass in the options you want to pass to those put operations.
* callback: Function called when done.

```js
db.addForeignKey(key, relationship, foreignkey, {}, function(err) {
    console.log("added link from %s to %s with the field %s", key, foreignkey, relationship);
});
```

##Removing a Foreign Key

In the same way you added the foreign key, you may remove it.

__delForeignKey(key, field, foreignKey, delOoptions, callback)__

Arguments:

* key: The key you want the relationship to start from.
* field: The name of the relationship type. This may represent the field in your value object. It might not. It is the name that categorizes the relationship.
* foreignKey: The key you want to link the first key to.
* delOptions: In running this function, it does several del calls. Pass in the options you want to pass to those del operations.
* callback: Function called when done.

```js
db.delForeignKey(key, relationship, foreignkey, {}, function(err) {
    if (!err) {
        console.log("deleted link from %s to %s with the field %s", key, foreignkey, relationship);
    }
});
```

##Streaming Foreign Keys

__readForeignKeys(key, field, opts)__

Arguments:

* key: The key you want to get the foreign keys of.
* field: The relationship category that you want.
* opts: The extra options Object that you want to merge into the `createReadStream` call that this function makes.

Returns:

A node `stream` of key/value entries that have the queried relationship.

```js
var resultStream = db.readForeinKeys('somekey', 'somerelationship', {some: 'options'});
```

##Streaming Reversed Relationships

level-foreignkeys also keeps track of the relationships in reverse with separate indexes.
Retreiving them similarly involves starting at the other end of the relationship and using `readReverseForeignKey`.

__readReverseForeignKeys(key, field, opts)__

Arguments:

* key: The foreign key from which you want to get the keys related.
* field: The relationship category that you want.
* opts: The extra options Object that you want to merge into the `createReadStream` call that this function makes.

Returns:

A node `stream` of key/value entries that have the queried relationship.

```js
var resultStream = db.readReverseForeignKeys('someforeignkey', 'somerelationship', {some: 'options'});
```
