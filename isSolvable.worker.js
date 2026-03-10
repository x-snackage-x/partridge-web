import createModule from './solWASM/solWASM'

let Module

// Initialize the module once when the worker starts
createModule().then((instance) => {
    Module = instance
    self.postMessage({ type: 'READY' })
})

self.onmessage = async (event) => {
    const { type, message } = event.data;
    if (type === 'START_SEARCH') {
        // Run the long-running C function
        // Note: Use your existing bridge logic (malloc, etc.) here if needed

        let my_puzzle_copy_ptr = Module._malloc(message.puzzleStruct_size)
        Module.setValue(my_puzzle_copy_ptr, message.puzzleType, 'i32')

        Module._init_puzzle(my_puzzle_copy_ptr, true)
        message.journalEntries.forEach(elem => {
            Module._place_block(my_puzzle_copy_ptr, elem.tileType, elem.xPos, elem.yPos)
        })

        Module._setup(my_puzzle_copy_ptr)
        const result = Module._solution_search()

        Module._free_puzzle(my_puzzle_copy_ptr)
        Module._free(my_puzzle_copy_ptr)

        // Send the boolean result back to the main thread
        self.postMessage({ type: 'RESULT', message: result })
    }
}