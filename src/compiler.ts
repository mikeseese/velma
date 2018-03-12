import { readFileSync } from "fs";
import { join as joinPath, dirname } from "path";
import { compileStandardWrapper as solcCompile, CompilerOutput } from "solc";

import { LibSdbTypes } from "./types/types";
import { LibSdbUtils } from "./utils/utils";

export namespace LibSdbCompile {
    export const compile = solcCompile;

    export function linkCompilerOutput(_files: LibSdbTypes.FileMap, _filesById: LibSdbTypes.FileByIdMap, _contractsByName: LibSdbTypes.ContractMap, sourceRootPath: string, compilationResult: CompilerOutput): boolean {
        if (compilationResult.sources === undefined) {
            // cant do anything if we don't get the right data, this is invalid
            return false;
        }

        let contractNameMap = new Map<string, LibSdbTypes.Contract>();
        const astWalker = new LibSdbUtils.AstWalker();

        /* -------- Go through contracts JSON -------- */
        const contracts = compilationResult.contracts;
        const fileKeys = Object.keys(contracts);
        for (let i = 0; i < fileKeys.length; i++) {
            const absoluteSourcePath = joinPath(sourceRootPath, fileKeys[i]);
            const relativeSourcePath = fileKeys[i];
            const contractKeys = Object.keys(contracts[relativeSourcePath]);
            for (let j = 0; j < contractKeys.length; j++) {
                const contractName = contractKeys[j];
                const contract = contracts[relativeSourcePath][contractName];
                if (contract.evm.deployedBytecode === undefined || contract.evm.deployedBytecode.sourceMap === undefined) {
                    // cant do anything if we don't get the right data, just ignore this
                    continue;
                }
                if (absoluteSourcePath !== null) {
                    if (!_files.has(absoluteSourcePath)) {
                        _files.set(absoluteSourcePath, new LibSdbTypes.File(sourceRootPath, relativeSourcePath));
                    }

                    let file = _files.get(absoluteSourcePath)!;

                    // force correct source root; if breakpoints are set earlier, the source root
                    //   may have been defaulted to '/'
                    file.sourceRoot = sourceRootPath;
                    file.relativeDirectory = dirname(relativeSourcePath);

                    if (!file.sourceCodeOriginal) {
                        file.sourceCodeOriginal = readFileSync(absoluteSourcePath, "utf8");
                        file.sourceCode = file.sourceCodeOriginal;
                        file.lineBreaks = LibSdbUtils.SourceMappingDecoder.getLinebreakPositions(file.sourceCode);
                    }

                    let priorContractIndex: number | null = null;
                    file.contracts.forEach((contract, j) => {
                        if (contract.name === contractName) {
                            priorContractIndex = j;
                        }
                    });

                    let sdbContract: LibSdbTypes.Contract;
                    if (priorContractIndex === null) {
                        sdbContract = new LibSdbTypes.Contract();
                    }
                    else {
                        sdbContract = file.contracts[priorContractIndex];
                    }

                    sdbContract.name = contractName;
                    sdbContract.sourcePath = absoluteSourcePath;

                    const pcMap = LibSdbUtils.nameOpCodes(new Buffer(contract.evm.deployedBytecode.object, 'hex'))[1];
                    sdbContract.pcMap.clear();
                    Object.keys(pcMap).forEach((pc) => {
                        sdbContract.pcMap.set(parseInt(pc), pcMap[pc]);
                    });

                    if (contract.evm.methodIdentifiers !== undefined) {
                        sdbContract.functionNames.clear();
                        Object.keys(contract.evm.methodIdentifiers).forEach((functionName) => {
                            const pc = LibSdbUtils.GetFunctionProgramCount(contract.evm.deployedBytecode!.object, contract.evm.methodIdentifiers![functionName]);
                            if (pc !== null) {
                                sdbContract.functionNames.set(pc, functionName);
                            }
                        });
                    }

                    sdbContract.bytecode = contract.evm.bytecode.object;
                    sdbContract.runtimeBytecode = contract.evm.deployedBytecode.object;
                    sdbContract.srcmapRuntime = contract.evm.deployedBytecode.sourceMap;

                    contractNameMap.set(contractName, sdbContract);

                    if (priorContractIndex === null) {
                        file.contracts.push(sdbContract);
                    }
                }
            }
        };

        /* -------- Go through contracts AST -------- */
        const keys = Object.keys(compilationResult.sources);
        for (let i = 0; i < keys.length; i++) {
            const source = keys[i];
            const sourcePath = joinPath(sourceRootPath, source);
            const file = _files.get(sourcePath);

            if (file) {
                file.sourceId = compilationResult.sources[source].id;
                _filesById.set(file.sourceId, file);

                // assign AST from the compilationResult.sources variable to each SdbFile
                file.ast = compilationResult.sources[source].legacyAST;

                // split SdbFile AST to the contract levels
                astWalker.walk(file.ast, (node) => {
                    if (node.name === "ContractDefinition") {
                        const contractKey = node.attributes.name;
                        if (contractNameMap.has(contractKey)) {
                            const contract = contractNameMap.get(contractKey)!;
                            contract.ast = JSON.parse(JSON.stringify(node));

                            let newScopeVariableMap = new Map<number, LibSdbTypes.VariableMap>();
                            astWalker.walkDetail(contract.ast, null, 0, (node, parent, depth) => {
                                if (node.id) {
                                    // this is a new scope, add to map
                                    newScopeVariableMap.set(node.id, new Map<string, LibSdbTypes.Variable>());
                                }

                                if (node.name === "FunctionDefinition") {
                                    const functionName = node.attributes.name;
                                    astWalker.walkDetail(node, null, 0, (node, parent, depth) => {
                                        if (node.id) {
                                            // this is a new scope, add to map
                                            newScopeVariableMap.set(node.id, new Map<string, LibSdbTypes.Variable>());
    
                                            if (node.name === "VariableDeclaration") {
                                                const variable = createVariableFromAst(node, parent, depth, functionName, contract);
                                                // add the variable to the parent's scope
                                                newScopeVariableMap.get(variable.scope.id)!.set(variable.name, variable);
                                            }
                                        }
    
                                        return true;
                                    });

                                    // let's not go further into the function
                                    return false;
                                }
                                else if (node.name === "VariableDeclaration") {
                                    // this is outside of a function (i.e. state variables)
                                    const variable = createVariableFromAst(node, parent, depth, null, contract);
                                    // add the variable to the parent's scope
                                    newScopeVariableMap.get(variable.scope.id)!.set(variable.name, variable);
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

        // save temporary map to official map
        contractNameMap.forEach((contract, key) => {
            _contractsByName.set(key, contract);
        });

        return true;
    }

    function createVariableFromAst(node: any, parent: any, depth: number, functionName: string | null, contract: LibSdbTypes.Contract): LibSdbTypes.Variable {
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
        let position: number | null = null;
        contract.scopeVariableMap.forEach((variables, scopeId) => {
            const variable = variables.get(node.attributes.name);
            if (variable && variable.scope.depth === depth && variable.functionName === functionName) {
                position = variable.position;
            }
        });

        let variable = new LibSdbTypes.Variable();
        const varType: string = node.attributes.type || "";
        variable.name = node.attributes.name;
        variable.functionName = functionName;
        variable.originalType = varType;
        variable.scope = new LibSdbTypes.AstScope();
        variable.scope.id = node.attributes.scope;
        variable.scope.childIndex = childIndex;
        variable.scope.depth = depth;
        variable.position = position;
        LibSdbUtils.applyVariableType(variable, node.attributes.stateVariable, node.attributes.storageLocation, parent.name);
        if (variable.position === null && node.attributes.stateVariable) {
            variable.position = contract.numStateVariables;
            contract.numStateVariables++;
        }

        return variable;
    }

    export function linkContractAddress(_contractsByName: LibSdbTypes.ContractMap, _contractsByAddress: LibSdbTypes.ContractMap, name: string, address: string): LibSdbTypes.Contract | null {
        if (_contractsByName.has(name)) {
            const contract = _contractsByName.get(name)!;
            if (contract.addresses.indexOf(address) === -1) {
                contract.addresses.push(address.toLowerCase());
            }
            _contractsByAddress.set(address.toLowerCase(), contract);
            return contract;
        }
        else {
            return null;
        }
    }
}