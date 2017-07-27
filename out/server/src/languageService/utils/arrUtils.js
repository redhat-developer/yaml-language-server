"use strict";
function removeDuplicates(arr, prop) {
    var new_arr = [];
    var lookup = {};
    for (var i in arr) {
        lookup[arr[i][prop]] = arr[i];
    }
    for (i in lookup) {
        new_arr.push(lookup[i]);
    }
    return new_arr;
}
exports.removeDuplicates = removeDuplicates;
function getLineOffsets(textDocString) {
    let lineOffsets = [];
    let text = textDocString;
    let isLineStart = true;
    for (let i = 0; i < text.length; i++) {
        if (isLineStart) {
            lineOffsets.push(i);
            isLineStart = false;
        }
        let ch = text.charAt(i);
        isLineStart = (ch === '\r' || ch === '\n');
        if (ch === '\r' && i + 1 < text.length && text.charAt(i + 1) === '\n') {
            i++;
        }
    }
    if (isLineStart && text.length > 0) {
        lineOffsets.push(text.length);
    }
    return lineOffsets;
}
exports.getLineOffsets = getLineOffsets;
//# sourceMappingURL=arrUtils.js.map