const parseExpression = require("solidity-parser").parse;
const traverse = require("traverse");
const uuidv4 = require("uuid").v4;
const CircularJSON = require("circular-json");

import { LibSdbTypes } from "./types";
import { LibSdbUtils } from "./utils/utils";
import { LibSdbCompile } from "./compiler";
import { LibSdbRuntime } from "./runtime";
import { CompilerOutput, CompilerInput } from "solc";

/** Parse the error message thrown with a naive compile in order to determine the actual return type. This is the hacky alternative to parsing an AST. */
const regexpReturnError = /Return argument type (.*) is not implicitly convertible to expected type \(type of first return variable\) bool./
const matchReturnTypeFromError = message => message.match(regexpReturnError);

export class LibSdbEvaluator {
    private _runtime: LibSdbRuntime;

    constructor(runtime: LibSdbRuntime) {
        this._runtime = runtime;
    }

    private findArguments(frameId: number | undefined, expression: string): LibSdbTypes.Variable[] {
        let variables: LibSdbTypes.Variable[] = [];

        if (this._runtime._stepData !== null) {
            const result = parseExpression(expression, "solidity-expression");

            let identifiers = traverse(result.body).reduce((acc, x) => {
                if (typeof x === "object" && "type" in x && x.type === "Identifier") {
                    acc.push(x);
                }
                return acc;
            });
            identifiers.shift(); // TODO: remove root node?

            const contract = this._runtime._contractsByAddress.get(this._runtime._stepData.contractAddress)!;

            let allVariables: LibSdbTypes.VariableMap = new Map<string, LibSdbTypes.Variable>();
            for (let i = 0; i < this._runtime._stepData.scope.length; i++) {
                const scope = this._runtime._stepData.scope[i];
                const scopeVars = contract.scopeVariableMap.get(scope.id)!;
                const names = scopeVars.keys();
                for (const name of names) {
                    const variable = scopeVars.get(name);
                    if (variable && variable.position !== null) {
                        allVariables.set(name, variable);
                    }
                }
            }

            for (let i = 0; i < identifiers.length; i++) {
                if (allVariables.has(identifiers[i].name)) {
                    variables.push(allVariables.get(identifiers[i].name)!);
                }
                else {
                    // TODO: woah, we don't know that identifier/variable. error?
                }
            }
        }

        return variables;
    }

    private generateFunction(expression: string, args: LibSdbTypes.Variable[]): LibSdbTypes.ExpressionFunction {
        const functionName: string = "sdb_" + uuidv4().replace(/-/g, "");

        const argsString = args.map((arg) => {
            return arg.originalType.replace("storage", "").replace("memory", "") + " " + arg.name;
        }).join(",");

        const argsRefString = args.map((arg) => {
            return arg.name;
        }).join(",");

        const functionReference = functionName + "(" + argsRefString + ");";

        const functionCode: string =
            `
function ` + functionName + `(` + argsString + `) returns (bool) {
  return ` + expression + `
}

`;

        let expressionFunction = new LibSdbTypes.ExpressionFunction();
        expressionFunction.name = functionName;
        expressionFunction.reference = functionReference;
        expressionFunction.args = args;
        expressionFunction.argsString = argsString;
        expressionFunction.code = functionCode;

        return expressionFunction;
    }

    public async evaluate(expression: string, context: string | undefined, frameId: number | undefined, callback): Promise<void> {
        if (this._runtime._stepData === null || expression === undefined || context === undefined) {
            return;
        }

        if (context === "hover") {
            // TODO: implement this
            return;
        }

        if (this._runtime._ongoingEvaluation !== null) {
            // TODO: improve this
            return;
        }

        expression = expression + (expression.endsWith(';') ? '' : ';');
        let contract = this._runtime._contractsByAddress.get(this._runtime._stepData.contractAddress)!;
        let newContract: LibSdbTypes.Contract = contract.clone();
        let file = this._runtime._files.get(contract.sourcePath)!;
        let newFile: LibSdbTypes.File = file.clone();

        const functionArgs = this.findArguments(frameId, expression);
        const functionInsert = this.generateFunction(expression, functionArgs);

        let newLineOffsets = new Map<number, number>();
        file.lineOffsets.forEach((value: number, key: number) => {
            newLineOffsets.set(key, value);
        });

        let newBreakpoints: LibSdbTypes.Breakpoint[] = [];
        for (let i = 0; i < file.breakpoints.length; i++) {
            let copyValue = new LibSdbTypes.Breakpoint();
            copyValue.id = file.breakpoints[i].id;
            copyValue.line = file.breakpoints[i].line;
            copyValue.verified = file.breakpoints[i].verified;
            copyValue.visible = file.breakpoints[i].visible;
            newBreakpoints.push(copyValue);
        }

        let newCallstack: LibSdbTypes.StackFrame[] = [];
        for (let i = 0; i < this._runtime._callStack.length; i++) {
            let copyValue = new LibSdbTypes.StackFrame();
            copyValue.file = this._runtime._callStack[i].file;
            copyValue.line = this._runtime._callStack[i].line;
            copyValue.name = this._runtime._callStack[i].name;
            newCallstack.push(copyValue);
        }

        let newPriorUiCallstack: LibSdbTypes.StackFrame[] | null;
        if (this._runtime._priorUiCallStack === null) {
            newPriorUiCallstack = null;
        }
        else {
            newPriorUiCallstack = [];
            for (let i = 0; i < this._runtime._priorUiCallStack.length; i++) {
                let copyValue = new LibSdbTypes.StackFrame()
                copyValue.file = this._runtime._priorUiCallStack[i].file;
                copyValue.line = this._runtime._priorUiCallStack[i].line;
                copyValue.name = this._runtime._priorUiCallStack[i].name;
                newPriorUiCallstack.push(copyValue);
            }
        }

        if (this._runtime._stepData !== null && this._runtime._stepData.location !== null && this._runtime._stepData.location.start !== null) {
            const currentLine = this._runtime._stepData.location.start.line;
            if (currentLine > 0) {
                const insertPosition = newFile.lineBreaks[currentLine - 1] + 1;

                newFile.sourceCode = [newFile.sourceCode.slice(0, insertPosition), functionInsert.reference + "\n", newFile.sourceCode.slice(insertPosition)].join('');
                newFile.lineBreaks = LibSdbUtils.SourceMappingDecoder.getLinebreakPositions(newFile.sourceCode);

                // Adjust line numbers
                LibSdbUtils.addLineOffset(currentLine, 1, newLineOffsets);
                LibSdbUtils.adjustBreakpointLineNumbers(newBreakpoints, newContract.sourcePath, currentLine, 1);
                LibSdbUtils.adjustCallstackLineNumbers(newCallstack, newContract.sourcePath, currentLine, 1);
                if (newPriorUiCallstack !== null) {
                    LibSdbUtils.adjustCallstackLineNumbers(newPriorUiCallstack, newContract.sourcePath, currentLine, 1);
                }

                const contractDeclarationPosition = newFile.sourceCode.indexOf("contract " + contract.name);
                let functionInsertPosition: number | null = null;
                let functionInsertLine: number | null = null;
                for (let i = 0; i < newFile.lineBreaks.length; i++) {
                    if (newFile.lineBreaks[i] > contractDeclarationPosition) {
                        functionInsertLine = i + 1;
                        functionInsertPosition = newFile.lineBreaks[i] + 1;
                        break;
                    }
                }

                if (functionInsertPosition !== null && functionInsertLine !== null) {
                    newFile.sourceCode = [newFile.sourceCode.slice(0, functionInsertPosition), functionInsert.code, newFile.sourceCode.slice(functionInsertPosition)].join('');
                    newFile.lineBreaks = LibSdbUtils.SourceMappingDecoder.getLinebreakPositions(newFile.sourceCode);

                    // Adjust line numbers
                    const numNewLines = (functionInsert.code.match(/\n/g) || []).length;
                    LibSdbUtils.addLineOffset(functionInsertLine, numNewLines, newLineOffsets);
                    LibSdbUtils.adjustBreakpointLineNumbers(newBreakpoints, newContract.sourcePath, functionInsertLine, numNewLines);
                    LibSdbUtils.adjustCallstackLineNumbers(newCallstack, newContract.sourcePath, functionInsertLine, numNewLines);
                    if (newPriorUiCallstack !== null) {
                        LibSdbUtils.adjustCallstackLineNumbers(newPriorUiCallstack, newContract.sourcePath, functionInsertLine, numNewLines);
                    }

                    let compileInput: CompilerInput = {
                        language: "Solidity",
                        settings: {
                            optimizer: {
                                enabled: false
                            },
                            outputSelection: {
                                "*": {
                                    "*": [
                                        "abi",
                                        "evm.bytecode.object",
                                        "evm.deployedBytecode.object",
                                        "evm.deployedBytecode.sourceMap",
                                        "evm.methodIdentifiers"
                                    ],
                                    "": [ "legacyAST" ]
                                }
                            }
                        },
                        sources: {}
                    };
                    compileInput.sources[newFile.name] = { content: newFile.sourceCode };
                    let result: CompilerOutput = JSON.parse(LibSdbCompile.compile(JSON.stringify(compileInput)));
                    let returnTypeString: string = "bool";
                    if (result.errors !== undefined) {
                        for (let i = 0; i < result.errors.length; i++) {
                            const error = result.errors[i];
                            let match = matchReturnTypeFromError(error.message);
                            if (match) {
                                // return type
                                returnTypeString = match[1];
                                const refString = `function ` + functionInsert.name + `(` + functionInsert.argsString + `) returns (bool)`;
                                const repString = `function ` + functionInsert.name + `(` + functionInsert.argsString + `) returns (` + match[1] + `)`;
                                newFile.sourceCode = newFile.sourceCode.replace(refString, repString);
                                newFile.lineBreaks = LibSdbUtils.SourceMappingDecoder.getLinebreakPositions(newFile.sourceCode);
                                compileInput.sources[newFile.name] = { content: newFile.sourceCode };
                                result = JSON.parse(LibSdbCompile.compile(JSON.stringify(compileInput)));
                                break;
                            }
                        }
                    }

                    // TODO: stop and respond if there is a compiler error of sometype
                    let hadError = false;
                    if (result.errors !== undefined) {
                        for (let i = 0; i < result.errors.length; i++) {
                            // check to see if any errors are not warnings
                            if (result.errors[i].severity === "error") {
                                console.error(result.errors[i].formattedMessage || result.errors[i].message);
                                hadError = true;
                            }
                        }
                    }
                    if (hadError) {
                        callback();
                        return;
                    }

                    this._runtime._callStack = newCallstack;
                    this._runtime._priorUiCallStack = newPriorUiCallstack;

                    newFile.breakpoints = newBreakpoints;
                    newFile.lineOffsets = newLineOffsets;

                    this._runtime._files.set(newFile.fullPath(), newFile);
                    this._runtime._contractsByAddress.set(this._runtime._stepData.contractAddress, newContract);

                    LibSdbCompile.linkCompilerOutput(this._runtime._files, this._runtime._filesById, this._runtime._contractsByName, newFile.sourceRoot, result);
                    newContract = this._runtime._contractsByAddress.get(this._runtime._stepData.contractAddress)!;

                    const astWalker = new LibSdbUtils.AstWalker();

                    const codeOffset = functionInsert.code.length + functionInsert.reference.length + 1; // 1 is for the \n after the reference insertion

                    let sourceLocationEvalFunction = null;
                    astWalker.walk(newContract.ast, (node) => {
                        if (sourceLocationEvalFunction !== null) {
                            return false;
                        }

                        if (node.name === "FunctionCall") {
                            for (let i = 0; i < node.children.length; i++) {
                                if (node.children[i].attributes.value === functionInsert.name) {
                                    sourceLocationEvalFunction = LibSdbUtils.SourceMappingDecoder.sourceLocationFromAstNode(node);
                                    return true;
                                }
                            }
                        }

                        return true;
                    });

                    if (sourceLocationEvalFunction !== null) {
                        const newIndex = LibSdbUtils.SourceMappingDecoder.toIndex(sourceLocationEvalFunction, newContract.srcmapRuntime);
                        let newPc: number | null = null;
                        for (let map of newContract.pcMap) {
                            if (map[1] === newIndex) {
                                newPc = map[0];
                                break;
                            }
                        }

                        let newSourceLocation = CircularJSON.parse(CircularJSON.stringify(this._runtime._stepData.source));
                        newSourceLocation.start += codeOffset;
                        let newLine: number | null = null;
                        for (let i = 0; i < newFile.lineBreaks.length; i++) {
                            if (i === 0 && newSourceLocation.start < newFile.lineBreaks[i]) {
                                newLine = i;
                                break;
                            }
                            else if (i > 0 && newFile.lineBreaks[i - 1] < newSourceLocation.start && newSourceLocation.start < newFile.lineBreaks[i]) {
                                newLine = i;
                                break;
                            }
                        };

                        if (newLine !== null) {
                            this._runtime._breakpoints.setBreakpoint(newContract.sourcePath, newLine, false, false);
                        }
                        else {
                            // TODO: handles this better
                            console.log("ERROR: We could not find the line of after we're evaluating...but we're going to execute anyway? shrug");
                        }

                        this._runtime._ongoingEvaluation = new LibSdbTypes.Evaluation();
                        this._runtime._ongoingEvaluation.functionName = functionInsert.name;
                        this._runtime._ongoingEvaluation.callback = callback;
                        this._runtime._ongoingEvaluation.returnVariable.originalType = returnTypeString;
                        LibSdbUtils.applyVariableType(this._runtime._ongoingEvaluation.returnVariable, false, "default", "ParameterList");

                        // push the code
                        for (let i = 0; i < newContract.addresses.length; i++) {
                            await this._runtime.sendVariableDeclarations(newContract.addresses[i]);
                            await this._runtime.sendFunctionJumpDestinations(newContract.addresses[i]);
                        }
                        this._runtime.continue(false, "stopOnEvalBreakpoint");
                        const content = {
                            "type": "injectNewCode",
                            "address": this._runtime._stepData.contractAddress,
                            "code": newContract.runtimeBytecode,
                            "pc": newPc,
                            "stepId": this._runtime._stepData.debuggerMessageId
                        };
                        this._runtime._interface.requestContent(content);
                    }
                    else {
                        callback("Error: Couldn't find the sourceLocation of the evaluation function; that's weird.")
                    }
                }
            }
        }
    }
}