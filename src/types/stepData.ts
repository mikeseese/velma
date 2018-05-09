import { AstScope } from "./astScope";
import { BN } from "bn.js";

const CircularJSON = require("circular-json");

export class StepData {
    debuggerMessageId: string;
    source: any;
    location: any;
    contractAddress: string;
    vmData: any;
    scope: AstScope[];
    exception?: any;
    events: string[];

    constructor() {
        this.scope = [];
        this.events = [];
    }

    clone(): StepData {
        let clone = new StepData();

        clone.debuggerMessageId = this.debuggerMessageId;

        clone.source = CircularJSON.parse(CircularJSON.stringify(this.source));

        clone.location = CircularJSON.parse(CircularJSON.stringify(this.location));

        clone.contractAddress = this.contractAddress;

        clone.vmData = CircularJSON.parse(CircularJSON.stringify(this.vmData)); // TODO: make this better
        clone.vmData.gasLeft = new BN(this.vmData.gasLeft);
        clone.vmData.stack = [];
        for (let i = 0; i < this.vmData.stack.length; i++) {
            clone.vmData.stack.push(new BN(this.vmData.stack[i]));
        }

        for (let i = 0; i < this.scope.length; i++) {
            clone.scope.push(this.scope[i].clone());
        }

        for (let i = 0; i < this.events.length; i++) {
            clone.events.push(this.events[i]);
        }

        return clone;
    }
}