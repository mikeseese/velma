import { normalize as normalizePath } from "path";
import * as WebSocket from "ws";

import { LibSdbCompile } from "./compiler";
import { LibSdbRuntime } from "./runtime";

const CircularJSON = require("circular-json");

export class LibSdbInterface {
    private _wss: WebSocket.Server;

    private _runtime: LibSdbRuntime;

    private _debuggerMessages: Map<string, WebSocket>;

    constructor(runtime: LibSdbRuntime) {
        this._runtime = runtime;
        this._debuggerMessages = new Map<string, WebSocket>();
    }

    public respondToDebugHook(messageId: string, content: any = null) {
        // don't respond if we don't actually need to
        if (!this._debuggerMessages.has(messageId)) {
            return;
        }

        const response = {
            "status": "ok",
            "id": messageId,
            "messageType": "response",
            "content": content
        };
        const message = CircularJSON.stringify(response);
        this._debuggerMessages.get(messageId)!.send(message);
        this._debuggerMessages.delete(messageId);
    }

    private messageHandler(ws: WebSocket, message: WebSocket.Data) {
        let data;
        if (message instanceof Buffer) {
            data = CircularJSON.parse(message.toString("utf8"));
        }
        else {
            data = CircularJSON.parse(message);
        }
        const triggerType = data.triggerType;
        const messageType = data.messageType;

        if (triggerType === "linkCompilerOutput") {
            LibSdbCompile.linkCompilerOutput(this._runtime._files, this._runtime._contractsByName, this._runtime._contractsByAddress, data.content);

            const response = {
                "status": "ok",
                "id": data.id,
                "messageType": "response",
                "content": null
            };
            ws.send(CircularJSON.stringify(response));
        }
        else if (triggerType === "linkContractAddress") {
            const fullContractName = normalizePath(data.content.sourcePath) + ":" + data.content.contractName;
            LibSdbCompile.linkContractAddress(this._runtime._contractsByName, this._runtime._contractsByAddress, fullContractName, data.content.address);

            const response = {
                "status": "ok",
                "id": data.id,
                "messageType": "response",
                "content": null
            };
            ws.send(CircularJSON.stringify(response));
        }
        else if (triggerType === "step") {
            this._debuggerMessages.set(data.id, ws);
            this._runtime.vmStepped(data);
        }
        else if (messageType === "response") {
            if (data.content && data.content.type === "putCodeResponse") {
                // i guess we dont care right now that this is responding to the specific request yet; we will probably eventually
                this.respondToDebugHook(data.id); // eek, let the debugger run!
            }
        }
    }

    public serve(host: string, port: number, callback) {
        const self = this;

        this._wss = new WebSocket.Server({
            host: host,
            port: port
        }, callback);

        this._wss.on("connection", function connection(ws: WebSocket) {
            ws.on("message", (message) => {
                self.messageHandler(ws, message);
            });
        });
    }
}