import { LibSdbCompilationProcessor } from "./processor";
import { LibSdbTypes } from "../types/types";
import { LibSdbUtils } from "../utils/utils";
import { LibSdbRuntime } from "../runtime";

import { BN } from "bn.js"

export class ContractProcessor {
    private _runtime: LibSdbRuntime;
    private _compilationProcessor: LibSdbCompilationProcessor;
    private _contract: LibSdbTypes.Contract;
    public _currentStorageSlot: BN;
    public _currentStorageSlotOffset: number;

    constructor(compilationProcessor: LibSdbCompilationProcessor, contract: LibSdbTypes.Contract) {
        this._compilationProcessor = compilationProcessor;
        this._contract = contract;
        this._runtime = LibSdbRuntime.instance();
        this._currentStorageSlot = new BN(0);
        this._currentStorageSlotOffset = 0;
    }

    public process(): void {
        if (this._compilationProcessor._processedContracts.indexOf(this._contract.name) < 0) {
            this._runtime._contractsByName.set(this._contract.name, this._contract);

            // haven't processed this contract yet
            this._compilationProcessor._oldScopeVariableMaps.set(this._contract.name, this._contract.scopeVariableMap);
            this._contract.scopeVariableMap = new Map<number, LibSdbTypes.VariableMap>();

            // initialize the variable maps for each scope
            const astWalker = new LibSdbUtils.AstWalker();
            astWalker.walk(this._contract.ast, (node) => {
                if (node.id) {
                    // this is a new scope, add to map
                }

                return true;
            });

            // these are processed separately so that inherited contracts and struct definitions
            //   are determined before we start using it in variable type definition
            this.processContractChildType("InheritanceSpecifier");
            this.processContractChildType("UsingForDirective");
            this.processContractChildType("EnumDefinition");
            this.processContractChildType("StructDefinition");
            this.processContractChildType("VariableDeclaration");
            this.processContractChildType("FunctionDefinition");

            this._compilationProcessor._oldScopeVariableMaps.delete(this._contract.name);
        }
    }

    private processContractInheritance(node: any) {
        if (node.children.length > 0) {
            const inheritedContractName = node.children[0].attributes.name;
            const inheritedContract = this._compilationProcessor._contractNameMap.get(inheritedContractName);
            if (inheritedContract && this._compilationProcessor._processedContracts.indexOf(inheritedContractName) < 0) {
                const contractProcessor = new ContractProcessor(this._compilationProcessor, inheritedContract);
                contractProcessor._currentStorageSlot = contractProcessor._currentStorageSlot.add(this._currentStorageSlot); // needed if we have multiple inherited contracts (which would all start at 0 slot)
                contractProcessor.process();
                this._contract.inheritedContracts.push(inheritedContract);
                for (let i = 0; i < inheritedContract.stateVariables.length; i++) {
                    this._contract.stateVariables.push(inheritedContract.stateVariables[i].clone());
                }
                this._currentStorageSlot = contractProcessor._currentStorageSlot;
                this._currentStorageSlotOffset = contractProcessor._currentStorageSlotOffset;
            }
        }
    }

    private processContractUsingFor(node: any) {
        if (node.children.length > 0) {
            const usingForContractName = node.children[0].attributes.name;
            const usingForContract = this._compilationProcessor._contractNameMap.get(usingForContractName);
            if (usingForContract && this._compilationProcessor._processedContracts.indexOf(usingForContractName) < 0) {
                const contractProcessor = new ContractProcessor(this._compilationProcessor, usingForContract);
                contractProcessor.process();
            }
        }
    }

    private processContractStruct(node: any) {
        // save the scope that the struct is defined at
        let structDefinition: LibSdbTypes.VariableMap = new Map<string, LibSdbTypes.Variable>();

        const astWalker = new LibSdbUtils.AstWalker();
        astWalker.walkDetail(node, null, 0, (node, parent, depth) => {
            if (node.id) {
                if (node.name === "VariableDeclaration") {
                    const variable = this.createVariableFromAst(node, parent, depth, null);
                    structDefinition.set(variable.name, variable);
                }
            }

            return true;
        });

        this._contract.structDefinitions.set(node.attributes.name, structDefinition);
    }

    private processContractEnum(node: any) {
        // save the scope that the enum is defined at
        let enumDefintion = new LibSdbTypes.EnumDefinition(node.attributes.name);

        for (let i = 0; i < node.children.length; i++) {
            enumDefintion.values.push(node.children[i].attributes.name);
        }

        this._contract.enumDefinitions.set(enumDefintion.name, enumDefintion);
    }

    private processContractFunction(node: any) {
        const functionName = node.attributes.name;
        const astWalker = new LibSdbUtils.AstWalker();
        astWalker.walkDetail(node, null, 0, (node, parent, depth) => {
            if (node.id) {
                if (node.name === "VariableDeclaration") {
                    const variable = this.createVariableFromAst(node, parent, depth, functionName);
                    // add the variable to the parent's scope
                    if (!this._contract.scopeVariableMap.has(variable.scope.id)) {
                        this._contract.scopeVariableMap.set(variable.scope.id, new Map<string, LibSdbTypes.Variable>());
                    }
                    this._contract.scopeVariableMap.get(variable.scope.id)!.set(variable.name, variable);
                }
            }

            return true;
        });
    }

    private processContractStateVariable(node: any, parent: any) {
        // this is outside of a function (i.e. state variables)
        const variable = this.createVariableFromAst(node, parent, 0, null);
        // add the variable to the parent's scope
        if (!this._contract.scopeVariableMap.has(variable.scope.id)) {
            this._contract.scopeVariableMap.set(variable.scope.id, new Map<string, LibSdbTypes.Variable>());
        }
        this._contract.scopeVariableMap.get(variable.scope.id)!.set(variable.name, variable);
    }

    private processContractChildType(childType: string): void {
        const contractChildren = this._contract.ast.children;

        for (let i = 0; i < contractChildren.length; i++) {
            const node = contractChildren[i];
            if (node.name === childType) {
                switch (childType) {
                    case "InheritanceSpecifier": {
                        this.processContractInheritance(node);
                        break;
                    }
                    case "UsingForDirective": {
                        this.processContractUsingFor(node);
                        break;
                    }
                    case "StructDefinition": {
                        this.processContractStruct(node);
                        break;
                    }
                    case "EnumDefinition": {
                        this.processContractEnum(node);
                        break;
                    }
                    case "FunctionDefinition": {
                        this.processContractFunction(node);
                        break;
                    }
                    case "VariableDeclaration": {
                        this.processContractStateVariable(node, this._contract.ast);
                        break;
                    }
                    default: {
                        break;
                    }
                }
            }
        }
    }

    private createVariableFromAst(node: any, parent: any, depth: number, functionName: string | null): LibSdbTypes.Variable {
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
        const scopeVariableMap = this._compilationProcessor._oldScopeVariableMaps.get(this._contract.name);
        if (scopeVariableMap) {
            scopeVariableMap.forEach((variables, scopeId) => {
                const variable = variables.get(node.attributes.name);
                if (variable && variable.scope.depth === depth && variable.functionName === functionName) {
                    position = variable.position;
                }
            });
        }

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
        variable.isStateVariable = node.attributes.stateVariable;
        variable.applyType(node.attributes.storageLocation, parent.name, this);
        if (variable.position === null && node.attributes.stateVariable && variable.detail !== null) {
            // TODO:
            // variable.position = this._currentStorageSlot;
            // const storageUsed = variable.detail.getStorageUsed();
            // this._currentStorageSlot += Math.floor(storageUsed / 32);
            // this._currentStorageSlotOffset = storageUsed % 32;
            this._contract.stateVariables.push(variable);
        }

        return variable;
    }
}