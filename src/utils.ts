import {
    SdbStepData,
    SdbBreakpoint,
    SdbStackFrame,
    SdbAstScope,
    SdbVariable,
    SdbExpressionFunction,
    SdbEvaluation,
    SdbContract,
    SdbFile,
    SdbVariableName,
    SdbVariableMap,
    SdbScopeVariableMap,
    SdbAst,
    SdbContractMap,
    SdbFileMap
} from "./types";

export const fileSeparator: string = /^win/.test(process.platform) ? "\\" : "/";

// bytecode is a hex string of the bytecode without the preceding '0x'
// methodId is the SHA3 hash of the ABI for this function
// returns the first occurence of the following bytecode sequence:
// DUP1, PUSH4 methodId, EQ, PUSH1 pc
// TODO: this could maybe not work depending on the different compiler optimization levels
export function GetFunctionProgramCount(bytecode, methodId) {
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

export function adjustBreakpointLineNumbers(breakpoints: SdbBreakpoint[], path: string, startLine: number, numLines: number): void {
    for (let i = 0; i < breakpoints.length; i++) {
        if (breakpoints[i].line >= startLine) {
            breakpoints[i].line += numLines;
        }
    }
};

export function adjustCallstackLineNumbers(callstack: SdbStackFrame[], path: string, startLine: number, numLines: number): void {
    for (let i = 0; i < callstack.length; i++) {
        if (callstack[i].file === path && callstack[i].line >= startLine) {
            callstack[i].line += numLines;
        }
    }
};

export function addLineOffset(line: number, numLines: number, lineOffsets: Map<number, number>) {
    const numPrevLines: number = lineOffsets.get(line) || 0;
    lineOffsets.set(line, numPrevLines + numLines);
}

// this is the line number in the original source using a modified/step data line number
export function getOriginalLine(newLine: number, lineOffsets: Map<number, number>): number {
    let originalLine = newLine;

    lineOffsets.forEach((numLines, line) => {
        if (newLine >= line) {
            originalLine -= numLines;
        }
    });

    return originalLine;
}

// this is the line number in the modified source using an original line number
export function getNewLine(originalLine: number, lineOffsets: Map<number, number>): number {
    let newLine = originalLine;

    lineOffsets.forEach((numLines, line) => {
        if (originalLine >= line) {
            newLine += numLines;
        }
    });

    return newLine;
}