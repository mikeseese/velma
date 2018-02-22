import * as WebSocket from "ws";

import { LibSdbCompile } from "./compiler";
import { LibSdbRuntime } from "./runtime";

const CircularJSON = require("circular-json");
const uuidv4 = require("uuid").v4;

export class LibSdbInterface {
    private _wss: WebSocket.Server;
    private _latestWs: WebSocket;

    private _runtime: LibSdbRuntime;

    private _debuggerMessages: Map<string, WebSocket | Function | undefined>;

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
        const debuggerMessage = this._debuggerMessages.get(messageId)!;
        if (debuggerMessage instanceof WebSocket) {
            debuggerMessage.send(message);
        }
        this._debuggerMessages.delete(messageId);
    }

    public requestContent(content: any, callback: Function | undefined = undefined) {
        const msgId = uuidv4();
        const request = {
            "id": msgId,
            "messageType": "request",
            "content": content
        };
        const message = CircularJSON.stringify(request);

        this._debuggerMessages.set(msgId, callback);

        this._latestWs.send(message);
    }

    public async requestStorage(address: any, position: any): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            const msgId = uuidv4();
            const request = {
                "id": msgId,
                "messageType": "request",
                "content": {
                    "type": "getStorage",
                    "address": address,
                    "position": position
                }
            };
            const message = CircularJSON.stringify(request);

            this._debuggerMessages.set(msgId, resolve);

            this._latestWs.send(message);
        });
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

        if (messageType === "request") {
            this._debuggerMessages.set(data.id, ws);

            if (triggerType === "linkCompilerOutput") {
                LibSdbCompile.linkCompilerOutput(this._runtime._files, this._runtime._contractsByName, this._runtime._contractsByAddress, data.content.sourceRootPath, data.content.compilationResult);
                this.respondToDebugHook(data.id);
            }
            else if (triggerType === "linkContractAddress") {
                LibSdbCompile.linkContractAddress(this._runtime._contractsByName, this._runtime._contractsByAddress, data.content.contractName, data.content.address);
                this.respondToDebugHook(data.id);
            }
            else if (triggerType === "step" || triggerType === "exception") {
                this._runtime.vmStepped(data);
            }
        }
        else if (messageType === "response") {
            const debuggerMessage = this._debuggerMessages.get(data.id)!;
            if (debuggerMessage instanceof Function) {
                debuggerMessage(data.content);
            }
            this._debuggerMessages.delete(data.id);

            // TODO: none of this is going to work any more
            // if (data.content.type === "putCodeResponse") {
            //     // i guess we dont care right now that this is responding to the specific request yet; we will probably eventually
            //     this.respondToDebugHook(data.id); // eek, let the debugger run!
            // }
            // else if (data.content.type === "getStorage") {
            //     //
            // }
        }
    }

    public serve(host: string, port: number, callback) {
        const self = this;

        this._wss = new WebSocket.Server({
            host: host,
            port: port
        }, callback);

        this._wss.on("connection", function connection(ws: WebSocket) {
            self._latestWs = ws;
            ws.on("message", (message) => {
                self.messageHandler(ws, message);
            });
            ws.on("close", (code: number, reason: string) => {
                self._wss.close();
                self._runtime.sendEvent("end");
            });
        });
    }
}