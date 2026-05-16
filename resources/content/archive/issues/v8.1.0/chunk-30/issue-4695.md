---
id: 4695
title: 'reg: update Validate  function'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-08-10T13:39:33Z'
updatedAt: '2023-08-11T12:35:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4695'
author: subramaniyamP
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-11T12:35:27Z'
---
# reg: update Validate  function

**Is your feature request related to a problem? Please describe.**
A clear and concise description of what the problem is. Ex. I'm always frustrated when [...]

**Describe the solution you'd like**
A clear and concise description of what you want to happen.

**Describe alternatives you've considered**
A clear and concise description of any alternative solutions or features you've considered.



**Additional context**
Add any other context or screenshots about the feature request here.


im not able to push my changes into both dev ND  main branch's.


node_modules/neo.mjs/src/form/field/Text.mjs

Can you update the below code as per our discussion.

    /**
     * Checks for client-side field errors
     * @param {Boolean} silent=true
     * @returns {Boolean} Returns true in case there are no client-side errors
     */
    validate(silent=true) {
        let me           = this,
            maxLength    = me.maxLength,
            minLength    = me.minLength,
            required     = me.required,
            returnValue  = true,
            value        = me.value,
            valueLength  = value?.toString().length,
            inputPattern = me.inputPattern,
            isEmpty      = value !== 0 && (!value || valueLength < 1),
            errorParam   = {inputPattern, maxLength, minLength, valueLength},
            errorText;

        if (!silent) {
            // in case we manually call validate(false) on a form or field before it is mounted, we do want to see errors.
            me.clean = false;
        }


        if (isEmpty) {
            if (required) {
                me._error = me.errorTextRequired;
                returnValue = false;
            }
        } else {
            if (Neo.isNumber(maxLength) && valueLength > maxLength) {
                me._error = me.errorTextMaxLength(errorParam);
                returnValue = false;
            } else if (Neo.isNumber(minLength) && valueLength < minLength) {
                me._error = me.errorTextMinLength(errorParam);
                returnValue = false;
            } else if (inputPattern && !inputPattern.test(value)) {
                me._error = me.errorTextInputPattern(errorParam);
                returnValue = false;
            } else {
                if (Neo.isFunction(me.validator)) {
                    errorText = me.validator(me);

                    if (errorText !== true) {
                        me._error = errorText;
                        returnValue = false;
                    }
                }
            }
        }

        if (returnValue) {
            me._error = null;
        }

        !me.clean && me.updateError(me._error, silent);

        return !returnValue ? false : super.validate(silent)
    }
 

 

## Timeline

- 2023-08-10T13:39:33Z @subramaniyamP added the `enhancement` label
- 2023-08-10T13:39:51Z @subramaniyamP changed title from **reg: updated Validator ** to **reg: update Validator function**
- 2023-08-10T13:40:05Z @subramaniyamP changed title from **reg: update Validator function** to **reg: update Validate  function**
### @tobiu - 2023-08-11T12:35:15Z

resolved.

- 2023-08-11T12:35:27Z @tobiu closed this issue

