import { Variable } from "./variable/variable";

export class Evaluation {
    functionName: string;
    returnVariable: Variable;
    callback: Function;

    constructor() {
        this.returnVariable = new Variable();
    }

    clone(): Evaluation {
        let clone = new Evaluation();

        clone.functionName = this.functionName;

        clone.callback = this.callback;

        return clone;
    }
}