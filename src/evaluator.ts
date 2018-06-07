const parseExpression = require("solidity-parser").parse;
const traverse = require("traverse");
const uuidv4 = require("uuid").v4;

import { LibSdbTypes } from "./types/types";
import { LibSdbUtils } from "./utils/utils";
import { LibSdbRuntime } from "./runtime";
import { CompilerOutput, CompilerInput, compileStandardWrapper } from "solc";
import { readFileSync } from "fs";
import { join as joinPath } from "path";
import { ContractProcessor } from "./compilation/contractProcessor";
import { LibSdbCompilationProcessor } from "./compilation/processor";
//import { Variable } from "./types/barrel";

/** Parse the error message thrown with a naive compile in order to determine the actual return type. This is the hacky alternative to parsing an AST. */
const regexpReturnError = /Return argument type (.*) is not implicitly convertible to expected type \(type of first return variable\) bool./
const matchReturnTypeFromError = message => message.match(regexpReturnError);

export class LibSdbEvaluator {
    private _runtime: LibSdbRuntime;

    constructor() {
        this._runtime = LibSdbRuntime.instance();
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
                if (contract.scopeVariableMap.has(scope.id)) {
                    const scopeVars = contract.scopeVariableMap.get(scope.id)!;
                    const names = scopeVars.keys();
                    for (const name of names) {
                        const variable = scopeVars.get(name);
                        if (variable && variable.position !== null) {
                            allVariables.set(name, variable);
                        }
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

    public generateCompilerInputSourcesForContract(contract: LibSdbTypes.Contract): CompilerInput["sources"] {
        let result: CompilerInput["sources"] = {};
        const file = this._runtime._files.get(contract.sourcePath)!;

        const setImports = (file: LibSdbTypes.File) => {
            if (file.relativePath() in result) {
                return;
            }
            result[file.relativePath()] = { content: file.sourceCode }; // TODO: use original source?

            const expression = /import[\s]*['"](.*)['"]/g;
            let match: RegExpExecArray | null;
            while((match = expression.exec(file.sourceCode)) !== null) { // TODO: use original source?
                if (match.length > 1) {
                    const relativeFilePath = match[1];
                    const absoluteFilePath = joinPath(file.sourceRoot, relativeFilePath);
                    let nextFile: LibSdbTypes.File;
                    if (this._runtime._files.has(absoluteFilePath)) {
                        nextFile = this._runtime._files.get(absoluteFilePath)!;
                    }
                    else {
                        nextFile = new LibSdbTypes.File(file.sourceRoot, relativeFilePath);
                        nextFile.sourceCodeOriginal = readFileSync(absoluteFilePath, "utf8");
                        nextFile.sourceCode = nextFile.sourceCodeOriginal;
                        nextFile.lineBreaks = LibSdbUtils.SourceMappingDecoder.getLinebreakPositions(nextFile.sourceCode);
                    }
                    setImports(nextFile);
                }
            }
        };

        setImports(file);

        return result;
    }

    public async evaluate(expression: string, context: string | undefined, frameId: number | undefined, callback): Promise<void> {
        if (this._runtime._stepData === null || expression === undefined || context === undefined) {
            return;
        }

        if (context === "hover") {
            // TODO: implement this
            return;
        }

        expression = expression + (expression.endsWith(';') ? '' : ';');
        let contract = this._runtime._contractsByAddress.get(this._runtime._stepData.contractAddress)!;
        let file = this._runtime._files.get(contract.sourcePath)!;
        let newFile: LibSdbTypes.File = file.clone();

        const functionArgs = this.findArguments(frameId, expression);
        const functionInsert = this.generateFunction(expression, functionArgs);

        if (this._runtime._stepData !== null && this._runtime._stepData.location !== null && this._runtime._stepData.location.start !== null) {
            const currentLine = this._runtime._stepData.location.start.line;
            if (currentLine > 0) {
                const insertPosition = newFile.lineBreaks[currentLine - 1] + 1;

                newFile.sourceCode = [newFile.sourceCode.slice(0, insertPosition), functionInsert.reference + "\n", newFile.sourceCode.slice(insertPosition)].join('');
                newFile.lineBreaks = LibSdbUtils.SourceMappingDecoder.getLinebreakPositions(newFile.sourceCode);

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

                    compileInput.sources = this.generateCompilerInputSourcesForContract(contract);
                    compileInput.sources[newFile.relativePath()] = { content: newFile.sourceCode };

                    let result: CompilerOutput = JSON.parse(compileStandardWrapper(JSON.stringify(compileInput)));

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
                                compileInput.sources[newFile.relativePath()] = { content: newFile.sourceCode };
                                result = JSON.parse(compileStandardWrapper(JSON.stringify(compileInput)));
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

                    const evaluationBytecode = result.contracts[newFile.relativePath()][contract.name].evm.deployedBytecode!;
                    const evaluationAst = result.sources ? result.sources[newFile.relativePath()].legacyAST : {}; // TODO: ?
                    const newPcMap = LibSdbUtils.nameOpCodes(new Buffer(evaluationBytecode.object, 'hex'));

                    const astWalker = new LibSdbUtils.AstWalker();

                    let sourceLocationEvalFunction: LibSdbUtils.SourceMappingDecoder.SourceLocation | null = null;
                    astWalker.walk(evaluationAst, (node) => {
                        if (sourceLocationEvalFunction !== null) {
                            return false;
                        }

                        if (node.name === "FunctionCall") {
                            for (let i = 0; i < node.children.length; i++) {
                                if (node.children[i].attributes.value === functionInsert.name) {
                                    sourceLocationEvalFunction = LibSdbUtils.SourceMappingDecoder.sourceLocationFromAstNode(node);
                                    astWalker.walk(node, (node) => {
                                        if (node.name === "ParameterList") {
                                            return false;
                                        }
                                    });
                                    return true;
                                }
                            }
                        }

                        return true;
                    });

                    if (sourceLocationEvalFunction !== null) {
                        const newIndex = LibSdbUtils.SourceMappingDecoder.toIndex(sourceLocationEvalFunction!, evaluationBytecode.sourceMap!);
                        let newStartPc: number | null = null;
                        let newEndPc: number | null = null;
                        for (let map of newPcMap) {
                            if (map[1].index === newIndex) {
                                newStartPc = map[0];
                            }

                            if (map[1].opcode.name === "JUMPDEST" && (newEndPc === null || map[0] > newEndPc!)) {
                                const sourceLocation = LibSdbUtils.SourceMappingDecoder.atIndex(map[1].index, evaluationBytecode.sourceMap!);
                                if (sourceLocationEvalFunction!.start <= sourceLocation.start && (sourceLocation.start + sourceLocation.length) <= (sourceLocationEvalFunction!.start + sourceLocationEvalFunction!.length)) {
                                    newEndPc = map[0];
                                }
                            }
                        }

                        // find last jumpdest thats within the source location

                        let ongoingEvaluation = new LibSdbTypes.Evaluation();
                        ongoingEvaluation.functionName = functionInsert.name;
                        ongoingEvaluation.returnVariable.originalType = returnTypeString;
                        // TODO: handle referenceVars in result?
                        const compilationProcessor = new LibSdbCompilationProcessor();
                        const contractProcessor = new ContractProcessor(compilationProcessor, contract);
                        ongoingEvaluation.returnVariable.applyType("default", "ParameterList", contractProcessor);
                        ongoingEvaluation.contractAddress = this._runtime._stepData.contractAddress;

                        //this._runtime.continue(false, "stopOnEvalBreakpoint");
                        if (newStartPc !== null && newEndPc !== null) {
                            const evalRequest = new LibSdbTypes.EvaluationRequest(evaluationBytecode.object, newStartPc, newEndPc, contract.runtimeBytecode.code, this._runtime._stepData.vmData.pc);
                            const vmData = await this._runtime._interface.requestEvaluation(evalRequest);

                            ongoingEvaluation.returnVariable.position = vmData.stack.length - 1;
        
                            let returnValue;
                            if (ongoingEvaluation.returnVariable.detail === null) {
                                returnValue = null;
                            }
                            else {
                                returnValue = await ongoingEvaluation.returnVariable.detail.decode(vmData.stack, vmData.memory, this._runtime._interface, ongoingEvaluation.contractAddress);
                            }
                            callback(returnValue);
                        }
                    }
                    else {
                        callback("Error: Couldn't find the sourceLocation of the evaluation function; that's weird.")
                    }
                }
            }
        }
    }
}