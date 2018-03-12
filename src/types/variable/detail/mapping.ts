import { ValueDetail } from "./value";
import { ArrayDetail } from "./array";
import { StructDetail } from "./struct";

export class MappingDetail {
  key: ValueDetail | ArrayDetail; // cant be dynamic array or contract
  value: ValueDetail | ArrayDetail | StructDetail | MappingDetail
  // Mappings are only allowed for state variables (or as storage reference types in internal functions)

  constructor() {
      //
  }

  clone(): MappingDetail {
      let clone = new MappingDetail();

      clone.key = this.key.clone();

      this.value = this.value.clone();

      return clone;
  }
}