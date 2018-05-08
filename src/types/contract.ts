import { ScopeVariableMap, Ast, VariableMap } from "./misc";
import { Variable } from "./variable/variable";
import { LibSdbTypes } from "../types/types";

const CircularJSON = require("circular-json");

export class Contract {
    name: string;
    sourcePath: string;
    addresses: string[];
    pcMap: Map<number, LibSdbTypes.EvmInstruction>;
    scopeVariableMap: ScopeVariableMap;
    functionNames: Map<number, string>; // key: pc, value: hash
    bytecode: string;
    runtimeBytecode: string;
    srcmapRuntime: string;
    ast: Ast;
    stateVariables: Variable[];
    breakpoints: Map<number, number>;
    structDefinitions: Map<string, number>;
    inheritedContracts: Contract[];

    constructor() {
        this.pcMap = new Map<number, LibSdbTypes.EvmInstruction>();
        this.scopeVariableMap = new Map<number, VariableMap>();
        this.functionNames = new Map<number, string>();
        this.stateVariables = [];
        this.addresses = [];
        this.breakpoints = new Map<number, number>();
        this.structDefinitions = new Map<string, number>();
        this.inheritedContracts = [];
    }

    clone(): Contract {
        let clone = new Contract();

        clone.name = this.name;

        clone.sourcePath = this.sourcePath;

        clone.addresses = JSON.parse(JSON.stringify(this.addresses));

        for (const v of this.pcMap) {
            clone.pcMap.set(v[0], v[1]);
        }

        for (const variables of this.scopeVariableMap) {
            const variablesClone = new Map<string, Variable>();
            for (const variable of variables[1]) {
                variablesClone.set(variable[0], variable[1].clone());
            }
            clone.scopeVariableMap.set(variables[0], variablesClone);
        }

        for (const v of this.functionNames) {
            clone.functionNames.set(v[0], v[1]);
        }

        clone.bytecode = this.bytecode;

        clone.runtimeBytecode = this.runtimeBytecode;

        clone.srcmapRuntime = this.srcmapRuntime;

        clone.ast = CircularJSON.parse(CircularJSON.stringify(this.ast));

        for (let i = 0; i < this.stateVariables.length; i++) {
            clone.stateVariables.push(this.stateVariables[i]);
        }

        for (const v of this.structDefinitions) {
            clone.structDefinitions.set(v[0], v[1]);
        }

        for (let i = 0; i < this.inheritedContracts.length; i++) {
            clone.inheritedContracts.push(this.inheritedContracts[i]);
        }

        return clone;
    }
}