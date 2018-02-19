"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("../types");
const astWalker_1 = require("./astWalker");
exports.fileSeparator = /^win/.test(process.platform) ? "\\" : "/";
// bytecode is a hex string of the bytecode without the preceding '0x'
// methodId is the SHA3 hash of the ABI for this function
// returns the first occurence of the following bytecode sequence:
// DUP1, PUSH4 methodId, EQ, PUSH1 pc
// TODO: this could maybe not work depending on the different compiler optimization levels
function GetFunctionProgramCount(bytecode, methodId) {
    const bytecodeSequence = "63" + methodId + "1460";
    const pos = bytecode.indexOf(bytecodeSequence);
    if (pos < 0) {
        return null;
    }
    else {
        const pc = bytecode[pos + bytecodeSequence.length] + bytecode[pos + bytecodeSequence.length + 1];
        return parseInt(pc, 16);
    }
}
exports.GetFunctionProgramCount = GetFunctionProgramCount;
function adjustBreakpointLineNumbers(breakpoints, path, startLine, numLines) {
    for (let i = 0; i < breakpoints.length; i++) {
        if (breakpoints[i].line >= startLine) {
            breakpoints[i].line += numLines;
        }
    }
}
exports.adjustBreakpointLineNumbers = adjustBreakpointLineNumbers;
;
function adjustCallstackLineNumbers(callstack, path, startLine, numLines) {
    for (let i = 0; i < callstack.length; i++) {
        if (callstack[i].file === path && callstack[i].line >= startLine) {
            callstack[i].line += numLines;
        }
    }
}
exports.adjustCallstackLineNumbers = adjustCallstackLineNumbers;
;
function addLineOffset(line, numLines, lineOffsets) {
    const numPrevLines = lineOffsets.get(line) || 0;
    lineOffsets.set(line, numPrevLines + numLines);
}
exports.addLineOffset = addLineOffset;
// this is the line number in the original source using a modified/step data line number
function getOriginalLine(newLine, lineOffsets) {
    let originalLine = newLine;
    lineOffsets.forEach((numLines, line) => {
        if (newLine >= line) {
            originalLine -= numLines;
        }
    });
    return originalLine;
}
exports.getOriginalLine = getOriginalLine;
// this is the line number in the modified source using an original line number
function getNewLine(originalLine, lineOffsets) {
    let newLine = originalLine;
    lineOffsets.forEach((numLines, line) => {
        if (originalLine >= line) {
            newLine += numLines;
        }
    });
    return newLine;
}
exports.getNewLine = getNewLine;
function findScope(index, ast) {
    let scope = [];
    const astWalker = new astWalker_1.AstWalker();
    astWalker.walkDetail(ast, null, 0, (node, parent, depth) => {
        const src = node.src.split(":").map((s) => { return parseInt(s); });
        if (src.length >= 2 && src[0] <= index && index <= src[0] + src[1]) {
            let childIndex = null;
            if (parent) {
                // look for the child in the parent to get the index
                for (let i = 0; i < parent.children.length; i++) {
                    if (parent.children[i].id === node.id) {
                        childIndex = i;
                    }
                }
            }
            let astScope = new types_1.LibSdbTypes.AstScope();
            astScope.id = node.id;
            astScope.childIndex = childIndex;
            astScope.depth = depth;
            scope.unshift(astScope);
            return true;
        }
        else {
            return false;
        }
    });
    return scope;
}
exports.findScope = findScope;
/*
   Binary Search:
   Assumes that @arg array is sorted increasingly
   return largest i such that array[i] <= target; return -1 if array[0] > target || array is empty
 */
function findLowerBound(target, array) {
    let start = 0;
    let length = array.length;
    while (length > 0) {
        let half = length >> 1; // tslint:disable-line no-bitwise
        let middle = start + half;
        if (array[middle] <= target) {
            length = length - 1 - half;
            start = middle + 1;
        }
        else {
            length = half;
        }
    }
    return start - 1;
}
exports.findLowerBound = findLowerBound;
//# sourceMappingURL=misc.js.map