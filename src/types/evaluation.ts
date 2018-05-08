import { Variable } from "./variable/variable";

export class Evaluation {
    functionName: string;
    returnVariable: Variable;
    contractAddress: string;
    callback: Function;

    constructor() {
        this.returnVariable = new Variable();
    }

    clone(): Evaluation {
        let clone = new Evaluation();

        clone.functionName = this.functionName;

        clone.contractAddress = this.contractAddress;

        clone.callback = this.callback;

        return clone;
    }
}

export class EvaluationRequest {
    evaluationBytecode: string;
    evaluationStartPc: number;
    evaluationEndPc: number;

    runtimeBytecode: string;
    runtimePc: number;

    constructor(evaluationBytecode: string, evaluationStartPc: number, evaluationEndPc: number, runtimeBytecode: string, runtimePc: number) {
        this.evaluationBytecode = evaluationBytecode;
        this.evaluationStartPc = evaluationStartPc;
        this.evaluationEndPc = evaluationEndPc;
        this.runtimeBytecode = runtimeBytecode;
        this.runtimePc = runtimePc;
    }
}