import {
    Align, Direction,
    Edge, FlexDirection,
    Justify,
    Wrap, loadYoga
} from 'yoga-layout/load'

import createModule from './solWASM/solWASM'

import SolverWorker from './isSolvable.worker.js?worker';

let worker = null

const EVENT_SIZE = 4
const CAPACITY = 2 ** 16
const MASK = CAPACITY - 1
const RUN_ID = 0
const WRITE = 1
const READ = 2
const DATA = 3
const sharedRingBuffer = new SharedArrayBuffer(
    Int32Array.BYTES_PER_ELEMENT * (3 + EVENT_SIZE * CAPACITY))
const viewSharedRingBuffer = new Int32Array(sharedRingBuffer)
let bgBodyColor

let solverRunning = false
let actionLock = false
let reqFrameId = undefined

let trafficLightState = -1

let pressTimer = null

/** @type {HTMLCanvasElement} */
let canvas = null
let ctx = null
let canvasHeight = 0
let canvasWidth = 0

const xCanvasTransform = 2
const yCanvasTransform = 2

let puzzleType
let puzzleLength
let squareSide
let tilePoolStart
let tileUIElements = []
let tileSelectLocations = []

let tilePoolChanged = false
let selectionActive = false
let selectionTileOnGrid = false
let selectedTile = {}

let journalRemoveThresholdIndex

let puzzleStruct_size = 0
let puzJournalEntryStruct_size = 0
let Module
let my_puzzle_ptr = 0
let api

async function initializeModel() {
    Module = await createModule()

    puzzleStruct_size = Module.ccall('get_puzzle_def_size', 'number')
    my_puzzle_ptr = Module._malloc(puzzleStruct_size)

    puzJournalEntryStruct_size = Module.ccall('get_puz_entry_size', 'number')

    api = {
        initPuzzleModel: Module.cwrap('init_puzzle', 'void', ['pointer', 'Boolean']),
        freePuzzle: Module.cwrap('free_puzzle', 'void', ['pointer']),

        placeTile: Module.cwrap('place_block', 'number', ['pointer', 'number', 'number', 'number']),
        removeTile: Module.cwrap('remove_block', 'number', ['pointer', 'number', 'number', 'number']),

        getnAvailableTiles: Module.cwrap('get_n_available_pieces', 'number', ['pointer', 'number']),

        placementResolvable: Module.cwrap('placement_resolvable', 'Boolean', ['pointer', 'number', 'number', 'number']),
        isPuzzleSolved: Module.cwrap('is_puzzle_solved', 'Boolean', ['pointer']),
        getPuzJournalFirstEntryPtr: Module.cwrap('get_first_entry', 'pointer'),
        getPuzJournalSize: Module.cwrap('get_puz_journal_size', 'number'),

        setVisualizer: Module.cwrap('set_visualizer', 'void', ['pointer', 'pointer', 'pointer', 'pointer']),
        solutionSetup: Module.cwrap('setup', 'void', ['pointer']),
        solutionSearch: Module.cwrap('solution_search', 'Boolean', ['void'])
    }
}

function getTileColor(index) {
    if (index == 1) {
        return 'hsl(0, 0%, 85%)'
    }

    // Distribute hues evenly for 'n' tiles
    const hue = (index * (360 / puzzleType)) % 360;
    // Use consistent Saturation and Lightness for cohesion
    return `hsl(${hue}, 70%, 60%)`;
}

async function calculateTilePoolLayout(puzzleType) {
    if (puzzleType == 1) {
        return [{
            tileType: 1,
            elementWidth: squareSide,
            elementHeight: squareSide,
            computedLeft: tilePoolStart,
            computedTop: 10
        }]
    }

    let tileUIElements = new Array(puzzleType).fill().map((_, i) => i + 1)
    tileUIElements = tileUIElements.map(tileType => ({
        tileType,
        ...calculateTilePoolElement(tileType)
    }))

    const Yoga = await loadYoga()

    const config = Yoga.Config.create();
    config.setUseWebDefaults(false)

    const tilePool = Yoga.Node.create(config)
    tilePool.setWidth(canvasWidth - canvasHeight)
    tilePool.setHeight(canvasHeight)
    tilePool.setAlignItems(Align.Center)
    tilePool.setJustifyContent(Justify.Center)

    const boundingBox = Yoga.Node.create(config)
    boundingBox.setMaxWidth(canvasWidth - canvasHeight)
    boundingBox.setPadding(Edge.All, 5)
    boundingBox.setFlexDirection(FlexDirection.Row)
    boundingBox.setFlexWrap(Wrap.Wrap)
    boundingBox.setJustifyContent(Justify.Center)
    tilePool.insertChild(boundingBox, 0)

    let yogaNodes = []
    tileUIElements.forEach((elem, index) => {
        const node = Yoga.Node.create(config)
        node.setWidth(elem.elementWidth)
        node.setHeight(elem.elementHeight)
        node.setMargin(Edge.All, 5)
        yogaNodes.push({
            tileType: elem.tileType,
            yogaNode: node
        })
        boundingBox.insertChild(node, index)
    })

    tilePool.calculateLayout(canvasWidth - canvasHeight, canvasHeight, Direction.LTR)

    yogaNodes.forEach(elem => {
        tileUIElements[elem.tileType - 1]['computedLeft']
            = elem.yogaNode.getComputedLayout().left + canvasHeight +
            boundingBox.getComputedLeft()
        tileUIElements[elem.tileType - 1]['computedTop']
            = elem.yogaNode.getComputedLayout().top + boundingBox.getComputedTop()
    })

    tilePool.freeRecursive()

    return tileUIElements
}

async function initPuzzle(puzzleTypeIn) {
    journalRemoveThresholdIndex = 0
    puzzleType = puzzleTypeIn
    puzzleLength = puzzleType * (puzzleType + 1) / 2
    squareSide = Math.ceil(canvasHeight * 200 / puzzleLength) / 200
    let i = 0
    while (squareSide * puzzleLength > canvasHeight - 2) {
        squareSide -= canvasHeight / (200 * puzzleLength)
        i += 1
    }
    tilePoolStart = canvasHeight + 2.5

    if (worker == null) {
        startNewSolverWorker()
    } else {
        isSolvableButton.disabled = false
        findSolutionButton.disabled = false
        visualizerToggle.disabled = false
    }
    // scale down the puzzle for special case of 1
    if (puzzleType == 1) {
        squareSide *= 0.90
        tilePoolStart = squareSide + 10.5
    }

    trafficLightState = -5
    changeTrafficLight(-1)
    tileUIElements = await calculateTilePoolLayout(puzzleType)

    Module.setValue(my_puzzle_ptr, puzzleType, 'i32')
    api.initPuzzleModel(my_puzzle_ptr, true)
}

function translatePixelPosToGridPos(x, y, tileType) {
    let xTilePixelPosStart = x - Math.floor(tileType * squareSide / 2)
    let xTilePixelPosEnd = x + Math.floor(tileType * squareSide / 2) + 1

    let xSqu = Math.min(Math.max(Math.round(x / squareSide)
        - Math.round(tileType / 2), 0), puzzleLength)
    let ySqu = Math.min(Math.max(Math.round(y / squareSide)
        - Math.round(tileType / 2), 0), puzzleLength - tileType)

    if (tileType == 1) {
        xSqu = Math.floor(x / squareSide)
        ySqu = Math.floor(y / squareSide)
    }

    if (xTilePixelPosStart >= canvasHeight || xTilePixelPosEnd >= canvasHeight
        || (xSqu + tileType) * squareSide >= puzzleLength * squareSide) {
        xSqu = puzzleLength - tileType
    }

    return { xSqu, ySqu }
}

function drawTile(size, x, y, color) {
    ctx.fillStyle = color
    ctx.fillRect(x, y, size * squareSide, size * squareSide)
}

function drawTileOutline(size, x, y, lineWidth, color = "hsl(0, 83%, 45%)") {
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.strokeRect(x + 0.5, y + 0.5, size * squareSide - 0.5, size * squareSide - 0.5)
    ctx.lineWidth = 1.0
}

function placeTileGrid(size, xSqU, ySqU, color = getTileColor(size)) {
    drawTile(size, xSqU * squareSide, ySqU * squareSide, color)
}

function clearTilePool() {
    ctx.clearRect(tilePoolStart - 1 - xCanvasTransform,
        - yCanvasTransform
        , canvasWidth - tilePoolStart + 2 + xCanvasTransform
        , canvasHeight + 1 + yCanvasTransform)
}

function calculateTilePoolElement(size) {
    let fontSize = 25 > squareSide ? 25 : squareSide
    ctx.font = fontSize + "px monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle";

    let widthCorrection = 0
    const text = ctx.measureText("x" + size);
    if (size * squareSide < text.width) {
        widthCorrection = text.width + 5
    }

    let heightCorrection = 0
    if (size * squareSide < fontSize) {
        heightCorrection = fontSize - size * squareSide
    }

    let elementWidth = size * squareSide + widthCorrection
    let elementHeight = size * squareSide + heightCorrection

    return { elementWidth, elementHeight }
}

function drawTilePoolElement(x, y, size, number = 1) {
    let fontSize = 25 > squareSide ? 25 : squareSide
    if (puzzleType == 1) {
        fontSize = squareSide * 0.80
    }
    ctx.font = fontSize + "px monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle";

    let x_correction = - size * squareSide / 2
    let widthCorrection = 0
    const text = ctx.measureText("x" + number);
    if (size * squareSide < text.width) {
        widthCorrection = text.width + 5
        x_correction = widthCorrection - text.width / 2
    }

    let heightCorrection = 0
    if (size * squareSide < fontSize) {
        heightCorrection = fontSize - size * squareSide
    }

    drawTile(size, x, y + heightCorrection / 2, getTileColor(size))
    let thisTileSelectLoc = {
        xStart: x,
        xEnd: Math.ceil(x + size * squareSide),
        yStart: Math.ceil(y + heightCorrection / 2),
        yEnd: Math.ceil(y + heightCorrection / 2 + size * squareSide),
        type: size,
        xShift: - size * squareSide / 2,
        yShift: - size * squareSide / 2,
        xSqU: -1,
        ySqU: -1,
    }
    tileSelectLocations.push(thisTileSelectLoc)

    ctx.fillStyle = "white"
    ctx.fillText("x" + number,
        x + size * squareSide + x_correction,
        y + (size * squareSide + heightCorrection) / 2);

    let elementWidth = size * squareSide + widthCorrection
    let elementHeight = size * squareSide + heightCorrection

    return { elementWidth, elementHeight }
}

function drawTilePool() {
    ctx.strokeStyle = "grey"
    tileUIElements.forEach(elem => {
        let tileNumber = api.getnAvailableTiles(my_puzzle_ptr, elem.tileType)
        drawTilePoolElement(elem.computedLeft, elem.computedTop,
            elem.tileType, tileNumber)
    })
}

function clearGridInSqUnits(size = puzzleLength, xSqU = 0, ySqU = 0) {
    ctx.clearRect(xSqU * squareSide - 1 - xCanvasTransform,
        ySqU * squareSide - 1 - yCanvasTransform,
        size * squareSide + 3 + xCanvasTransform,
        canvasHeight + 3 + yCanvasTransform)
}

function drawGridInSqUnits(size = puzzleLength, xSqU = 0, ySqU = 0) {
    ctx.strokeStyle = "grey"
    for (let i = 0; i <= size; ++i) {
        ctx.beginPath()
        ctx.moveTo(xSqU * squareSide, (ySqU + i) * squareSide)
        ctx.lineTo((xSqU + size) * squareSide, (ySqU + i) * squareSide)
        ctx.closePath()
        ctx.stroke()
    }

    for (let i = 0; i <= size; ++i) {
        ctx.beginPath()
        ctx.moveTo((xSqU + i) * squareSide, ySqU * squareSide)
        ctx.lineTo((xSqU + i) * squareSide, (ySqU + size) * squareSide)
        ctx.closePath()
        ctx.stroke()
    }
}

function getJournalEntries() {
    let entries = []
    let puzzleJournalFirstEntry_ptr = api.getPuzJournalFirstEntryPtr()
    let puzzleJournalSize = api.getPuzJournalSize()

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

    return entries
}

function drawPuzzleFromJournal() {
    getJournalEntries().forEach((elem, index) => {
        if (index < journalRemoveThresholdIndex) {
            placeTileGrid(...Object.values(elem), "black")
        } else {
            placeTileGrid(...Object.values(elem))
        }
    })
}

function getTileSelectAtPos(x, y) {
    return tileSelectLocations.find(i =>
        x >= i.xStart && x <= i.xEnd && y >= i.yStart && y <= i.yEnd
    )
}

function getTilePlacedAtPos(x, y) {
    return getJournalEntries().reduce((acc, entry, index) => {
        if (x >= entry.xPos * squareSide && x <= (entry.xPos + entry.tileType) * squareSide &&
            y >= entry.yPos * squareSide && y <= (entry.yPos + entry.tileType) * squareSide) {
            acc.entry = entry
            acc.index = index
        }
        return acc
    }, { entry: undefined, index: -1 })
}

function changeTrafficLight(changeTo) {
    switch (changeTo) {
        case -1:
        default:
            if (trafficLightState == -5 || trafficLightState == 0 || trafficLightState == 1) {
                document.getElementById("sign")
                    .setAttribute("fill", "grey")
                document.getElementById("sign").setAttribute("stroke-width", "0")
                document.getElementById("spinner").setAttribute("stroke-width", "0")
                trafficLightState = -1
            }
            break;
        case -2:
            document.getElementById("sign")
                .setAttribute("fill", "grey")
            document.getElementById("sign").setAttribute("stroke-width", "0")
            document.getElementById("spinner").setAttribute("stroke-width", "3")
            trafficLightState = -2
            break;
        case 0:
            document.getElementById("sign")
                .setAttribute("fill", "hsl(0, 83%, 45%)")
            document.getElementById("sign").setAttribute("stroke-width", "1")
            document.getElementById("spinner").setAttribute("stroke-width", "0")
            trafficLightState = 0
            break;
        case 1:
            document.getElementById("sign")
                .setAttribute("fill", "hsl(130, 59%, 40%)")
            document.getElementById("sign").setAttribute("stroke-width", "1")
            document.getElementById("spinner").setAttribute("stroke-width", "0")
            trafficLightState = 1
            break;
    }
}

function handlePointerLeave() {
    selectionActive = false
    selectedTile = false

    clearTilePool()
    drawTilePool()

    if (selectionTileOnGrid) {
        clearGridInSqUnits()
        drawGridInSqUnits()
        drawPuzzleFromJournal()
        selectionTileOnGrid = false
    }
}

function handlePointerMove(event) {
    const rect = canvas.getBoundingClientRect()
    const x = event.pageX - rect.left - scrollX
    const y = event.pageY - rect.top - scrollY

    if (tilePoolChanged) {
        clearTilePool()
        drawTilePool()
    }

    if (selectionActive) {
        if (selectionTileOnGrid) {
            clearGridInSqUnits()
            drawGridInSqUnits()
            drawPuzzleFromJournal()
        }

        let tileType = selectedTile.type
        let xRenderPos = x + selectedTile.xShift
        let yRenderPos = y + selectedTile.yShift
        let { xSqu, ySqu } = translatePixelPosToGridPos(x, y, tileType)

        if (xRenderPos >= tilePoolStart) {
            drawTile(tileType, xRenderPos, yRenderPos, getTileColor(tileType))
            selectionTileOnGrid = false
            tilePoolChanged = true
        } else {
            selectionTileOnGrid = true
            selectedTile.xSqU = xSqu
            selectedTile.ySqU = ySqu
            drawPuzzleFromJournal()
            placeTileGrid(tileType, xSqu, ySqu)

            if (!api.placementResolvable(my_puzzle_ptr, tileType, xSqu, ySqu)) {
                drawTileOutline(tileType, xSqu * squareSide, ySqu * squareSide, 3.0)
            }
        }
    } else {
        const foundTile = getTileSelectAtPos(x, y)
        if (foundTile) {
            let tileFree = api.getnAvailableTiles(my_puzzle_ptr, foundTile.type)
            if (tileFree > 0) {
                drawTileOutline(foundTile.type, foundTile.xStart, foundTile.yStart, 3.0, "hsl(123, 27%, 43%)")
            }
            tilePoolChanged = true
        }
    }
}

function handlePointerDown(event) {
    if (actionLock) {
        return
    }

    const rect = canvas.getBoundingClientRect()
    const x = event.pageX - rect.left - scrollX
    const y = event.pageY - rect.top - scrollY
    const foundSelectTile = getTileSelectAtPos(x, y)
    const { entry: foundPlacedTile, index: placementIndex } = getTilePlacedAtPos(x, y)

    if (foundSelectTile) {
        let foundTileAvailNumber = api.getnAvailableTiles(my_puzzle_ptr, foundSelectTile.type)
        if (foundTileAvailNumber > 0) {
            selectionActive = true
            selectedTile = foundSelectTile
        }
    }

    if (foundPlacedTile && placementIndex >= journalRemoveThresholdIndex) {
        selectionActive = true
        selectionTileOnGrid = true
        selectedTile = {
            xStart: foundPlacedTile.xPos * squareSide,
            xEnd: (foundPlacedTile.xPos + foundPlacedTile.tileType) * squareSide,
            yStart: foundPlacedTile.yPos * squareSide,
            yEnd: (foundPlacedTile.yPos + foundPlacedTile.tileType) * squareSide,
            type: foundPlacedTile.tileType,
            xShift: - foundPlacedTile.tileType * squareSide / 2,
            yShift: - foundPlacedTile.tileType * squareSide / 2,
            xSqU: foundPlacedTile.xPos,
            ySqU: foundPlacedTile.yPos,
        }
        api.removeTile(my_puzzle_ptr, selectedTile.type, selectedTile.xSqU, selectedTile.ySqU)
        changeTrafficLight(-1)
    }
}

function handlePointerUp() {
    if (selectionTileOnGrid) {
        let returnCode = api.placeTile(my_puzzle_ptr, selectedTile.type, selectedTile.xSqU, selectedTile.ySqU)
        if (returnCode != 0) {
            clearGridInSqUnits()
            drawGridInSqUnits()
            drawPuzzleFromJournal()
        } else {
            changeTrafficLight(-1)
        }
        selectionTileOnGrid = false

        if (api.isPuzzleSolved(my_puzzle_ptr)) {
            changeTrafficLight(1)
        }
    }
    selectionActive = false
    selectedTile = false
}

function initCanvas() {
    let bodyStyle = window.getComputedStyle(document.body, null);
    bgBodyColor = bodyStyle.backgroundColor

    canvas = document.getElementById("canvas")
    ctx = canvas.getContext("2d")

    // Get the DPR and size of the canvas
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()

    canvasHeight = Math.round(rect.height)
    canvasWidth = Math.round(rect.width)

    // Set the "actual" size of the canvas
    canvas.height = canvasHeight * dpr
    canvas.width = canvasWidth * dpr

    // Set the "drawn" size of the canvas
    canvas.style.height = `${canvasHeight}px`
    canvas.style.width = `${canvasWidth}px`

    // Shift origin by a few pixels to not clash with edge and
    // Scale the context to ensure correct drawing operations
    ctx.setTransform(
        dpr, 0,
        0, dpr,
        xCanvasTransform * dpr,
        yCanvasTransform * dpr
    )

    canvas.addEventListener("pointerleave", () => {
        if (puzzleTypeInput.valueAsNumber > 16) {
            return
        }
        clearTimeout(pressTimer)
        handlePointerLeave()
    })

    canvas.addEventListener("pointermove", (event) => {
        if (puzzleTypeInput.valueAsNumber > 16) {
            return
        }
        handlePointerMove(event)
    })

    canvas.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "touch") {
            handlePointerDown(event)
            return
        }

        pressTimer = setTimeout(() => {
            document.body.classList.add("no-scroll")
            canvas.setPointerCapture(event.pointerId)
            handlePointerDown(event)
        }, 100);
    })

    canvas.addEventListener("pointerup", (event) => {
        handlePointerUp()
        clearTimeout(pressTimer)
        canvas.releasePointerCapture(event.pointerId)
        document.body.classList.remove("no-scroll")
    })
}

function popEvents() {
    let count = 0

    let read = Atomics.load(viewSharedRingBuffer, READ)
    let write = Atomics.load(viewSharedRingBuffer, WRITE)

    if (read - write > CAPACITY) {
        read = write - CAPACITY
    }

    ctx.beginPath()

    while (read < write && count < 5000 && actionLock) {
        if ((count & 255) === 0) {
            write = Atomics.load(viewSharedRingBuffer, WRITE)
        }

        const slot = DATA + (read & MASK) * EVENT_SIZE

        const type = viewSharedRingBuffer[slot + 0]
        const size = viewSharedRingBuffer[slot + 1]
        const xSqU = viewSharedRingBuffer[slot + 2]
        const ySqU = viewSharedRingBuffer[slot + 3]

        let x = (xSqU * squareSide) | 0
        let y = (ySqU * squareSide) | 0
        let sideLength = (size * squareSide) | 0

        if (type === 1) {
            ctx.fillStyle = getTileColor(size)
            ctx.fillRect(x, y, sideLength, sideLength)
        } else {
            ctx.fillStyle = bgBodyColor
            ctx.fillRect(x - 0.5, y - 0.5, sideLength + 1, sideLength + 1)
        }

        read++
        count++
    }

    drawTileOutline(puzzleLength, 0, 0, 2, "grey")

    Atomics.store(viewSharedRingBuffer, READ, read)
}

function visualizerAnimationLoop() {
    reqFrameId = undefined
    popEvents()
    startVisAnimLoop()
}

function startVisAnimLoop() {
    if (!reqFrameId) {
        reqFrameId = requestAnimationFrame(visualizerAnimationLoop)
    }
}

function stopVisAnimLoop() {
    if (reqFrameId) {
        cancelAnimationFrame(reqFrameId);
        reqFrameId = undefined;
    }
}

function triggerSolver(withResults) {
    solverRunning = true
    changeTrafficLight(-2)
    if (!withResults) {
        visualizerToggle.checked = false
    }

    journalRemoveThresholdIndex = api.getPuzJournalSize()
    let dataObj = {
        puzzleStruct_size: puzzleStruct_size,
        puzzleType: puzzleType,
        journalEntries: getJournalEntries(),
        withResults: withResults,
        withVisualizer: visualizerToggle.checked,
    }

    drawPuzzleFromJournal()
    puzzleTypeInput.disabled = true
    puzzleTypeInputPlus.disabled = true
    puzzleTypeInputMinus.disabled = true
    isSolvableButton.disabled = true
    findSolutionButton.disabled = true
    visualizerToggle.disabled = true

    worker.postMessage({ type: 'START_SEARCH', message: dataObj })

    if (visualizerToggle.checked) {
        actionLock = true
        clearGridInSqUnits()
        drawPuzzleFromJournal()
        startVisAnimLoop()
    }
}

function setUpSharedRingBuffer() {
    let consts = {
        EVENT_SIZE,
        CAPACITY,
        RUN_ID,
        WRITE,
        READ,
        DATA,
    }
    worker.postMessage({ type: 'TRANSF_CONSTS', message: consts })
    worker.postMessage({ type: 'INIT_SRB', message: sharedRingBuffer })
}

function startNewSolverWorker() {
    if (worker) {
        worker.terminate()
    }

    worker = new SolverWorker()

    // Listen for messages from the worker
    worker.onmessage = (event) => {
        const { type, message } = event.data;
        if (type === 'READY') {
            // Enable button once WASM is loaded
            isSolvableButton.disabled = false
            findSolutionButton.disabled = false
            visualizerToggle.disabled = false

            setUpSharedRingBuffer()
        } else if (type === 'RESULT') {
            stopVisAnimLoop()
            solverRunning = false
            actionLock = false

            let write = Atomics.load(viewSharedRingBuffer, WRITE)
            Atomics.store(viewSharedRingBuffer, READ, write)

            const { result, entries, solveTime } = message
            journalRemoveThresholdIndex = 0

            puzzleTypeInput.disabled = false
            puzzleTypeInputPlus.disabled = false
            puzzleTypeInputMinus.disabled = false
            isSolvableButton.disabled = false
            findSolutionButton.disabled = false
            visualizerToggle.disabled = false

            if (selectionTileOnGrid) {
                selectionActive = false
                selectionTileOnGrid = false
            }

            console.log(`Solve Time: ${solveTime / 1000.0}s`)
            changeTrafficLight(result)
            clearGridInSqUnits()
            drawGridInSqUnits()
            drawPuzzleFromJournal()
            entries.forEach(elem => {
                placeTileGrid(...Object.values(elem))
            })
        }
    };
}

const puzzleTypeInput = document.getElementById("puzzleTypeInput")
puzzleTypeInput.addEventListener("change", () => {
    isSolvableButton.disabled = true
    findSolutionButton.disabled = true
    visualizerToggle.disabled = true

    ctx.clearRect(0 - xCanvasTransform, 0 - yCanvasTransform,
        canvasWidth, canvasHeight)

    if (!puzzleTypeInput.valueAsNumber) {
        puzzleTypeInput.value = 8
    }

    if (puzzleTypeInput.valueAsNumber > 16) {
        ctx.font = 18 + "px monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillStyle = "white"
        let text_1 = "Trying to find a solution for a size greater than 10 is already excessive."
        let text_2 = "Let alone over 16. I refuse to entertain such an absurd demand."
        let text_3 = "(This has nothing to do with the solver only allocating 16 bits for the tile-type bitmask)"
        ctx.fillText(text_1, canvasWidth / 2, canvasHeight / 2)
        ctx.fillText(text_2, canvasWidth / 2, canvasHeight / 2 + 24)
        ctx.font = 14 + "px monospace"
        ctx.fillText(text_3, canvasWidth / 2, canvasHeight / 2 + 100)
        return
    }

    api.freePuzzle(my_puzzle_ptr)
    Module.setValue(my_puzzle_ptr, 0, 'i32')
    initPuzzle(puzzleTypeInput.valueAsNumber).then(() => {
        clearGridInSqUnits()
        drawGridInSqUnits()
        drawTilePool()
    })
    tileSelectLocations = []
})

const puzzleTypeInputPlus = document.getElementById("puzzleTypeInputPlus")
puzzleTypeInputPlus.addEventListener("click", () => {
    let currentPuzzleType = puzzleTypeInput.valueAsNumber
    currentPuzzleType = currentPuzzleType > 16 ? 8 : currentPuzzleType
    currentPuzzleType = (++currentPuzzleType) % 17
    puzzleTypeInput.value = currentPuzzleType == 0 ? 1 : currentPuzzleType
    puzzleTypeInput.dispatchEvent(new Event('change'));
})
const puzzleTypeInputMinus = document.getElementById("puzzleTypeInputMinus")
puzzleTypeInputMinus.addEventListener("click", () => {
    let currentPuzzleType = puzzleTypeInput.valueAsNumber
    currentPuzzleType = currentPuzzleType > 16 ? 8 : currentPuzzleType
    currentPuzzleType = (--currentPuzzleType) % 17
    puzzleTypeInput.value = currentPuzzleType == 0 ? 16 : currentPuzzleType
    puzzleTypeInput.dispatchEvent(new Event('change'));
})


const isSolvableButton = document.getElementById("isSolvableButton")
isSolvableButton.disabled = true
isSolvableButton.addEventListener("click", () => {
    triggerSolver(false)
})

const visualizerToggle = document.getElementById("visualizerToggle")
visualizerToggle.disabled = true
const findSolutionButton = document.getElementById("findSolutionButton")
findSolutionButton.disabled = true
findSolutionButton.addEventListener("click", () => {
    triggerSolver(true)
})

const cancelSolButton = document.getElementById("cancelSolve")
cancelSolButton.addEventListener("mouseover", (event) => {
    if (isSolvableButton.disabled) {
        cancelSolButton.style.opacity = 1
    }
})
cancelSolButton.addEventListener("mouseout", (event) => {
    cancelSolButton.style.opacity = 0
})

cancelSolButton.addEventListener("click", () => {
    if (!solverRunning) {
        return
    }

    startNewSolverWorker()

    if (visualizerToggle.checked) {
        stopVisAnimLoop()
        actionLock = false

        Atomics.add(viewSharedRingBuffer, RUN_ID, 1)
        let write = Atomics.load(viewSharedRingBuffer, WRITE)
        Atomics.store(viewSharedRingBuffer, READ, write)

        visualizerToggle.checked = false
    }

    puzzleTypeInput.disabled = false
    puzzleTypeInputPlus.disabled = false
    puzzleTypeInputMinus.disabled = false
    journalRemoveThresholdIndex = 0
    trafficLightState = -5
    if (isSolvableButton.disabled) { changeTrafficLight(-1) }
    clearGridInSqUnits()
    drawGridInSqUnits()
    drawPuzzleFromJournal()
})

let collButton = document.getElementsByClassName("collapsible")[0]
const content = document.querySelector(".text");

collButton.addEventListener("click", function () {
    this.classList.toggle("active");
    content.classList.toggle("open");
});

initCanvas()
await initializeModel()

await initPuzzle(puzzleTypeInput.valueAsNumber)
drawGridInSqUnits()
drawTilePool()
