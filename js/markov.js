// Rule class
let Rule = function (line) {
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
        let left = this._lhs || '';
        let right = this._rhs || '';
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
            let positions = {};
            let cur_pos = 1;
            let expression = '';
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
        let parts = this._line.match(/^(\S+)\s*[-=]>\s*(\S+)$/);
        if (!Array.isArray(parts) || parts.length != 3) {
            this.error = "doesn't match X -> Y pattern";
            return false;
        }
        // left side will be just ^ if ^ appears anywhere
        if (/\^/.test(parts[1])) parts[1] = '^';
        // check RHS for variables not existing in LHS
        let vars_exist = parts[2].split("").every(function (char, index) {
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

let error_msg; // error messages from attempting to validate rules
let rule_set; // CodeMirror object
let rules = []; // array of available rules

function attempt_run() {
    results_clear();
    if (!rules_validate(rule_set)) {
        return false;
    }

    let startString = document.querySelector('#inputString').value;
    if (!startString) {
        startString = '^';
        document.querySelector('#inputString').value = '^';
    }
    let endString = startString;
    let limit = document.querySelector('#maxIterations').value ?? 100;
    result_debug(`Starting with: ${startString}`);

    // end early due to no rules
    if (!Array.isArray(rules) || rules.length < 1) {
        result_debug('No matching rules.');
        result_debug(`From: ${startString} to ${endString}`);
        return false;
    }

    // loop through
    let iteration = 1;
    while (iteration < limit + 2) {
        if (iteration > limit) {
            result_debug('Too many iterations. Stopping.');
            break;
        }
        let done = false;
        let rule_num = 0;
        let rule_string = '';
        let found = rules.some(function (rule, index) {
            if (!rule) return false;
            if (rule.empty) {
                endString = rule.replacement + endString;
                rule_num = index + 1;
                rule_string = rule.toString();
                if (rule.ending) done = true;
                return true;
            }
            else if (rule.expression.test(endString)) {
                endString = endString.replace(rule.expression, rule.replacement);
                rule_num = index + 1;
                rule_string = rule.toString();
                if (rule.ending) done = true;
                return true;
            }
            return false;
        });
        if (!found) {
            result_debug('No matching rules.');
            break;
        }
        result_add(iteration, endString, rule_num, rule_string);
        iteration++;
        if (done) break;
    }
    result_debug(`From: ${startString} to ${endString}`);
    return true;
}

function errors_hide() {
    let elem = document.querySelector('#error_screen');
    elem.innerHTML = '';
    elem.style.display = 'none';
}

function errors_show(msg) {
    let elem = document.querySelector('#error_screen');
    elem.innerHTML = msg;
    elem.style.display = 'block';
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
    document.querySelector('#results > tbody').innerHTML = '';
    console.log('Results cleared.');
}

function result_add(step, current, rule_num, rule) {
    let elem = document.querySelector('#results > tbody');
    elem.innerHTML = elem.innerHTML + `<tr><td>${step}</td><td>${current}</td><td>${rule_num}</td><td>${rule}</td></tr>\n`;
}

function result_debug(msg="") {
    let elem = document.querySelector('#results > tbody');
    elem.innerHTML = elem.innerHTML + `<tr><td>&nbsp;</td><td>${msg}</td><td>&nbsp;</td><td>&nbsp</td></tr>\n`;
}

function rules_string() {
    let string = '';
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
    let val = cm.getValue("\n");
    if (!val) return false;
    let lines = val.split("\n");

    if (!lines || !Array.isArray(lines)) return false;
    lines.forEach(function (line, index) {
        line = line.trim();
        if (!line) return;
        let rule = new Rule(line);
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

window.addEventListener('load', () => {
    results_clear();
    rule_set = CodeMirror.fromTextArea( document.getElementById("ruleset"), {
        lineNumbers: true,
        autoClearEmptyLines: true
    });
    rule_set.setSize(null, '200px');
    rule_set.setValue("@xy -> y@x\n@ -> ^.\n^ -> @");
    rule_set.on("blur", function(cm, change) {
        if (rules_validate(cm)) {
            let lines = rules_string();
            if (lines != cm.getValue("\n")) {
                cm.setValue(lines);
            }
        }
    });

    let execButton = document.getElementById('execute_eval');
    execButton.addEventListener('click', async (event) => {
        event.preventDefault();
        execButton.disabled = true;
        attempt_run();
        execButton.disabled = false;
    });

    document.getElementById('clear_results').addEventListener('click', async (event) => {
        results_clear();
    });

    function setStringInputValue(event) {
        let stringInput = document.getElementById('inputString');
        let val = stringInput?.value ?? '';
        let upper = val.toUpperCase();
        if (val === upper) return false;
        stringInput.value = upper;
    }
    let inputString = document.getElementById('inputString');
    inputString.addEventListener('keyup', setStringInputValue, false);
    inputString.addEventListener('blur', setStringInputValue, false);
    inputString.addEventListener('change', setStringInputValue, false);

    document.querySelector('#maxIterations').addEventListener('keypress', (event) => {
        // Only ASCII character in that range allowed
        let ASCIICode = (evt.which) ? evt.which : evt.keyCode
        if (ASCIICode > 31 && (ASCIICode < 48 || ASCIICode > 57))
            return false;
        return true;
    });
});
