var log = require('../util/log');
var Thread = require('./thread');
var HandleReport = require('./handle-report');

/**
 * Utility function to determine if a value is a Promise.
 * @param {*} value Value to check for a Promise.
 * @return {boolean} True if the value appears to be a Promise.
 */
var isPromise = function (value) {
    return value != null && value.then && typeof value.then === 'function';
};

/**
 * Execute a block.
 * @param {!Sequencer} sequencer Which sequencer is executing.
 * @param {!Thread} thread Thread which to read and execute.
 */
var execute = function (sequencer, thread) {

    var runtime = sequencer.runtime;
    var target = thread.target;

    // Stop if block or target no longer exists.
    if (target == null) {
        // No block found: stop the thread; script no longer exists.
        sequencer.retireThread(thread);
        return;
    }

    // Current block to execute is the one on the top of the stack.
    var currentStackFrame = thread.stack;
    var currentBlockId = currentStackFrame.blockId;

    var blockContainer = target.blocks;
    var block = blockContainer.getBlock(currentBlockId);
    if (block === undefined) {
        blockContainer = runtime.flyoutBlocks;
        block = blockContainer.getBlock(currentBlockId);
        // Stop if block or target no longer exists.
        if (block === undefined) {
            // No block found: stop the thread; script no longer exists.
            sequencer.retireThread(thread);
            return;
        }
    }

    // if (eCount++ % 1000==0) {   // 603,000 times!!
    //     console.log('Execute x' + eCount);
    // }

    //    var block = blockContainer.getBlock(currentBlockId);
    var opcode = block.opcode; // blockContainer.getOpcode(currentBlockId);
    var fields = block.fields; // blockContainer.getFields(currentBlockId);
    var inputs = blockContainer.getInputs(block);
    var blockFunction = runtime.getOpcodeFunction(opcode);
    var isHat = runtime.getIsHat(opcode);


    if (!opcode) {
        log.warn('Could not get opcode for block: ' + currentBlockId);
        return;
    }

    var handleReportObject = new HandleReport(
        sequencer, runtime, thread, blockContainer, currentStackFrame.executionContext,
        target, opcode, currentBlockId, isHat);

    // Hats and single-field shadows are implemented slightly differently
    // from regular blocks.
    // For hats: if they have an associated block function,
    // it's treated as a predicate; if not, execution will proceed as a no-op.
    // For single-field shadows: If the block has a single field, and no inputs,
    // immediately return the value of the field.
    if (blockFunction == null) {
        if (isHat) {
            // Skip through the block (hat with no predicate).
            return;
        }
        var keys = Object.keys(fields);
        if (keys.length === 1 && Object.keys(inputs).length === 0) {
            // One field and no inputs - treat as arg.
            handleReportObject.handleReport(fields[keys[0]].value);
        } else {
            log.warn('Could not get implementation for opcode: ' + opcode);
        }
        thread.requestScriptGlowInFrame = true;
        return;
    }

    // Generate values for arguments (inputs).
    var argValues = {};

    // Add all fields on this block to the argValues.
    for (var fieldName in fields) {
        argValues[fieldName] = fields[fieldName].value;
    }

    // Recursively evaluate input blocks.
    for (var inputName in inputs) {
        var input = inputs[inputName];
        var inputBlockId = input.block;
        // Is there no value for this input waiting in the stack frame?
        if (inputBlockId != null && typeof currentStackFrame.reported[inputName] === 'undefined') {
            // If there's not, we need to evaluate the block.
            // Push to the stack to evaluate the reporter block.

            var inpBlock = input.blockCached;
            if (inpBlock !== undefined && inpBlock.opcode === 'math_number') {
                argValues[inputName] = inpBlock.fields.NUM.value;
                continue;
            }

            thread.pushStack(inputBlockId);
            // Save name of input for `Thread.pushReportedValue`.
            currentStackFrame.waitingReporter = inputName;
            // Actually execute the block.
            execute(sequencer, thread);
            if (thread.status === Thread.STATUS_PROMISE_WAIT) {
                return;
            }

            // Execution returned immediately,
            // and presumably a value was reported, so pop the stack.
            currentStackFrame.waitingReporter = null;
            thread.popStack();
        }
        argValues[inputName] = currentStackFrame.reported[inputName];
    }

    // Add any mutation to args (e.g., for procedures).
    var mutation = blockContainer.getMutation(block);
    if (mutation !== null) {
        argValues.mutation = mutation;
    }

    // If we've gotten this far, all of the input blocks are evaluated,
    // and `argValues` is fully populated. So, execute the block primitive.
    // First, clear `currentStackFrame.reported`, so any subsequent execution
    // (e.g., on return from a branch) gets fresh inputs.
    currentStackFrame.reported = {};

    var primitiveReportedValue = blockFunction(argValues, handleReportObject);

    if (typeof primitiveReportedValue === 'undefined') {
        // No value reported - potentially a command block.
        // Edge-activated hats don't request a glow; all commands do.
        thread.requestScriptGlowInFrame = true;
    }

    // If it's a promise, wait until promise resolves.
    if (isPromise(primitiveReportedValue)) {
        if (thread.status === Thread.STATUS_RUNNING) {
            // Primitive returned a promise; automatically yield thread.
            thread.status = Thread.STATUS_PROMISE_WAIT;
        }
        // Promise handlers
        primitiveReportedValue.then(function (resolvedValue) {
            handleReportObject.handleReport(resolvedValue);
            if (typeof resolvedValue === 'undefined') {
                var popped = thread.popStack();
                var nextBlockId = thread.target.blocks.getNextBlock(popped);
                thread.pushStack(nextBlockId);
            } else {
                thread.popStack();
            }
        }, function (rejectionReason) {
            // Promise rejected: the primitive had some error.
            // Log it and proceed.
            log.warn('Primitive rejected promise: ', rejectionReason);
            thread.status = Thread.STATUS_RUNNING;
            thread.popStack();
        });
    } else if (thread.status === Thread.STATUS_RUNNING) {
        handleReportObject.handleReport(primitiveReportedValue);
    }
};

module.exports = execute;
