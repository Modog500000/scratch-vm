const Thread = require('./thread');

class ExecuteRecord {
    constructor (stackFrame, thread, sequencer, blockContainer) {
    // constructor(stackFrame, target, thread, sequencer, runtime, blockContainer) {
        this.stackFrame = stackFrame;
        // this.target = target;
        this.thread = thread;
        this.sequencer = sequencer;
        // this.runtime = runtime;
        this.blockContainer = blockContainer;

        // const runtime = sequencer.runtime;
        // const target = thread.target;

    }

    get runtime () {
        return this.sequencer.runtime;
    }

    get target () {
        return this.thread.target;
    }

    yield () {
        this.thread.status = Thread.STATUS_YIELD;
    }

    startBranch (branchNum, isLoop) {
        this.sequencer.stepToBranch(this.thread, branchNum, isLoop);
    }

    stopAll () {
        this.runtime.stopAll();
    }

    stopOtherTargetThreads () {
        this.runtime.stopForTarget(this.target, this.thread);
    }

    stopThisScript () {
        this.thread.stopThisScript();
    }

    startProcedure (procedureCode) {
        this.sequencer.stepToProcedure(this.thread, procedureCode);
    }

    getProcedureParamNames (procedureCode) {
        return this.blockContainer.getProcedureParamNames(procedureCode);
    }

    pushParam (paramName, paramValue) {
        this.thread.pushParam(paramName, paramValue);
    }

    getParam (paramName) {
        return this.thread.getParam(paramName);
    }

    startHats (requestedHat, optMatchFields, optTarget) {
        return (
            this.runtime.startHats(requestedHat, optMatchFields, optTarget)
        );
    }

    ioQuery (device, func, args) {
        // Find the I/O device and execute the query/function call.
        if (this.runtime.ioDevices[device] && this.runtime.ioDevices[device][func]) {
            const devObject = this.runtime.ioDevices[device];
            return devObject[func].apply(devObject, args);
        }
    }
}

module.exports = ExecuteRecord;
