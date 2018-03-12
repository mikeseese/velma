import { AstScope } from "../astScope";
import { LibSdbInterface } from "../../interface";
import { BN } from "bn.js";
import { DebugProtocol } from "vscode-debugprotocol";

import { decode as decodeStack } from "./decode/stack";
import { decode as decodeMemory } from "./decode/memory";
import { decode as decodeStorage } from "./decode/storage";

import { ValueDetail } from "./detail/value";
import { ArrayDetail } from "./detail/array";
import { StructDetail } from "./detail/struct";
import { MappingDetail } from "./detail/mapping";

import { applyType } from "./applyType";

export enum VariableLocation {
    Stack,
    Memory,
    Storage
}

export enum VariableValueType {
    Boolean,
    UnsignedInteger,
    Integer,
    FixedPoint,
    Address,
    FixedByteArray,
    Enum,
    Function,
    None
}

export enum VariableRefType {
    Array,
    Struct,
    Mapping,
    None
}

export interface DecodedVariable extends DebugProtocol.Variable {
    result: string; // same as value
}

export class Variable {
    id: number;
    name: string;
    functionName: string | null;
    originalType: string;
    detail: ValueDetail | ArrayDetail | StructDetail | MappingDetail;
    scope: AstScope;
    position: number | null;
    location: VariableLocation;

    public static nextId: number = 1;

    constructor() {
        this.id = Variable.nextId++;
    }

    childIds(): number[] {
        let ids: number[] = [];

        if (!(this.detail instanceof ValueDetail)) {
            ids.push(this.detail.id);
            ids = ids.concat(this.detail.childIds());
        }

        return ids;
    }

    clone(): Variable {
        let clone = new Variable();

        clone.name = this.name;

        clone.functionName = this.functionName;

        clone.originalType = this.originalType;

        clone.detail = this.detail.clone();

        clone.scope = this.scope.clone();

        clone.position = this.position;

        return clone;
    }

    typeToString(): string {
        return this.originalType;
    }

    variableReference(): number {
        if (this.detail instanceof ValueDetail) {
            return 0;
        }
        else {
            return this.id;
        }
    }

    async decodeChildren(stack: BN[], memory: (number | null)[], _interface: LibSdbInterface, address: string): Promise<DecodedVariable[]> {
        let decodedVariables: DecodedVariable[] = [];

        if (!(this.detail instanceof ValueDetail)) {
            let v: string = "";

            switch (this.location) {
                case VariableLocation.Stack:
                    v = decodeStack(this, stack);
                    break;
                case VariableLocation.Memory:
                    v = decodeMemory(this, stack, memory);
                    break;
                case VariableLocation.Storage:
                    v = await decodeStorage(this, _interface, address);
                    break;
                default:
                    break;
            }

            const decodedVariable = <DecodedVariable> {
                name: this.name,
                evaluateName: this.name,
                type: this.typeToString(),
                variablesReference: this.variableReference(),
                value: v,
                result: v
            };
        }

        return decodedVariables;
    }

    async decode(stack: BN[], memory: (number | null)[], _interface: LibSdbInterface, address: string): Promise<DecodedVariable> {
        let v: string = "";

        if (this.detail instanceof ValueDetail) {
            switch (this.location) {
                case VariableLocation.Stack:
                    v = decodeStack(this, stack);
                    break;
                case VariableLocation.Memory:
                    v = decodeMemory(this, stack, memory);
                    break;
                case VariableLocation.Storage:
                    v = await decodeStorage(this, _interface, address);
                    break;
                default:
                    break;
            }
        }

        let decodedVariable = <DecodedVariable> {
            name: this.name,
            evaluateName: this.name,
            type: this.typeToString(),
            variablesReference: this.variableReference(),
            value: v,
            result: v
        };
        return decodedVariable;
    }

    applyType(stateVariable: boolean, storageLocation: string, parentName: string): void {
        applyType(this, stateVariable, storageLocation, parentName);
    }
}