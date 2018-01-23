
export class LibSdbEvaluate {
    private findArguments(frameId: number | undefined, expression: string): SdbVariable[] {
        let variables: SdbVariable[] = [];

        if (this._stepData !== null) {
            const result = parseExpression(expression, "solidity-expression");

            let identifiers = traverse(result.body).reduce((acc, x) => {
                if (typeof x === "object" && "type" in x && x.type === "Identifier") {
                    acc.push(x);
                }
                return acc;
            });
            identifiers.shift(); // TODO: remove root node?

            const contract = this._contractsByAddress.get(this._stepData.contractAddress)!;

            let allVariables: SdbVariableMap = new Map<string, SdbVariable>();
            for (let i = 0; i < this._stepData.scope.length; i++) {
                const scope = this._stepData.scope[i];
                const scopeVars = contract.scopeVariableMap.get(scope.id)!;
                const names = scopeVars.keys();
                for (const name of names) {
                    const variable = scopeVars.get(name);
                    if (variable && variable.stackPosition !== null) {
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

    private generateFunction(expression: string, args: SdbVariable[]): SdbExpressionFunction {
        const functionName: string = "sdb_" + uuidv4().replace(/-/g, "");

        const argsString = args.map((arg) => {
            return arg.type + " " + arg.name;
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

        let expressionFunction = new SdbExpressionFunction();
        expressionFunction.name = functionName;
        expressionFunction.reference = functionReference;
        expressionFunction.args = args;
        expressionFunction.argsString = argsString;
        expressionFunction.code = functionCode;

        return expressionFunction;
    }

    public evaluate(expression: string, context: string | undefined, frameId: number | undefined, callback) {
        if (this._stepData === null) {
            return;
        }

        if (context === "hover") {
            // TODO: implement this
            return;
        }

        if (this._ongoingEvaluation !== null) {
            // TODO: improve this
            return;
        }

        expression = expression + (expression.endsWith(';') ? '' : ';');
        let contract = this._contractsByAddress.get(this._stepData.contractAddress)!;
        let newContract: SdbContract = contract.clone();
        let file = this._files.get(contract.sourcePath)!;
        let newFile: SdbFile = file.clone();

        const functionArgs = this.findArguments(frameId, expression);
        const functionInsert = this.generateFunction(expression, functionArgs);

        let newLineOffsets = new Map<number, number>();
        file.lineOffsets.forEach((value: number, key: number) => {
            newLineOffsets.set(key, value);
        });

        let newBreakpoints: SdbBreakpoint[] = [];
        for (let i = 0; i < file.breakpoints.length; i++) {
            let copyValue = new SdbBreakpoint();
            copyValue.id = file.breakpoints[i].id;
            copyValue.line = file.breakpoints[i].line;
            copyValue.verified = file.breakpoints[i].verified;
            copyValue.visible = file.breakpoints[i].visible;
            newBreakpoints.push(copyValue);
        }

        let newCallstack: SdbStackFrame[] = [];
        for (let i = 0; i < this._callStack.length; i++) {
            let copyValue = new SdbStackFrame();
            copyValue.file = this._callStack[i].file;
            copyValue.line = this._callStack[i].line;
            copyValue.name = this._callStack[i].name;
            newCallstack.push(copyValue);
        }

        let newPriorUiCallstack: SdbStackFrame[] | null;
        if (this._priorUiCallStack === null) {
            newPriorUiCallstack = null;
        }
        else {
            newPriorUiCallstack = [];
            for (let i = 0; i < this._priorUiCallStack.length; i++) {
                let copyValue = new SdbStackFrame()
                copyValue.file = this._priorUiCallStack[i].file;
                copyValue.line = this._priorUiCallStack[i].line;
                copyValue.name = this._priorUiCallStack[i].name;
                newPriorUiCallstack.push(copyValue);
            }
        }

        if (this._stepData !== null && this._stepData.location !== null && this._stepData.location.start !== null) {
            const currentLine = this._stepData.location.start.line;
            if (currentLine > 0) {
                const insertPosition = newFile.lineBreaks[currentLine - 1] + 1;

                newFile.sourceCode = [newFile.sourceCode.slice(0, insertPosition), functionInsert.reference + "\n", newFile.sourceCode.slice(insertPosition)].join('');
                newFile.lineBreaks = sourceMappingDecoder.getLinebreakPositions(newFile.sourceCode);

                // Adjust line numbers
                this.addLineOffset(currentLine, 1, newLineOffsets);
                adjustBreakpointLineNumbers(newBreakpoints, newContract.sourcePath, currentLine, 1);
                adjustCallstackLineNumbers(newCallstack, newContract.sourcePath, currentLine, 1);
                if (newPriorUiCallstack !== null) {
                    adjustCallstackLineNumbers(newPriorUiCallstack, newContract.sourcePath, currentLine, 1);
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
                    newFile.lineBreaks = sourceMappingDecoder.getLinebreakPositions(newFile.sourceCode);

                    // Adjust line numbers
                    const numNewLines = (functionInsert.code.match(/\n/g) || []).length;
                    this.addLineOffset(functionInsertLine, numNewLines, newLineOffsets);
                    adjustBreakpointLineNumbers(newBreakpoints, newContract.sourcePath, functionInsertLine, numNewLines);
                    adjustCallstackLineNumbers(newCallstack, newContract.sourcePath, functionInsertLine, numNewLines);
                    if (newPriorUiCallstack !== null) {
                        adjustCallstackLineNumbers(newPriorUiCallstack, newContract.sourcePath, functionInsertLine, numNewLines);
                    }

                    const compileInput = { sources: {} };
                    compileInput.sources[newFile.fullPath()] = newFile.sourceCode;
                    let result = compile(compileInput, 0);
                    for (let i = 0; i < result.errors.length; i++) {
                        const error = result.errors[i];
                        let match = matchReturnTypeFromError(error);
                        if (match) {
                            // return type
                            const refString = `function ` + functionInsert.name + `(` + functionInsert.argsString + `) returns (bool)`;
                            const repString = `function ` + functionInsert.name + `(` + functionInsert.argsString + `) returns (` + match[1] + `)`;
                            newFile.sourceCode = newFile.sourceCode.replace(refString, repString);
                            newFile.lineBreaks = sourceMappingDecoder.getLinebreakPositions(newFile.sourceCode);
                            compileInput.sources[newFile.fullPath()] = newFile.sourceCode;
                            result = compile(compileInput, 0);
                        }
                        else {

                        }
                    }

                    // TODO: stop and respond if there is a compiler error of sometype

                    result.contractMap = {};
                    this._contractsByAddress.forEach((contract, address) => {
                        result.contractMap[address] = contract.sourcePath + ":" + contract.name;
                    });

                    this._callStack = newCallstack;
                    this._priorUiCallStack = newPriorUiCallstack;

                    newFile.breakpoints = newBreakpoints;
                    newFile.lineOffsets = newLineOffsets;

                    this._files.set(newFile.fullPath(), newFile);
                    this._contractsByAddress.set(this._stepData.contractAddress, newContract);

                    this.applyCompilationResult(result);

                    const astWalker = new util.AstWalker();

                    const codeOffset = functionInsert.code.length + functionInsert.reference.length + 1; // 1 is for the \n after the reference insertion

                    let sourceLocationEvalFunction = null;
                    astWalker.walk(this._contractsByAddress.get(this._stepData.contractAddress)!.ast, (node) => {
                        if (sourceLocationEvalFunction !== null) {
                            return false;
                        }

                        if (node.name === "FunctionCall") {
                            for (let i = 0; i < node.children.length; i++) {
                                if (node.children[i].attributes.value === functionInsert.name) {
                                    sourceLocationEvalFunction = sourceMappingDecoder.sourceLocationFromAstNode(node);
                                    return true;
                                }
                            }
                        }

                        return true;
                    });

                    const newIndex = sourceMappingDecoder.toIndex(sourceLocationEvalFunction, newContract.srcmapRuntime);
                    let newPc: number | null = null;
                    for (let map of newContract.pcMap) {
                        if (map[1] === newIndex) {
                            newPc = map[0];
                            break;
                        }
                    }

                    let newSourceLocation = CircularJSON.parse(CircularJSON.stringify(this._stepData.source));
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
                        this.setBreakPoint(newContract.sourcePath, newLine, false, false);
                    }
                    else {
                        // TODO: handles this better
                        console.log("ERROR: We could not find the line of after we're evaluating...but we're going to execute anyway? shrug");
                    }

                    this._ongoingEvaluation = new SdbEvaluation();
                    this._ongoingEvaluation.functionName = functionInsert.name;
                    this._ongoingEvaluation.callback = callback;

                    // push the code
                    const content = {
                        "type": "putCodeRequest",
                        "address": this._stepData.contractAddress,
                        "code": newContract.runtimeBytecode,
                        "pc": newPc
                    };
                    this.run(false, undefined, content);
                }
            }
        }
    }
}