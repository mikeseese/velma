import { readFileSync } from "fs";
import { join as joinPath, dirname } from "path";
import { compileStandardWrapper as solcCompile, CompilerOutput } from "solc";

import { LibSdbTypes } from "./types/types";
import { LibSdbUtils } from "./utils/utils";
import { LibSdbRuntime } from "./runtime";

export class LibSdbCompile {
    public static compile = solcCompile;

    private _runtime: LibSdbRuntime;
    private _processedContracts: string[];
    private _contractNameMap: Map<string, LibSdbTypes.Contract>;

    constructor() {
        this._runtime = LibSdbRuntime.instance();
    }

    public linkCompilerOutput(sourceRootPath: string, compilationResult: CompilerOutput): boolean {
        if (compilationResult.sources === undefined) {
            // cant do anything if we don't get the right data, this is invalid
            return false;
        }

        this._contractNameMap = new Map<string, LibSdbTypes.Contract>();
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
                    if (!this._runtime._files.has(absoluteSourcePath)) {
                        this._runtime._files.set(absoluteSourcePath, new LibSdbTypes.File(sourceRootPath, relativeSourcePath));
                    }

                    let file = this._runtime._files.get(absoluteSourcePath)!;

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

                    this._contractNameMap.set(contractName, sdbContract);

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
            const file = this._runtime._files.get(sourcePath);

            if (file) {
                file.sourceId = compilationResult.sources[source].id;
                this._runtime._filesById.set(file.sourceId!, file);

                // assign AST from the compilationResult.sources variable to each SdbFile
                file.ast = compilationResult.sources[source].legacyAST;

                // split SdbFile AST to the contract levels
                astWalker.walk(file.ast, (node) => {
                    if (node.name === "ContractDefinition") {
                        const contractKey = node.attributes.name;
                        if (this._contractNameMap.has(contractKey)) {
                            const contract = this._contractNameMap.get(contractKey)!;
                            contract.ast = JSON.parse(JSON.stringify(node));
                        }

                        return false;
                    }
                    else {
                        return true;
                    }
                });
            }
        }

        // save temporary map to official map
        this._processedContracts = [];
        this._contractNameMap.forEach((contract, key) => {
            this.processContract(contract);
        });

        return true;
    }

    private processContract(contract: LibSdbTypes.Contract): void {
        if (this._processedContracts.indexOf(contract.name) < 0) {
            this._runtime._contractsByName.set(contract.name, contract);

            // haven't processed this contract yet
            contract.scopeVariableMap = new Map<number, LibSdbTypes.VariableMap>();

            // initialize the variable maps for each scope
            const astWalker = new LibSdbUtils.AstWalker();
            astWalker.walk(contract.ast, (node) => {
                if (node.id) {
                    // this is a new scope, add to map
                }

                return true;
            });

            // these are processed separately so that inherited contracts and struct definitions
            //   are determined before we start using it in variable type definition
            this.processContractChildType(contract, "InheritanceSpecifier");
            this.processContractChildType(contract, "StructDefinition");
            this.processContractChildType(contract, "FunctionDefinition");
            this.processContractChildType(contract, "VariableDeclaration");
        }
    }

    private processContractInheritance(contract: LibSdbTypes.Contract, node: any) {
        if (node.children.length > 0) {
            const inheritedContractName = node.children[0].attributes.name;
            const inheritedContract = this._contractNameMap.get(inheritedContractName);
            if (inheritedContract && this._processedContracts.indexOf(inheritedContractName) < 0) {
                this.processContract(inheritedContract);
                for (let i = 0; i < inheritedContract.stateVariables.length; i++) {
                    contract.stateVariables.push(inheritedContract.stateVariables[i].clone()); // TODO: ?
                }
            }
        }
    }

    private processContractStruct(contract: LibSdbTypes.Contract, node: any) {
        // save the scope that the struct is defined at
        contract.structDefinitions.set(node.attributes.name, node.id);
        const astWalker = new LibSdbUtils.AstWalker();
        astWalker.walkDetail(node, null, 0, (node, parent, depth) => {
            if (node.id) {
                if (node.name === "VariableDeclaration") {
                    const variable = this.createVariableFromAst(node, parent, depth, null, contract);
                    // add the variable to the parent's scope
                    if (!contract.scopeVariableMap.has(variable.scope.id)) {
                        contract.scopeVariableMap.set(variable.scope.id, new Map<string, LibSdbTypes.Variable>());
                    }
                    contract.scopeVariableMap.get(variable.scope.id)!.set(variable.name, variable);
                }
            }

            return true;
        });
    }

    private processContractFunction(contract: LibSdbTypes.Contract, node: any) {
        const functionName = node.attributes.name;
        const astWalker = new LibSdbUtils.AstWalker();
        astWalker.walkDetail(node, null, 0, (node, parent, depth) => {
            if (node.id) {
                if (node.name === "VariableDeclaration") {
                    const variable = this.createVariableFromAst(node, parent, depth, functionName, contract);
                    // add the variable to the parent's scope
                    if (!contract.scopeVariableMap.has(variable.scope.id)) {
                        contract.scopeVariableMap.set(variable.scope.id, new Map<string, LibSdbTypes.Variable>());
                    }
                    contract.scopeVariableMap.get(variable.scope.id)!.set(variable.name, variable);
                }
            }

            return true;
        });
    }

    private processContractStateVariable(contract: LibSdbTypes.Contract, node: any, parent: any) {
        // this is outside of a function (i.e. state variables)
        const variable = this.createVariableFromAst(node, parent, 0, null, contract);
        // add the variable to the parent's scope
        if (!contract.scopeVariableMap.has(variable.scope.id)) {
            contract.scopeVariableMap.set(variable.scope.id, new Map<string, LibSdbTypes.Variable>());
        }
        contract.scopeVariableMap.get(variable.scope.id)!.set(variable.name, variable);
    }

    private processContractChildType(contract: LibSdbTypes.Contract, childType: string): void {
        const contractChildren = contract.ast.children;

        for (let i = 0; i < contractChildren.length; i++) {
            const node = contractChildren[i];
            if (node.name === childType) {
                switch (childType) {
                    case "InheritanceSpecifier": {
                        this.processContractInheritance(contract, node);
                        break;
                    }
                    case "StructDefinition": {
                        this.processContractStruct(contract, node);
                        break;
                    }
                    case "FunctionDefinition": {
                        this.processContractFunction(contract, node);
                        break;
                    }
                    case "VariableDeclaration": {
                        this.processContractStateVariable(contract, node, contract.ast);
                        break;
                    }
                    default: {
                        break;
                    }
                }
            }
        }
    }

    private createVariableFromAst(node: any, parent: any, depth: number, functionName: string | null, contract: LibSdbTypes.Contract): LibSdbTypes.Variable {
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
                position = variable.stackPosition;
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
        variable.stackPosition = position;
        variable.applyType(node.attributes.stateVariable, node.attributes.storageLocation, parent.name);
        if (variable.stackPosition === null && node.attributes.stateVariable) {
            variable.stackPosition = contract.stateVariables.length;
            contract.stateVariables.push(variable);
        }

        return variable;
    }

    public linkContractAddress(name: string, address: string): LibSdbTypes.Contract | null {
        if (this._runtime._contractsByName.has(name)) {
            const contract = this._runtime._contractsByName.get(name)!;
            if (contract.addresses.indexOf(address) === -1) {
                contract.addresses.push(address.toLowerCase());
            }
            this._runtime._contractsByAddress.set(address.toLowerCase(), contract);
            return contract;
        }
        else {
            return null;
        }
    }
}