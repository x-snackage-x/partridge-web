import createModule from './solWASM/solWASM'

let Module
let viewSharedRingBuffer

let EVENT_SIZE
let CAPACITY
let WRITE
let READ
let DATA

function pushEvent(type, size, xSqU, ySqU) {
    const write = Atomics.load(viewSharedRingBuffer, WRITE)
    const read = Atomics.load(viewSharedRingBuffer, READ)

    if (write - read >= CAPACITY) {
        return
    }

    const slot = DATA + (write % CAPACITY) * EVENT_SIZE

    viewSharedRingBuffer[slot + 0] = type
    viewSharedRingBuffer[slot + 1] = size
    viewSharedRingBuffer[slot + 2] = xSqU
    viewSharedRingBuffer[slot + 3] = ySqU

    Atomics.store(viewSharedRingBuffer, WRITE, write + 1)
}

function theNullFunction(aNumber) {
    return
}

function placeTileEvent(size, xSqU, ySqU) {
    pushEvent(1, size, xSqU, ySqU)
}

function removeTileEvent(size, xSqU, ySqU) {
    pushEvent(0, size, xSqU, ySqU)
}

// Initialize the module once when the worker starts
createModule().then((instance) => {
    Module = instance

    let aNullFunction_ptr = Module.addFunction(theNullFunction, 'vi')
    let placeBlock_ptr = Module.addFunction(placeTileEvent, 'viii')
    let removeBlock_ptr = Module.addFunction(removeTileEvent, 'viii')

    Module._set_visualizer(aNullFunction_ptr, aNullFunction_ptr,
        placeBlock_ptr, removeBlock_ptr)

    self.postMessage({ type: 'READY' })
})

self.onmessage = async (event) => {
    const { type, message } = event.data;
    if (type === 'START_SEARCH') {

        if (message.withVisualizer) {
            Module._visualizer_on()
        } else {
            Module._visualizer_off()
        }

        let my_puzzle_copy_ptr = Module._malloc(message.puzzleStruct_size)
        Module.setValue(my_puzzle_copy_ptr, message.puzzleType, 'i32')

        Module._init_puzzle(my_puzzle_copy_ptr, true)
        message.journalEntries.forEach(elem => {
            Module._place_block(my_puzzle_copy_ptr, elem.tileType, elem.xPos, elem.yPos)
        })

        Module._setup(my_puzzle_copy_ptr)
        // Running long-running C function
        const startTime = performance.now()
        const result = Module._solution_search()
        const endTime = performance.now()

        const entries = []
        if (result && message.withResults) {
            let puzzleJournalFirstEntry_ptr = Module._get_first_entry()
            let puzzleJournalSize = Module._get_puz_journal_size()
            let puzJournalEntryStruct_size = Module._get_puz_entry_size()

            for (let i = 0; i < puzzleJournalSize; ++i) {
                let tileType = Module.getValue(puzzleJournalFirstEntry_ptr
                    + i * puzJournalEntryStruct_size
                    + 0 * puzJournalEntryStruct_size / 3, 'i32')
                let xPos = Module.getValue(puzzleJournalFirstEntry_ptr
                    + i * puzJournalEntryStruct_size
                    + 1 * puzJournalEntryStruct_size / 3, 'i32')
                let yPos = Module.getValue(puzzleJournalFirstEntry_ptr
                    + i * puzJournalEntryStruct_size
                    + 2 * puzJournalEntryStruct_size / 3, 'i32')
                entries.push({ tileType, xPos, yPos })
            }
        }

        let messageObj = {
            result: result,
            entries: entries,
            solveTime: endTime - startTime,
        }

        Module._free_puzzle(my_puzzle_copy_ptr)
        Module._free(my_puzzle_copy_ptr)

        // Send the boolean result back to the main thread
        self.postMessage({ type: 'RESULT', message: messageObj })
    } else if (type === 'TRANSF_CONSTS') {
        EVENT_SIZE = message.EVENT_SIZE
        CAPACITY = message.CAPACITY
        WRITE = message.WRITE
        READ = message.READ
        DATA = message.DATA
    } else if (type === 'INIT_SRB') {
        viewSharedRingBuffer = new Int32Array(message)
        self.postMessage({ type: 'SRB_READY' })
    }
}