import { AstScope } from "../astScope";
import { LibSdbInterface } from "../../interface";
import { BN } from "bn.js";

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

export interface VariablePresentationHint {
    /** The kind of variable. Before introducing additional values, try to use the listed values.
        Values:
        'property': Indicates that the object is a property.
        'method': Indicates that the object is a method.
        'class': Indicates that the object is a class.
        'data': Indicates that the object is data.
        'event': Indicates that the object is an event.
        'baseClass': Indicates that the object is a base class.
        'innerClass': Indicates that the object is an inner class.
        'interface': Indicates that the object is an interface.
        'mostDerivedClass': Indicates that the object is the most derived class.
        'virtual': Indicates that the object is virtual, that means it is a synthetic object introduced by the adapter for rendering purposes, e.g. an index range for large arrays.
        etc.
    */
    kind?: string;
    /** Set of attributes represented as an array of strings. Before introducing additional values, try to use the listed values.
        Values:
        'static': Indicates that the object is static.
        'constant': Indicates that the object is a constant.
        'readOnly': Indicates that the object is read only.
        'rawString': Indicates that the object is a raw string.
        'hasObjectId': Indicates that the object can have an Object ID created for it.
        'canHaveObjectId': Indicates that the object has an Object ID associated with it.
        'hasSideEffects': Indicates that the evaluation had side effects.
        etc.
    */
    attributes?: string[];
    /** Visibility of variable. Before introducing additional values, try to use the listed values.
        Values: 'public', 'private', 'protected', 'internal', 'final', etc.
    */
    visibility?: string;
}

export interface DecodedVariable {
    /** The variable's name. */
    name: string;
    /** The variable's value. This can be a multi-line text, e.g. for a function the body of a function. */
    value: string;
    result: string; // same as value
    /** The type of the variable's value. Typically shown in the UI when hovering over the value. */
    type?: string;
    /** Properties of a variable that can be used to determine how to render the variable in the UI. */
    presentationHint?: VariablePresentationHint;
    /** Optional evaluatable name of this variable which can be passed to the 'EvaluateRequest' to fetch the variable's value. */
    evaluateName?: string;
    /** If variablesReference is > 0, the variable is structured and its children can be retrieved by passing variablesReference to the VariablesRequest. */
    variablesReference: number;
    /** The number of named child variables.
        The client can use this optional information to present the children in a paged UI and fetch them in chunks.
    */
    namedVariables?: number;
    /** The number of indexed child variables.
        The client can use this optional information to present the children in a paged UI and fetch them in chunks.
    */
    indexedVariables?: number;
}

export class Variable {
    name: string;
    functionName: string | null;
    originalType: string;
    detail: ValueDetail | ArrayDetail | StructDetail | MappingDetail;
    scope: AstScope;
    position: number | null;
    location: VariableLocation;

    constructor() {
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

    async decode(stack: BN[], memory: (number | null)[], _interface: LibSdbInterface, address: string): Promise<DecodedVariable> {
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
            variablesReference: 0,
            value: v,
            result: v
        };
        return decodedVariable;
    }

    applyType(stateVariable: boolean, storageLocation: string, parentName: string): void {
        applyType(this, stateVariable, storageLocation, parentName);
    }
}