import { Variable } from "../variable";
import { ValueDetail } from "./value";
import { ArrayDetail } from "./array";
import { StructDetail } from "./struct";

export class MappingDetail {
    id: number;
    key: ValueDetail | ArrayDetail; // cant be dynamic array or contract
    value: ValueDetail | ArrayDetail | StructDetail | MappingDetail
    // Mappings are only allowed for state variables (or as storage reference types in internal functions)

    constructor() {
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
        let clone = new MappingDetail();

        clone.key = this.key.clone();

        this.value = this.value.clone();

        return clone;
    }
}