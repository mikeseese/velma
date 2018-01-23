import { readFileSync } from "fs";
import { util, code } from "/home/mike/projects/remix/src/index";
import { normalize as normalizePath } from "path";

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

import {
    fileSeparator,
    GetFunctionProgramCount,
    adjustBreakpointLineNumbers,
    adjustCallstackLineNumbers
} from "./utils";

const sourceMappingDecoder = new util.SourceMappingDecoder();

export function linkCompilerOutput(_files: SdbFileMap, _contractsByName: SdbContractMap, _contractsByAddress: SdbContractMap, compilationResult: any) {
    let contractNameMap = new Map<string, SdbContract>();
    const astWalker = new util.AstWalker();

    /* -------- Go through contracts JSON -------- */
    const contracts = compilationResult.contracts;
    const contractKeys = Object.keys(contracts);
    for (let i = 0; i < contractKeys.length; i++) {
        const key = contractKeys[i];
        const contract = contracts[key];
        let contractPath = key.split(":");
        const sourcePath = normalizePath(contractPath[0]);
        if (sourcePath !== null) {
            if (!_files.has(sourcePath)) {
                _files.set(sourcePath, new SdbFile(sourcePath));
            }

            let file = _files.get(sourcePath)!;

            if (!file.sourceCode) {
                file.sourceCode = readFileSync(sourcePath, "utf8");
                file.lineBreaks = sourceMappingDecoder.getLinebreakPositions(file.sourceCode);
            }

            let priorContractIndex: number | null = null;
            file.contracts.forEach((contract, j) => {
                if (contract.name === contractPath[1]) {
                    priorContractIndex = j;
                }
            });

            let sdbContract: SdbContract;
            if (priorContractIndex === null) {
                sdbContract = new SdbContract();
            }
            else {
                sdbContract = file.contracts[priorContractIndex];
            }

            sdbContract.name = contractPath[1];
            sdbContract.sourcePath = sourcePath;

            const pcMap = code.util.nameOpCodes(new Buffer(contract.runtimeBytecode, 'hex'))[1];
            Object.keys(pcMap).forEach((pc) => {
                sdbContract.pcMap.set(parseInt(pc), pcMap[pc]);
            });

            Object.keys(contract.functionHashes).forEach((functionName) => {
                const pc = GetFunctionProgramCount(contract.runtimeBytecode, contract.functionHashes[functionName]);
                if (pc !== null) {
                    sdbContract.functionNames.set(pc, functionName);
                }
            });

            sdbContract.bytecode = contract.bytecode;
            sdbContract.runtimeBytecode = contract.runtimeBytecode;
            sdbContract.srcmapRuntime = contract.srcmapRuntime;

            contractNameMap.set(key, sdbContract);

            if (priorContractIndex === null) {
                file.contracts.push(sdbContract);
            }
        }
    };

    /* -------- Go through contracts AST -------- */
    const keys = Object.keys(compilationResult.sources);
    for (let i = 0; i < keys.length; i++) {
        const source = keys[i];
        const sourcePath = normalizePath(source);
        const file = _files.get(sourcePath);

        if (file) {
            // assign AST from the compilationResult.sources variable to each SdbFile
            file.ast = compilationResult.sources[source].AST;

            // split SdbFile AST to the contract levels
            astWalker.walk(file.ast, (node) => {
                if (node.name === "ContractDefinition") {
                    const contractKey = normalizePath(file.fullPath() + ":" + node.attributes.name);
                    if (contractNameMap.has(contractKey)) {
                        const contract = contractNameMap.get(contractKey)!;
                        contract.ast = JSON.parse(JSON.stringify(node));

                        let newScopeVariableMap = new Map<number, SdbVariableMap>();
                        astWalker.walkDetail(contract.ast, null, 0, (node, parent, depth) => {
                            if (node.id) {
                                // this is a new scope, add to map
                                newScopeVariableMap.set(node.id, new Map<string, SdbVariable>());

                                if (node.name === "VariableDeclaration") {
                                    let childIndex: number | null = null;
                                    if (parent) {
                                        // look for the child in the parent to get the index
                                        for (let i = 0; i < parent.children.length; i++) {
                                            if (parent.children[i].id === node.id) {
                                                childIndex = i;
                                            }
                                        }
                                    }

                                    // try to find the variable in our prior variable to get the stack position (which shouldn't have changed)
                                    let stackPosition: number | null = null;
                                    contract.scopeVariableMap.forEach((variables, scopeId) => {
                                        const variable = variables.get(node.attributes.name);
                                        if (variable && variable.scope.depth === depth) {
                                            stackPosition = variable.stackPosition;
                                        }
                                    });

                                    let variable = new SdbVariable();
                                    variable.name = node.attributes.name;
                                    variable.type = node.attributes.type;
                                    variable.scope = new SdbAstScope();
                                    variable.scope.id = node.attributes.scope;
                                    variable.scope.childIndex = childIndex;
                                    variable.scope.depth = depth;
                                    variable.stackPosition = stackPosition;

                                    // add the variable to the parent's scope
                                    newScopeVariableMap.get(variable.scope.id)!.set(variable.name, variable);
                                }
                            }

                            return true;
                        });
                        contract.scopeVariableMap = newScopeVariableMap;
                    }

                    return false;
                }

                return true;
            });
        }
    };

    // get variable declarations for each SdbContract AST
    contractNameMap.forEach((contract, key) => {
        if (_contractsByName.has(key)) {
            contract.address = _contractsByName.get(key)!.address;
            _contractsByAddress.set(contract.address, contract);
        }
        _contractsByName.set(key, contract);
    });
}

export function linkContractAddress(_contractsByName: SdbContractMap, _contractsByAddress: SdbContractMap, name: string, address: string) {
    if (_contractsByName.has(name)) {
        const contract = _contractsByName.get(name)!;
        contract.address = address;
        _contractsByAddress.set(address, contract);
    }
}