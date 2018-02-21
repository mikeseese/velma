import { readFileSync } from "fs";
import { join as joinPath, dirname } from "path";
import { compileStandardWrapper as solcCompile, CompilerOutput } from "solc";

import { LibSdbTypes } from "./types";
import { LibSdbUtils } from "./utils/utils";

export namespace LibSdbCompile {
    export const compile = solcCompile;

    export function linkCompilerOutput(_files: LibSdbTypes.FileMap, _contractsByName: LibSdbTypes.ContractMap, _contractsByAddress: LibSdbTypes.ContractMap, sourceRootPath: string, compilationResult: CompilerOutput): boolean {
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

                    if (!file.sourceCode) {
                        file.sourceCode = readFileSync(absoluteSourcePath, "utf8");
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
                    Object.keys(pcMap).forEach((pc) => {
                        sdbContract.pcMap.set(parseInt(pc), pcMap[pc]);
                    });

                    if (contract.evm.methodIdentifiers !== undefined) {
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

                                        let variable = new LibSdbTypes.Variable();
                                        variable.name = node.attributes.name;
                                        variable.scope = new LibSdbTypes.AstScope();
                                        variable.scope.id = node.attributes.scope;
                                        variable.scope.childIndex = childIndex;
                                        variable.scope.depth = depth;
                                        variable.stackPosition = stackPosition;
                                        if (node.attributes.stateVariable === true) {
                                            variable.location = LibSdbTypes.VariableLocation.Storage;
                                        }
                                        else {
                                            if (node.attributes.storageLocation === "default") {
                                                // look at the type to figure out where it goes
                                                // if value type
                                                const varType: string = node.attributes.type || "";
                                                let isReferenceType: boolean = false;
                                                isReferenceType = isReferenceType || varType.startsWith("struct"); // struct
                                                isReferenceType = isReferenceType || varType.includes("[") && varType.includes("]"); // array
                                                // TODO: mapping
                                                if (isReferenceType) {
                                                    if (parent.name === "ParameterList") {
                                                        variable.location = LibSdbTypes.VariableLocation.Memory;
                                                    }
                                                    else {
                                                        variable.location = LibSdbTypes.VariableLocation.Storage;
                                                    }
                                                }
                                                else {
                                                    // value type
                                                    variable.location = LibSdbTypes.VariableLocation.Stack;
                                                }
                                            }
                                            else if (node.attributes.storageLocation === "storage") {
                                                variable.location = LibSdbTypes.VariableLocation.Storage;
                                            }
                                            else if (node.attributes.storageLocation === "memory") {
                                                variable.location = LibSdbTypes.VariableLocation.Memory;
                                            }
                                            else {
                                                // default to stack i guess, probably shouldnt get here though
                                                variable.location = LibSdbTypes.VariableLocation.Stack;
                                            }
                                        }
                                        const varType: string = node.attributes.type;
                                        if (varType.match(/bool/g)) {
                                            variable.type = LibSdbTypes.VariableValueType.Boolean;
                                        }
                                        else if (varType.match(/uint/g)) {
                                            variable.type = LibSdbTypes.VariableValueType.UnsignedInteger;
                                        }
                                        else if (varType.match(/.*(?:^|[^u])int.*/g)) {
                                            variable.type = LibSdbTypes.VariableValueType.Integer;
                                        }
                                        else if (varType.match(/address/g)) {
                                            variable.type = LibSdbTypes.VariableValueType.Address;
                                        }
                                        else if (varType.match(/(bytes)(([1-9]|[12][0-9]|3[0-2])\b)/g)) {
                                            variable.type = LibSdbTypes.VariableValueType.FixedByteArray;
                                        }
                                        // TODO: FixedPoint when its implemented in solidity
                                        // TODO: Enum
                                        // TODO: Function

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

        return true;
    }

    export function linkContractAddress(_contractsByName: LibSdbTypes.ContractMap, _contractsByAddress: LibSdbTypes.ContractMap, name: string, address: string) {
        if (_contractsByName.has(name)) {
            const contract = _contractsByName.get(name)!;
            contract.address = address.toLowerCase();
            _contractsByAddress.set(contract.address, contract);
        }
    }
}