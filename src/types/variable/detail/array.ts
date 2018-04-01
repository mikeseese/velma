import { Variable, DecodedVariable, VariableLocation } from "../variable";
import { ValueDetail } from "./value";
import { StructDetail } from "./struct";
import { MappingDetail } from "./mapping";
import { BN } from "bn.js";
import { LibSdbInterface } from "../../../interface";

export class ArrayDetail {
    variable: Variable;
    location: VariableLocation;
    isPointer: boolean; // pointer vs reference (used for storage locations)
    position: number; // either the slot number or relative position in stack/memory
    offset: number | null; // used for storage locations
    id: number;
    isDynamic: boolean;
    memberType: ValueDetail | ArrayDetail | StructDetail | MappingDetail;
    length: number;
    members: (ArrayDetail["memberType"])[];
    memoryLength: number;
    // From spec: For memory arrays, it cannot be a mapping and has to be an ABI
    //   type if it is an argument of a publicly-visible function.

    constructor(variable: Variable) {
        this.variable = variable;
        this.id = Variable.nextId++;
        this.members = [];
    }

    childIds(): number[] {
        let ids: number[] = [];

        for (let i = 0; i < this.members.length; i++) {
            const type = this.members[i];
            if (!(type instanceof ValueDetail)) {
                ids.push(type.id);
                ids = ids.concat(type.childIds());
            }
        }

        return ids;
    }

    clone(variable: Variable = this.variable): ArrayDetail {
        let clone = new ArrayDetail(variable);

        clone.isDynamic = this.isDynamic;

        for (let i = 0; i < this.members.length; i++) {
            clone.members.push(this.members[i].clone(variable));
        }

        return clone;
    }

    async decodeChildren(stack: BN[], memory: (number | null)[], _interface: LibSdbInterface, address: string): Promise<DecodedVariable[]> {
        let decodedVariables: DecodedVariable[] = [];

        decodedVariables.push(<DecodedVariable> {
            name: "length",
            type: "number",
            variablesReference: 0,
            value: this.members.length.toString(),
            result: this.members.length.toString()
        });

        for (let i = 0; i < this.members.length; i++) {
            let decodedVariable = await this.members[i].decode(stack, memory, _interface, address);
            decodedVariable.name = i.toString();
            decodedVariables.push(decodedVariable);
        }

        return decodedVariables;
    }

    async decode(stack: BN[], memory: (number | null)[], _interface: LibSdbInterface, address: string): Promise<DecodedVariable> {
        let decodedVariable = <DecodedVariable> {
            name: this.variable.name,
            type: "array",
            variablesReference: this.id,
            value: "Array(" + this.length + ")",
            result: ""
        };

        return decodedVariable;
    }
}