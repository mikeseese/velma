"use strict";

const fs = require("fs");
const solc = require("solc");

const EventManager = require("../remix/src/lib/eventManager");
const TraceManager = require("../remix/src/trace/traceManager");
const CodeManager = require("../remix/src/code/codeManager");
const SolidityProxy = require("../remix/src/solidity/solidityProxy");
const InternalCallTree = require("../remix/src/util/internalCallTree");
const StepManager = require("../remix/src/ui/StepManager");
const BreakpointManager = require("../remix/src/code/breakpointManager");
const Web3Providers = require('../remix/src/web3Provider/web3Providers')
const GlobalRemixUtil = require('../remix/src/helpers/global')

// get .sol file
const inputFile = process.argv[2];
const inputContents = fs.readFileSync(inputFile).toString();
const address = process.argv[3];
const tx = {
    "to": address,
    "from": "0xA5076e93302276476cB75C24F8026af5B845CBA3",
    "hash": process.argv[4]
}

// input
// compile solidity
const compilationResult = solc.compile(inputContents, 0);
console.log(compilationResult);
// create source map (map to PC)
const sourceMap = compilationResult.contracts[":HelloEthSalon"].srcmapRuntime;

let web3Providers = new Web3Providers();
let event = new EventManager();
let traceManager = new TraceManager();
let codeManager = new CodeManager(traceManager);
let solidityProxy = new SolidityProxy(traceManager, codeManager);
let callTree = new InternalCallTree(event, traceManager, solidityProxy, codeManager, { includeLocalVariables: true });

const web3ProviderType = "INTERNAL";
web3Providers.addProvider(web3ProviderType);
event.trigger("providerAdded", [web3ProviderType])
web3Providers.get(web3ProviderType, function (error, obj) {
  if (error) {
    console.log('provider ' + web3ProviderType + ' not defined')
  } else {
    GlobalRemixUtil.web3 = obj
    event.trigger('providerChanged', [web3ProviderType])
  }
})
solidityProxy.reset(compilationResult)

// create vm with some prior state

// create onStep event listener that checks if
//   the current location (deemed by source map)
//   matches any of the breakpoints

// run the code i guess!


if (traceManager.isLoading) {
    return
}
console.log('loading trace...')
traceManager.resolveTrace(tx, function (error, result) {
    console.log('trace loaded ' + result)
    if (result) {
        event.trigger('newTraceLoaded', [traceManager.trace])
        //if (breakpointManager && self.breakpointManager.hasBreakpoint()) {
        //    breakpointManager.jumpNextBreakpoint(false)
        //}
    } else {
        console.log(error ? error.message : 'Trace not loaded');
    }
})