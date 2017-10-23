class StackFrame {
    constructor(warpMode) {
        this.isLoop = false;            // Whether this level of the stack is a loop.
        this.warpMode = warpMode;       // Whether this level is in warp mode.
        this.reported = {};             // Collects reported input values.
        this.waitingReporter = null;    // Name of waiting reporter.
        this.params = {};               // Procedure parameters.
        this.executionContext = {};     // A context passed to block implementations.
    }
}

module.exports = StackFrame;
