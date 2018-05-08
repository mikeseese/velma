import { readFileSync } from "fs";
import { join as joinPath, dirname } from "path";
import { CompilerOutput } from "solc";

import { LibSdbTypes } from "../types/types";
import { LibSdbUtils } from "../utils/utils";
import { LibSdbRuntime } from "../runtime";
import { ScopeVariableMap } from "../types/misc";

import { ContractProcessor } from "./contractProcessor";

export class LibSdbCompilationProcessor {
    private _runtime: LibSdbRuntime;
    public _processedContracts: string[];
    public _contractNameMap: Map<string, LibSdbTypes.Contract>;
    public _oldScopeVariableMaps: Map<string, ScopeVariableMap>;

    constructor() {
        this._runtime = LibSdbRuntime.instance();
    }

    public linkCompilerOutput(sourceRootPath: string, compilationResult: CompilerOutput): boolean {
        if (compilationResult.sources === undefined) {
            // cant do anything if we don't get the right data, this is invalid
            return false;
        }

        this._contractNameMap = new Map<string, LibSdbTypes.Contract>();
        this._oldScopeVariableMaps = new Map<string, Map<number, Map<string, LibSdbTypes.Variable>>>();
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

                    sdbContract.pcMap = LibSdbUtils.nameOpCodes(new Buffer(contract.evm.deployedBytecode.object, 'hex'));

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
            const contractProcessor = new ContractProcessor(this, contract);
            contractProcessor.process();
        });

        return true;
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