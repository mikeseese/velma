import { ValueDetail } from "./value";
import { StructDetail } from "./struct";
import { MappingDetail } from "./mapping";

export class ArrayDetail {
  isDynamic: boolean;
  length: number;
  type: ValueDetail | ArrayDetail | StructDetail | MappingDetail;
  // From spec: For memory arrays, it cannot be a mapping and has to be an ABI
  //   type if it is an argument of a publicly-visible function.

  constructor() {
      //
  }

  clone(): ArrayDetail {
      let clone = new ArrayDetail();

      clone.isDynamic = this.isDynamic;

      clone.length = this.length;

      clone.type = this.type.clone();

      return clone;
  }
}