import { ValueDetail } from "./value";
import { ArrayDetail } from "./array";
import { MappingDetail } from "./mapping";

export class StructDetail {
  name: string;
  members: {
      name: string;
      type: (ValueDetail | ArrayDetail | StructDetail | MappingDetail)
  }[];

  constructor() {
      this.members = [];
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