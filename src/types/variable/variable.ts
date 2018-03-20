import { AstScope } from "../astScope";
import { DebugProtocol } from "vscode-debugprotocol";

import { applyType } from "./applyType";
import { LibSdbTypes } from "../types";

export enum VariableLocation {
    Stack,
    Memory,
    Storage,
    CallData
}

export enum VariableType {
    Boolean,
    UnsignedInteger,
    Integer,
    FixedPoint,
    Address,
    FixedByteArray,
    Enum,
    Function,
    Struct,
    Mapping,
    ByteArray,
    Contract,
    String,
    None
}

export function VariableTypeToString(type: VariableType): string {
    switch (type) {
        case VariableType.Boolean:
            return "bool";
        case VariableType.UnsignedInteger:
            return "uint";
        case VariableType.Integer:
            return "int";
        case VariableType.FixedPoint:
            return "fixedpoint";
        case VariableType.Address:
            return "address";
        case VariableType.FixedByteArray:
            return "bytes";
        case VariableType.Enum:
            return "enum";
        case VariableType.Function:
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

export type VariableReferenceMap = Map<number, LibSdbTypes.ValueDetail | LibSdbTypes.ArrayDetail | LibSdbTypes.StructDetail | LibSdbTypes.MappingDetail>;

export class Variable {
    id: number;
    name: string;
    position: number | null; // position in stack to value or pointer
    functionName: string | null;
    originalType: string;
    detail: LibSdbTypes.ValueDetail | LibSdbTypes.ArrayDetail | LibSdbTypes.StructDetail | LibSdbTypes.MappingDetail;
    scope: AstScope;
    location: VariableLocation;

    public static nextId: number = 1;

    constructor() {
        this.id = Variable.nextId++;
    }

    childIds(): number[] {
        let ids: number[] = [];

        if (!(this.detail instanceof LibSdbTypes.ValueDetail)) {
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
        if (this.detail instanceof LibSdbTypes.ValueDetail) {
            return 0;
        }
        else {
            return this.id;
        }
    }

    applyType(stateVariable: boolean, storageLocation: string, parentName: string, _variableReferenceIds: LibSdbTypes.VariableReferenceMap): void {
        applyType(this, stateVariable, storageLocation, parentName, _variableReferenceIds);
    }
}