import { AstScope } from "../astScope";
import { DebugProtocol } from "vscode-debugprotocol";

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

export function VariableValueTypeToString(type: VariableValueType): string {
    switch (type) {
        case VariableValueType.Boolean:
            return "bool";
        case VariableValueType.UnsignedInteger:
            return "uint";
        case VariableValueType.Integer:
            return "int";
        case VariableValueType.FixedPoint:
            return "fixedpoint";
        case VariableValueType.Address:
            return "address";
        case VariableValueType.FixedByteArray:
            return "bytes";
        case VariableValueType.Enum:
            return "enum";
        case VariableValueType.Function:
            return "function";
        default:
            return "";
    }
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

    applyType(stateVariable: boolean, storageLocation: string, parentName: string): void {
        applyType(this, stateVariable, storageLocation, parentName);
    }
}