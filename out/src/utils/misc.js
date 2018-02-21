"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("../types");
const astWalker_1 = require("./astWalker");
const BigNumber = require("bignumber.js");
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
function interperetValue(variableType, valueHexString) {
    let v = "";
    let num;
    switch (variableType) {
        case types_1.LibSdbTypes.VariableValueType.Boolean:
            v = valueHexString === "1" ? "true" : "false";
            break;
        case types_1.LibSdbTypes.VariableValueType.UnsignedInteger:
            num = new BigNumber("0x" + valueHexString);
            v = num.toString();
            break;
        case types_1.LibSdbTypes.VariableValueType.Integer:
            let isPositive = true;
            if (valueHexString.length === 64) {
                // could be 2s complement
                if (parseInt(valueHexString[0], 16) >= 8) {
                    // 2s complement
                    isPositive = false;
                    valueHexString = valueHexString.replace(/f/g, "1111").replace(/1/g, "2").replace(/0/g, "3").replace(/2/g, "0").replace(/3/, "1");
                }
            }
            num = new BigNumber((isPositive ? "" : "-") + "0x" + valueHexString);
            if (!isPositive) {
                num = num.minus(1);
            }
            v = num.toString();
            break;
        case types_1.LibSdbTypes.VariableValueType.FixedPoint:
            // not supported yet in Solidity (2/21/2018) per solidity.readthedocs.io
            break;
        case types_1.LibSdbTypes.VariableValueType.Address:
            v = '"' + valueHexString + '"';
            break;
        case types_1.LibSdbTypes.VariableValueType.FixedByteArray:
            const byteArrayStr = valueHexString.match(/.{2}/g);
            let byteArray;
            if (byteArrayStr !== null) {
                byteArray = byteArrayStr.map((val, idx) => {
                    return parseInt(val, 16);
                });
            }
            else {
                byteArray = [];
            }
            v = JSON.stringify(byteArray);
            break;
        case types_1.LibSdbTypes.VariableValueType.Enum:
            // TODO:
            break;
        case types_1.LibSdbTypes.VariableValueType.Function:
            // TODO:
            break;
        case types_1.LibSdbTypes.VariableValueType.None:
        default:
            v = "";
            break;
    }
    return v;
}
exports.interperetValue = interperetValue;
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
function applyVariableType(variable, stateVariable, storageLocation, parentName) {
    const varType = variable.originalType;
    if (stateVariable === true) {
        variable.location = types_1.LibSdbTypes.VariableLocation.Storage;
    }
    else {
        if (storageLocation === "default") {
            // look at the type to figure out where it goes
            // if value type
            let isReferenceType = false;
            isReferenceType = isReferenceType || varType.startsWith("struct"); // struct
            isReferenceType = isReferenceType || varType.includes("[") && varType.includes("]"); // array
            // TODO: mapping
            if (isReferenceType) {
                if (parentName === "ParameterList") {
                    variable.location = types_1.LibSdbTypes.VariableLocation.Memory;
                }
                else {
                    variable.location = types_1.LibSdbTypes.VariableLocation.Storage;
                }
            }
            else {
                // value type
                variable.location = types_1.LibSdbTypes.VariableLocation.Stack;
            }
        }
        else if (storageLocation === "storage") {
            variable.location = types_1.LibSdbTypes.VariableLocation.Storage;
        }
        else if (storageLocation === "memory") {
            variable.location = types_1.LibSdbTypes.VariableLocation.Memory;
        }
        else {
            // default to stack i guess, probably shouldnt get here though
            variable.location = types_1.LibSdbTypes.VariableLocation.Stack;
        }
    }
    if (varType.match(/bool/g)) {
        variable.type = types_1.LibSdbTypes.VariableValueType.Boolean;
    }
    else if (varType.match(/uint/g)) {
        variable.type = types_1.LibSdbTypes.VariableValueType.UnsignedInteger;
    }
    else if (varType.match(/.*(?:^|[^u])int.*/g)) {
        variable.type = types_1.LibSdbTypes.VariableValueType.Integer;
    }
    else if (varType.match(/address/g)) {
        variable.type = types_1.LibSdbTypes.VariableValueType.Address;
    }
    else if (varType.match(/(bytes)(([1-9]|[12][0-9]|3[0-2])\b)/g)) {
        variable.type = types_1.LibSdbTypes.VariableValueType.FixedByteArray;
    }
    // TODO: FixedPoint when its implemented in solidity
    // TODO: Enum
    // TODO: Function
    variable.refType = types_1.LibSdbTypes.VariableRefType.None;
    const arrayExpression = /\[([0-9]*)\]/g;
    const arrayMatch = arrayExpression.exec(varType);
    if (arrayMatch) {
        variable.refType = types_1.LibSdbTypes.VariableRefType.Array;
        variable.arrayIsDynamic = false; // TODO: support dynamic sized arrays
        variable.arrayLength = parseInt(arrayMatch[1]) || 0;
    }
}
exports.applyVariableType = applyVariableType;
//# sourceMappingURL=misc.js.map