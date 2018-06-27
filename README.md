# <img src="https://user-images.githubusercontent.com/549323/41639879-a6eeb290-742d-11e8-8ece-bb1c292b407a.png" alt="" width="100" height="auto" valign="middle"> Velma Solidity Debugger
Real-time Solidity Debugger and [Associated VS Code Integration](https://github.com/mikeseese/vscode-velma-debug)

_Stepping_
![Stepping](https://i.imgur.com/krH5uFb.gif)

_Stepping Into_
![Stepping Into](https://i.imgur.com/JUYvXbz.gif)

_Constructor and Contract State_
![Constructor and Contract State](https://i.imgur.com/cQ5Cy0Y.gif)


## Get Started!
Checkout the [Velma sample project](https://github.com/mikeseese/velma-sample/blob/master/README.md) to see how you can get started with debugging with Velma. We're definitely looking to streamline the process of using Velma, but we currently highly recommend to follow the instructions in the sample project's `README` to get started.

## :warning: Results May Vary
Velma is a very new tool built from scratch just a few months ago. There will be growing pains as the project reaches maturity. Help us out by reporting any issues or requesting features on the [Issues Page](https://github.com/mikeseese/velma/issues). We'll try to address all of them, but please bare with us (us being [1 guy doing this as a side project](https://github.com/mikeseesee/velma/blob/master/README.md#final-thoughts)) if we don't get to you in a short manner (i.e. 1-2 weeks, ping us again after that!).

## Another Solidity Debugger??
Velma was created to fulfill, and winner of, an [Augur bounty](https://github.com/AugurProject/augur-bounties#-bounty-2-portable-solidity-debugger) for a portable Solidity Debugger which supported TestRPC (now [ganache-cli/core](https://github.com/trufflesuite/ganache-cli)), had VS Code integration, and arbitrary Solidity code execution at a breakpoint. While there are other **awesome and notable** debuggers (i.e. [Truffle](https://github.com/trufflesuite/truffle/tree/develop/packages/truffle-debugger) and [Remix](https://github.com/ethereum/remix)), Velma addresses Solidity Debugging differently to achieve real-time debugging.

### Real-time vs. Trace Analyzing
#### Trace Analyzer Debugging
Current debugger runtimes utilize the [debug_traceTransaction](https://github.com/ethereum/go-ethereum/wiki/Management-APIs#debug_tracetransaction) RPC method:

>The traceTransaction debugging method will attempt to run the transaction in the exact same manner as it was executed on the network. It will replay any transaction that may have been executed prior to this one before it will finally attempt to execute the transaction that corresponds to the given hash.

In lamen terms, it replays a transaction to build the EVM low-level debugging information. Debuggers then play back this history of events. The developer scan debug code _after_ it was executed and understand exactly what happened in the exact same state. This can be extremely helpful, especially for complex distributed systems like Ethereum. However, the code was already executed; it can't be prevented from executing or modified before finishing execution.

#### Real-time Debugging
Velma uses a different method for debugging. Velma directly ties in with the Ethereum Virtual Machine (specifically, the [ethereumjs-vm](https://github.com/ethereumjs/ethereumjs-vm) implementation of the EVM) and debugs transactions **as they happen**. This means when you stop on a breakpoint using Velma, the code that you are about to step over/into hasn't actually executed yet. You can hypothetically change the state of variables (currently not supported in Velma, but not out of the realm of things), execute arbitrary code with the current state (supported by Velma!), and even stop execution from continuing.

The biggest feature we gain from this is arbitrary code execution. We can inject code directly into the EVM to execute some piece of Solidity the user inputs, run it, and return the result. This is ran **in the context** of the running transaction. Pretty cool stuff if you ask me!

_Arbitrary Code Execution_
![Arbitrary Code Execution](https://i.imgur.com/yN1UE3x.gif)
