
import { Socket } from "net";

import { LibSdbTypes } from "./types";
import { LibSdbCompile } from "./compiler";
import { LibSdbRuntime } from "./runtime";

const CircularJSON = require("circular-json");

export class LibSdbInterface {
    private _socket: Socket;

    private _runtime: LibSdbRuntime;

    private _debuggerMessageId: string | null;

    constructor(runtime: LibSdbRuntime) {
        this._runtime = runtime;
    }

    public respondToDebugHook(content: any = null) {
        // don't respond if we don't actually need to
        if (this._debuggerMessageId === null) {
            return;
        }

        const response = {
            "status": "ok",
            "id": this._debuggerMessageId,
            "messageType": "response",
            "content": content
        };
        this._socket.write(CircularJSON.stringify(response));

        this._debuggerMessageId = null;
    }

    private socketHandler(dataSerialized: string) {
        const data = CircularJSON.parse(dataSerialized);
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
            this._socket.write(CircularJSON.stringify(response));
        }
        else if (triggerType === "linkContractAddress") {
            LibSdbCompile.linkContractAddress(this._runtime._contractsByName, this._runtime._contractsByAddress, data.content.name, data.content.address);

            const response = {
                "status": "ok",
                "id": data.id,
                "messageType": "response",
                "content": null
            };
            this._socket.write(CircularJSON.stringify(response));
        }
        else if (triggerType === "step") {
            this._runtime.vmStepped(data);
        }
        else if (messageType === "response") {
            if (data.content && data.content.type === "putCodeResponse") {
                // i guess we dont care right now that this is responding to the specific request yet; we will probably eventually
                this.respondToDebugHook(); // eek, let the debugger run!
            }
        }
    }

    public attach(host: string, port: number, callback) {
        this._socket.on('error', function (this: LibSdbInterface, e) {
            if (e.code === 'ECONNREFUSED') {
                console.log('Is the server running at ' + port + '?');

                this._socket.setTimeout(5000, function (this: LibSdbInterface) {
                    this._socket.connect(port, host, function () {
                        callback();
                    });
                }.bind(this));

                console.log('Timeout for 5 seconds before trying port:' + port + ' again');

            }
        }.bind(this));

        this._socket.connect(port, host, () => {
            callback();
        });

        this._socket.on("data", this.socketHandler.bind(this));
    }
}