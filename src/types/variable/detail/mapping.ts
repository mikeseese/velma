import { Variable, DecodedVariable } from "../variable";
import { ValueDetail } from "./value";
import { ArrayDetail } from "./array";
import { StructDetail } from "./struct";
import { BN } from "bn.js";
import { LibSdbInterface } from "../../../interface";

export class MappingDetail {
    variable: Variable;
    position: number; // either the slot number or absolute position in stack/memory (starts off as relative until we know where the variable posisiton is)
    offset: number | null; // used for storage locations
    id: number;
    key: ValueDetail | ArrayDetail; // cant be dynamic array or contract
    value: ValueDetail | ArrayDetail | StructDetail | MappingDetail
    memoryLength: number;
    // Mappings are only allowed for state variables (or as storage reference types in internal functions)

    constructor(variable: Variable) {
        this.variable = variable;
        this.id = Variable.nextId++;
    }

    childIds(): number[] {
        let ids: number[] = [];

        if (!(this.key instanceof ValueDetail)) {
            ids.push(this.key.id);
            ids = ids.concat(this.key.childIds());
        }

        if (!(this.value instanceof ValueDetail)) {
            ids.push(this.value.id);
            ids = ids.concat(this.value.childIds());
        }

        return ids;
    }

    clone(): MappingDetail {
        let clone = new MappingDetail(this.variable);

        clone.key = this.key.clone();

        this.value = this.value.clone();

        return clone;
    }

    async decodeChildren(stack: BN[], memory: (number | null)[], _interface: LibSdbInterface, address: string): Promise<DecodedVariable[]> {
        return [];
    }

    async decode(stack: BN[], memory: (number | null)[], _interface: LibSdbInterface, address: string): Promise<DecodedVariable> {
        return <DecodedVariable> {};
    }
}