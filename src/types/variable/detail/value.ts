import { VariableValueType } from "../variable";

export class ValueDetail {
  type: VariableValueType;

  constructor() {
      //
  }

  clone(): ValueDetail {
      let clone = new ValueDetail();

      clone.type = this.type;

      return clone;
  }
}