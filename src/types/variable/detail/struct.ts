import { Variable, DecodedVariable, VariableLocation } from "../variable";
import { ValueDetail } from "./value";
import { ArrayDetail } from "./array";
import { MappingDetail } from "./mapping";
import { BN } from "bn.js";
import { LibSdbInterface } from "../../../interface";

export class StructDetail {
    variable: Variable;
    position: number; // either the slot number or relative position in stack/memory
    location: VariableLocation;
    isPointer: boolean; // pointer vs reference (used for storage locations)
    offset: number | null; // used for storage locations
    id: number;
    name: string;
    members: {
        name: string;
        detail: (ValueDetail | ArrayDetail | StructDetail | MappingDetail)
    }[];
    memoryLength: number;

    constructor(variable: Variable) {
        this.variable = variable;
        this.id = Variable.nextId++;
        this.members = [];
    }

    childIds(): number[] {
        let ids: number[] = [];

        for (let i = 0; i < this.members.length; i++) {
            const type = this.members[i].detail;
            if (!(type instanceof ValueDetail)) {
                ids.push(type.id);
                ids = ids.concat(type.childIds());
            }
        }

        return ids;
    }

    clone(variable: Variable = this.variable): StructDetail {
        let clone = new StructDetail(variable);

        clone.name = this.name;

        for (let i = 0; i < this.members.length; i++) {
            clone.members.push({
                name: this.members[i].name,
                detail: this.members[i].detail.clone(variable)
            });
        }

        return clone;
    }

    async decodeChildren(stack: BN[], memory: (number | null)[], _interface: LibSdbInterface, address: string): Promise<DecodedVariable[]> {
        let decodedVariables: DecodedVariable[] = [];

        for (let i = 0; i < this.members.length; i++) {
            let decodedVariable = await this.members[i].detail.decode(stack, memory, _interface, address);
            decodedVariable.name = this.members[i].name;
            decodedVariables.push(decodedVariable);
        }

        return decodedVariables;
    }

    async decode(stack: BN[], memory: (number | null)[], _interface: LibSdbInterface, address: string): Promise<DecodedVariable> {
        let decodedVariable = <DecodedVariable>{
            name: this.variable.name,
            type: this.name,
            variablesReference: this.id,
            value: "Struct",
            result: ""
        };

        return decodedVariable;
    }
}