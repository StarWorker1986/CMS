var noop = function () { };
var noarg = function (f) { return function () { return f(); }; };
var compose = function (fa, fb) {
    return function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        return fa(fb.apply(null, args));
    };
};
var constant = function (value) {
    return function () {
        return value;
    };
};
var identity = function (x) {
    return x;
};
var tripleEquals = function (a, b) {
    return a === b;
};
function curry(fn) {
    var initialArgs = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        initialArgs[_i - 1] = arguments[_i];
    }
    return function () {
        var restArgs = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            restArgs[_i] = arguments[_i];
        }
        var all = initialArgs.concat(restArgs);
        return fn.apply(null, all);
    };
}
var not = function (f) {
    return function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        return !f.apply(null, args);
    };
};
var die = function (msg) {
    return function () {
        throw new Error(msg);
    };
};
var apply = function (f) {
    return f();
};
var call = function (f) {
    f();
};
var never = constant(false);
var always = constant(true);
export { noop, noarg, compose, constant, identity, tripleEquals, curry, not, die, apply, call, never, always, };