import { Variable } from "./variable/variable";

export class ExpressionFunction {
    name: string;
    args: Variable[];
    argsString: string;
    reference: string;
    code: string;

    constructor() {
        this.args = [];
    }

    clone(): ExpressionFunction {
        let clone = new ExpressionFunction();

        clone.name = this.name;

        for (let i = 0; i < this.args.length; i++) {
            clone.args.push(this.args[i].clone());
        }

        clone.argsString = this.argsString;

        clone.reference = this.reference;

        clone.code = this.code;

        return clone;
    }
}