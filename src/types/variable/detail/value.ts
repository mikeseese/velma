import { Variable, VariableValueType, DecodedVariable, VariableLocation, VariableValueTypeToString } from "../variable";
import { LibSdbInterface } from "../../../interface";
import { BN } from "bn.js";

import { decode as decodeStack } from "../decode/stack";
import { decode as decodeMemory } from "../decode/memory";
import { decode as decodeStorage } from "../decode/storage";

export class ValueDetail {
    variable: Variable;
    position: number | null;
    offset: number | null; // used for storage locations
    type: VariableValueType;
    storageLength: number;

    constructor(variable: Variable) {
        this.variable = variable;
        //
    }

    clone(): ValueDetail {
        let clone = new ValueDetail(this.variable);

        clone.type = this.type;

        return clone;
    }

    async decode(stack: BN[], memory: (number | null)[], _interface: LibSdbInterface, address: string): Promise<DecodedVariable> {
        let v: string = "";

        if (this.position) {
            switch (this.variable.location) {
                case VariableLocation.Stack:
                    v = decodeStack(this.position, this.type, stack);
                    break;
                case VariableLocation.Memory:
                    v = decodeMemory(this.position, this.type, stack, memory);
                    break;
                case VariableLocation.Storage:
                    v = await decodeStorage(this.position, this.offset || 0, this.storageLength, this.type, _interface, address);
                    break;
                default:
                    break;
            }
        }

        let decodedVariable = <DecodedVariable>{
            name: "(unknown name)",
            type: VariableValueTypeToString(this.type),
            variablesReference: 0,
            value: v,
            result: v
        };

        return decodedVariable;
    }
}