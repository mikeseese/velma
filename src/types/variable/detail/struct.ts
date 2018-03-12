import { Variable } from "../variable";
import { ValueDetail } from "./value";
import { ArrayDetail } from "./array";
import { MappingDetail } from "./mapping";

export class StructDetail {
    id: number;
    name: string;
    members: {
        name: string;
        type: (ValueDetail | ArrayDetail | StructDetail | MappingDetail)
    }[];

    constructor() {
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
        let clone = new StructDetail();

        clone.name = this.name;

        for (let i = 0; i < this.members.length; i++) {
            clone.members.push({
                name: this.members[i].name,
                type: this.members[i].type.clone()
            });
        }

        return clone;
    }
}