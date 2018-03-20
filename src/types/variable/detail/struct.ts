import { Variable, DecodedVariable, VariableLocation } from "../variable";
import { ValueDetail } from "./value";
import { ArrayDetail } from "./array";
import { MappingDetail } from "./mapping";
import { BN } from "bn.js";
import { LibSdbInterface } from "../../../interface";

export class StructDetail {
    variable: Variable;
    position: number; // either the slot number or absolute position in stack/memory (starts off as relative until we know where the variable posisiton is)
    location: VariableLocation;
    isPointer: boolean; // pointer vs reference (used for storage locations)
    offset: number | null; // used for storage locations
    id: number;
    name: string;
    members: {
        name: string;
        type: (ValueDetail | ArrayDetail | StructDetail | MappingDetail)
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
            const type = this.members[i].type;
            if (!(type instanceof ValueDetail)) {
                ids.push(type.id);
                ids = ids.concat(type.childIds());
            }
        }

        return ids;
    }

    clone(): StructDetail {
        let clone = new StructDetail(this.variable);

        clone.name = this.name;

        for (let i = 0; i < this.members.length; i++) {
            clone.members.push({
                name: this.members[i].name,
                type: this.members[i].type.clone()
            });
        }

        return clone;
    }

    async decodeChildren(stack: BN[], memory: (number | null)[], _interface: LibSdbInterface, address: string): Promise<DecodedVariable[]> {
        let decodedVariables: DecodedVariable[] = [];

        for (let i = 0; i < this.members.length; i++) {
            let decodedVariable = await this.members[i].type.decode(stack, memory, _interface, address);
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
            value: "",
            result: ""
        };

        return decodedVariable;
    }
}