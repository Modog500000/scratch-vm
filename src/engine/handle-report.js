var Thread = require('./thread');

/**
 * Object constructor to avoid recreating entire function call util array each time
 * @param {!Sequencer} sequencer Which sequencer is executing
 * @param {!Runtime} runtime The runtime object
 * @param {!Thread} thread Thread which to read and execute
 * @param {!Blocks} blockContainer The container of the blocks
 * @param {Object} executionContext The execution context of the stack frame
 * @param {?Target} target Target of this thread
 * @param {?string} opcode the opcode corresponding to that block
 * @param {!string} currentBlockId blockId ID of the current block
 * @param {boolean} isHat true if executing a hat block
 * @constructor
 */
var HandleReport = function (sequencer, runtime, thread, blockContainer, executionContext,
                             target, opcode, currentBlockId, isHat) {
    /**
     * Which sequencer is executing
     * @type {Sequencer}
     */
    this.sequencer = sequencer;
    /**
     * The runtime object
     * @type {Runtime}
     */
    this.runtime = runtime;
    /**
     * Thread which to read and execute
     * @type {Thread}
     */
    this.thread = thread;
    /**
     * The container of the blocks
     * @type {Blocks}
     */
    this.blockContainer = blockContainer;
    /**
     * A stack frame linked list item
     */
    this.stackFrame = executionContext;
    /**
     * Target of this thread
     * @type {Target}
     */
    this.target = target;
    /**
     * the opcode corresponding to that block
     * @type {string}
     */
    this.opcode = opcode;
    /**
     * blockId ID of the current block
     * @type {string}
     */
    this.currentBlockId = currentBlockId;
    /**
     * true if executing a hat block
     * @type {boolean}
     */
    this.isHat = isHat;
};

HandleReport.prototype.yield = function () {
    this.thread.status = Thread.STATUS_YIELD;
};
HandleReport.prototype.startBranch = function (branchNum, isLoop) {
    this.sequencer.stepToBranch(this.thread, branchNum, isLoop);
};
HandleReport.prototype.stopAll = function () {
    this.runtime.stopAll();
};
HandleReport.prototype.stopOtherTargetThreads = function () {
    this.runtime.stopForTarget(this.target, this.thread);
};
HandleReport.prototype.stopThisScript = function () {
    // this.sequencer.retireThread(this.thread);
    this.thread.stopThisScript();
};
HandleReport.prototype.startProcedure = function (procedureCode) {
    this.sequencer.stepToProcedure(this.thread, procedureCode);
};
HandleReport.prototype.getProcedureParamNames = function (procedureCode) {
    return this.blockContainer.getProcedureParamNames(procedureCode);
};
HandleReport.prototype.pushParam = function (paramName, paramValue) {
    this.thread.pushParam(paramName, paramValue);
};
HandleReport.prototype.getParam = function (paramName) {
    return this.thread.getParam(paramName);
};
HandleReport.prototype.startHats = function (requestedHat, optMatchFields, optTarget) {
    return (
        this.runtime.startHats(requestedHat, optMatchFields, optTarget)
    );
};
HandleReport.prototype.ioQuery = function (device, func, args) {
    // Find the I/O device and execute the query/function call.
    if (this.runtime.ioDevices[device] && this.runtime.ioDevices[device][func]) {
        var devObject = this.runtime.ioDevices[device];
        // @todo Figure out why eslint complains about no-useless-call
        // no-useless-call can't tell if the call is useless for dynamic
        // expressions... or something. Not exactly sure why it
        // complains here.
        // eslint-disable-next-line no-useless-call
        return devObject[func].call(devObject, args);
    }
};

/**
 * Handle any reported value from the primitive, either directly returned
 * or after a promise resolves.
 * @param {*} resolvedValue Value eventually returned from the primitive.
 */
HandleReport.prototype.handleReport = function (resolvedValue) {

    this.thread.pushReportedValue(resolvedValue);
    if (this.isHat) {
        // Hat predicate was evaluated.
        if (this.runtime.getIsEdgeActivatedHat(this.opcode)) {
            // If this is an edge-activated hat, only proceed if
            // the value is true and used to be false.
            var oldEdgeValue = this.runtime.updateEdgeActivatedValue(
                this.currentBlockId,
                resolvedValue
            );
            var edgeWasActivated = !oldEdgeValue && resolvedValue;
            if (!edgeWasActivated) {
                this.sequencer.retireThread(this.thread);
            }
        } else {
            // Not an edge-activated hat: retire the thread
            // if predicate was false.
            if (!resolvedValue) {
                this.sequencer.retireThread(this.thread);
            }
        }
    } else {
        // In a non-hat, report the value visually if necessary if
        // at the top of the thread stack.
        if (typeof resolvedValue !== 'undefined' && this.thread.atStackTop()) {
            this.runtime.visualReport(this.currentBlockId, resolvedValue);
        }
        // Finished any yields.
        this.thread.status = Thread.STATUS_RUNNING;
    }
};

module.exports = HandleReport;
