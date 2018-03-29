import { Variable, VariableType, DecodedVariable, VariableLocation, VariableTypeToString } from "../variable";
import { LibSdbInterface } from "../../../interface";
import { BN } from "bn.js";

import { decode as decodeStack } from "../decode/stack";
import { decode as decodeMemory } from "../decode/memory";
import { decode as decodeStorage } from "../decode/storage";

export class ValueDetail {
    variable: Variable;
    position: number; // either the slot number or absolute position in stack/memory (starts off as relative until we know where the variable posisiton is)
    offset: number | null; // used for storage locations
    type: VariableType;
    storageLength: number;
    memoryLength: number;

    constructor(variable: Variable) {
        this.variable = variable;
        this.memoryLength = 32;
    }

    clone(variable: Variable = this.variable): ValueDetail {
        let clone = new ValueDetail(variable);

        clone.type = this.type;

        return clone;
    }

    async decode(stack: BN[], memory: (number | null)[], _interface: LibSdbInterface, address: string): Promise<DecodedVariable> {
        let v: string = "";

        switch (this.variable.location) {
            case VariableLocation.Stack:
                v = decodeStack((this.variable.position || 0) + this.position, this.type, stack);
                break;
            case VariableLocation.Memory:
                v = decodeMemory((this.variable.position || 0) + this.position, this.type, stack, memory);
                break;
            case VariableLocation.Storage:
                v = await decodeStorage(this.position, this.offset || 0, this.storageLength, this.type, _interface, address);
                break;
            default:
                break;
        }

        let decodedVariable = <DecodedVariable>{
            name: this.variable.name,
            type: VariableTypeToString(this.type),
            variablesReference: 0,
            value: v,
            result: v
        };

        return decodedVariable;
    }
}