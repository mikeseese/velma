'use strict'
var TraceManager = require('../remix/src/trace/traceManager')
var util = require('../remix/src/helpers/global')
var EventManager = require('../remix/src/lib/eventManager')
var Web3Providers = require('../remix/src/web3Provider/web3Providers')
var CodeManager = require('../remix/src/code/codeManager')
var SolidityProxy = require('../remix/src/solidity/solidityProxy')
var InternalCallTree = require('../remix/src/util/internalCallTree')

function SolDebugger () {
  var self = this
  this.event = new EventManager()

  this.currentStepIndex = -1
  this.tx
  this.statusMessage = ''

  this.view
  this.web3Providers = new Web3Providers()
  this.addProvider('INTERNAL')
  this.switchProvider('INTERNAL')
  this.traceManager = new TraceManager()
  this.codeManager = new CodeManager(this.traceManager)
  this.solidityProxy = new SolidityProxy(this.traceManager, this.codeManager)

  var callTree = new InternalCallTree(this.event, this.traceManager, this.solidityProxy, this.codeManager, { includeLocalVariables: true })
  this.callTree = callTree // TODO: currently used by browser solidity, we should improve the API

  this.event.register('indexChanged', this, function (index) {
    self.codeManager.resolveStep(index, self.tx)
  })

  this.codeManager.event.register('changed', this, (code, address, instIndex) => {
    this.callTree.sourceLocationTracker.getSourceLocationFromVMTraceIndex(address, this.currentStepIndex, this.solidityProxy.contracts, (error, sourceLocation) => {
      if (!error) {
        this.event.trigger('sourceLocationChanged', [sourceLocation])
      }
    })
  })
}

SolDebugger.prototype.setBreakpointManager = function (breakpointManager) {
  this.breakpointManager = breakpointManager
}

SolDebugger.prototype.web3 = function () {
  return util.web3
}

SolDebugger.prototype.addProvider = function (type, obj) {
  this.web3Providers.addProvider(type, obj)
  this.event.trigger('providerAdded', [type])
}

SolDebugger.prototype.switchProvider = function (type) {
  var self = this
  this.web3Providers.get(type, function (error, obj) {
    if (error) {
      console.log('provider ' + type + ' not defined')
    } else {
      util.web3 = obj
      self.event.trigger('providerChanged', [type])
    }
  })
}

SolDebugger.prototype.setCompilationResult = function (compilationResult) {
  if (compilationResult && compilationResult.sources && compilationResult.contracts) {
    this.solidityProxy.reset(compilationResult)
  } else {
    this.solidityProxy.reset({})
  }
}

SolDebugger.prototype.unLoad = function () {
  this.traceManager.init()
  this.codeManager.clear()
  this.stepManager.reset()
  this.event.trigger('traceUnloaded')
}

SolDebugger.prototype.stepChanged = function (stepIndex) {
  this.currentStepIndex = stepIndex
  this.event.trigger('indexChanged', [stepIndex])
}

SolDebugger.prototype.startDebugging = function (blockNumber, txIndex, tx) {
  if (this.traceManager.isLoading) {
    return
  }
  this.statusMessage = 'Loading trace...'
  console.log('loading trace...')
  this.tx = tx
  var self = this
  this.traceManager.resolveTrace(tx, function (error, result) {
    console.log('trace loaded ' + result)
    if (result) {
        
        SolDebugger.prototype.debug = function (tx) {
          if (tx instanceof Object) {
            this.txBrowser.load(tx.hash)
          } else if (tx instanceof String) {
            this.txBrowser.load(tx)
          }
        }
      self.statusMessage = ''
      self.event.trigger('newTraceLoaded', [self.traceManager.trace])
      if (self.breakpointManager && self.breakpointManager.hasBreakpoint()) {
        self.breakpointManager.jumpNextBreakpoint(false)
      }
    } else {
      self.statusMessage = error ? error.message : 'Trace not loaded'
    }
  })
}

module.exports = SolDebugger
