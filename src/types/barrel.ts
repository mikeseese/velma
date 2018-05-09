import { ValueDetail, ArrayDetail, StructDetail, MappingDetail, ContractDetail, EnumDetail } from "./barrel";

export * from "./astScope";
export * from "./breakpoint";
export * from "./contract";
export * from "./evaluation";
export * from "./expressionFunction";
export * from "./file";
export * from "./misc";
export * from "./stackFrame";
export * from "./stepData";
export * from "./variable/variable";
export * from "./variable/detail/value";
export * from "./variable/detail/enum";
export * from "./variable/detail/array";
export * from "./variable/detail/struct";
export * from "./variable/detail/mapping";
export * from "./variable/detail/contract";
export * from "./enum";

export type VariableDetailType = ValueDetail | EnumDetail | ArrayDetail | StructDetail | MappingDetail | ContractDetail;