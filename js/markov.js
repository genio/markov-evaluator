"use strict";

// Rule class
var Rule = function (line) {
    if (this instanceof Rule) {
        this._line = line.trim();
        this._lhs = '';
        this._rhs = '';
        this.expression = null;
        this.replacement = '';
        this.ending = false;
        this.empty = false;
        this.error = '';
        this.valid = false;
    } else {
        return new Rule(line);
    }

    this._create_rule = function() {
        var left = this._lhs || '';
        var right = this._rhs || '';
        if (left == '^' || /\^/.test(left)) {
            left = '';
            this.empty = true;
        }
        if (right.length && right.slice(-1) == '.') {
            this.ending = true;
            right = right.slice(0, -1);
        }
        right = right.split('$').join('$$');
        if (right == '^') right = '';

        if (!this.empty && left) {
            var positions = {};
            var cur_pos = 1;
            var expression = '';
            left.split("").forEach(function(cur_char, index) {
                // are we dealing with a variable?
                if (/^[a-z]$/.test(cur_char)) {
                    if (positions[cur_char]) {
                        cur_char = '\\' + positions[cur_char];
                    }
                    else {
                        positions[cur_char] = cur_pos;
                        cur_pos++;
                        cur_char = '(.)';
                    }
                }
                // are we dealing with a regex meta?
                else if (is_regex_meta(cur_char)) {
                    cur_char = '\\' + cur_char;
                }
                expression += cur_char;
            });
            // replace all variables on RHS with corresponding match spot
            Object.keys(positions).forEach(function(key, index) {
                right = right.split(key).join('\$'+positions[key]);
            });
            if (expression) {
                this.expression = new RegExp(expression);
            }
        }
        this.replacement = right;
        this.valid = true;
        return true;
    };

    this._validate = function() {
        this.valid = false;
        if (!this._line) {
            this.error = 'Rule is empty.';
            return false;
        }
        var parts = this._line.match(/^(\S+)\s*[-=]>\s*(\S+)$/);
        if (!Array.isArray(parts) || parts.length != 3) {
            this.error = "doesn't match X -> Y pattern";
            return false;
        }
        // left side will be just ^ if ^ appears anywhere
        if (/\^/.test(parts[1])) parts[1] = '^';
        // check RHS for variables not existing in LHS
        var vars_exist = parts[2].split("").every(function (char, index) {
            if (/^[a-z]$/.test(char)) {
                return parts[1].indexOf(char) != -1;
            }
            return true;
        });
        if (!vars_exist) {
            this.error = "contains variables in RHS not found in LHS";
            return false;
        }

        this._lhs = parts[1];
        this._rhs = parts[2];
        return true;
    };

    this.toString = function() {
        return this._lhs + ' -> ' + this._rhs;
    };

    if (this._validate()) {
        this._create_rule();
    }
};

var error_msg; // error messages from attempting to validate rules
var rule_set; // CodeMirror object
var rules = []; // array of available rules

function attempt_run() {
    results_clear();
    if (!rules_validate(rule_set)) {
        return false;
    }

    var startString = $('#inputString').val();
    if (!startString) {
        startString = '^';
        $('#inputString').val('^');
    }
    var endString = startString;
    var limit = $('#maxIterations').val() || 100;
    result_debug("Starting with: "+startString);

    // end early due to no rules
    if (!Array.isArray(rules) || rules.length < 1) {
        result_debug("No matching rules.");
        result_debug("From: "+startString+" to "+endString);
        return false;
    }

    // loop through
    var iteration = 1;
    while (iteration < limit+2) {
        if (iteration > limit) {
            result_debug("Too many iterations. Stopping.");
            break;
        }
        var done = false;
        var rule_num = 0;
        var rule_string = '';
        var found = rules.some(function (rule, index) {
            if (!rule) return false;
            if (rule.empty) {
                endString = rule.replacement + endString;
                rule_num = index+1;
                rule_string = rule.toString();
                if (rule.ending) done = true;
                return true;
            }
            else if (rule.expression.test(endString)) {
                endString = endString.replace(rule.expression, rule.replacement);
                rule_num = index+1;
                rule_string = rule.toString();
                if (rule.ending) done = true;
                return true;
            }
            return false;
        });
        if (!found) {
            result_debug("No matching rules.");
            break;
        }
        result_add(iteration, endString, rule_num, rule_string);
        iteration++;
        if (done) break;
    }
    result_debug("From: "+startString+" to "+endString);
    return true;
}

function errors_hide() {
    $('#error_screen').html('').hide();
}

function errors_show(msg) {
    $('#error_screen').html(msg).show();
}

function is_greek(foo) {
    if (!foo) return false;
    return (['@','#','$','%','&','*'].indexOf(foo) != -1);
}

function is_regex_meta(foo) {
    if (!foo) return false;
    return (['\\','^','$','*','+','?','[',']','{','}','.','|'].indexOf(foo) != -1);
}

function results_clear() {
    $('#results > tbody').html('');
}

function result_add(step, current, rule_num, rule) {
    $('#results > tbody').append(
        '<tr><td>' + step +
        '</td><td>' + current +
        '</td><td>' + rule_num +
        '</td><td>' + rule +
        "</td></tr>\n"
    );
}

function result_debug(msg="") {
    $('#results > tbody').append("<tr><td>&nbsp;</td><td>"+msg+"</td><td>&nbsp;</td><td>&nbsp</td></tr>\n")
}

function rules_string() {
    var string = '';
    rules.forEach(function(rule, index) {
        string += rule.toString() + "\n";
    });
    return string;
}

function rules_validate(cm = null) {
    errors_hide();
    rules = [];
    error_msg = '';
    if (!cm) return false;
    var val = cm.getValue("\n");
    if (!val) return false;
    var lines = val.split("\n");

    if (!lines || !Array.isArray(lines)) return false;
    lines.forEach(function (line, index) {
        line = line.trim();
        if (!line) return;
        var rule = new Rule(line);
        if (!rule.valid) {
            error_msg += '<p>Rule #' + (index+1) + " error: " + rule.error + "!</p>\n";
            return;
        }
        rules.push(rule);
    });
    if (error_msg) {
        errors_show(error_msg);
        return false;
    }
    return true;
}

$( document ).ready(function() {
    results_clear();
    rule_set = CodeMirror.fromTextArea( document.getElementById("ruleset"), {
        lineNumbers: true,
        autoClearEmptyLines: true
    });
    rule_set.setSize(null, '200px');
    rule_set.setValue("@xy -> y@x\n@ -> ^.\n^ -> @");
    rule_set.on("blur", function(cm, change) {
        if (rules_validate(cm)) {
            var lines = rules_string();
            if (lines != cm.getValue("\n")) {
                cm.setValue(lines);
            }
        }
    });

    $('#execute_eval').click(function () {
        $('#execute_eval').disabled = true;
        attempt_run();
        $('#execute_eval').disabled = false;
    });

    $('#clear_results').click(function () {
        results_clear();
    });

    $('#inputString').on("keyup blur change", function() {
        var val = $('#inputString').val();
        var upper = val.toUpperCase();
        if (val === upper) return false;
        $('#inputString').val(val.toUpperCase());
    });

    // get a floored INT value
    $('#maxIterations').on("keyup blur change", function() {
        var val = $('#maxIterations').val();
        var clean = 1;
        if (/^(?:\-|\+)?(?:[0-9.]+)$/.test(val))
            clean = Math.floor(val);
        if (clean < 1) clean = 1;
        if (clean > 1000) clean = 1000;
        $('#maxIterations').val(clean);
    });
});
