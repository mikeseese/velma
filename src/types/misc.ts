import { Variable } from "./variable/variable";
import { Contract } from "./contract";
import { File } from "./file"

export type VariableName = string;
export type VariableMap = Map<VariableName, Variable>;
export type ScopeVariableMap = Map<number, VariableMap>;

export type Ast = any;

export type ContractMap = Map<string, Contract>; // key is address or name

export type FileMap = Map<string, File>; // key is full path/name of file
export type FileByIdMap = Map<number, File>; // key is full path/name of file