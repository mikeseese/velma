import { AstScope } from "../astScope";
import { LibSdbInterface } from "../../interface";
import { BN } from "bn.js";

import { decode as decodeStack } from "./decode/stack";
import { decode as decodeMemory } from "./decode/memory";
import { decode as decodeStorage } from "./decode/storage";

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

export class Variable {
    name: string;
    functionName: string | null;
    type: VariableValueType;
    originalType: string;
    refType: VariableRefType;
    arrayIsDynamic: boolean; // false for non-arrays
    arrayLength: number; // 0 for non-arrays
    // TODO: struct info
    scope: AstScope;
    position: number | null;
    location: VariableLocation;

    constructor() {
    }

    clone(): Variable {
        let clone = new Variable();

        clone.name = this.name;

        clone.functionName = this.functionName;

        clone.type = this.type;

        clone.originalType = this.originalType;

        clone.refType = this.refType;

        clone.arrayIsDynamic = this.arrayIsDynamic;

        clone.arrayLength = this.arrayLength;

        clone.scope = this.scope.clone();

        clone.position = this.position;

        return clone;
    }

    typeToString(): string {
        return this.originalType;
    }

    async decode(stack: BN[], memory: (number | null)[], _interface: LibSdbInterface, address: string): Promise<string> {
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
        return v;
    }

    applyType(stateVariable: boolean, storageLocation: string, parentName: string): void {
        applyType(this, stateVariable, storageLocation, parentName);
    }
}