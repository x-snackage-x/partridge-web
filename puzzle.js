import {
    Align, Direction,
    Edge, FlexDirection,
    Justify,
    Wrap, loadYoga
} from 'yoga-layout/load'

import createModule from './solWASM/solWASM'

/** @type {HTMLCanvasElement} */
let canvas = null
let ctx = null
let canvasHeight = 0
let canvasWidth = 0

let puzzleType
let puzzleLength
let squareSide
let tilePoolStart
let tileUIElements
let tileSelectLocations = []

let selectionActive = false
let selectionTileOnGrid = false
let selectedTile = {}


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
    puzzleType = puzzleTypeIn
    puzzleLength = puzzleType * (puzzleType + 1) / 2
    squareSide = Math.floor(canvasHeight * 5 / puzzleLength) / 5
    tilePoolStart = canvasHeight + 2.5

    // scale down the puzzle for special case of 1 and 2
    if (puzzleType == 1) {
        squareSide *= 0.82
        tilePoolStart = squareSide + 10.5
    } else if (puzzleType == 2) {
        squareSide *= 0.97
        puzzleLength = puzzleType * (puzzleType + 1) / 2
        tilePoolStart = squareSide * puzzleLength + 10.5
    }

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

function drawTile(size, x, y, color = "black") {
    ctx.fillStyle = color
    ctx.fillRect(x, y, size * squareSide, size * squareSide)
}

function placeTileGrid(size, xSqU, ySqU) {
    drawTile(size, xSqU * squareSide, ySqU * squareSide)
}

function clearTilePool() {
    ctx.clearRect(tilePoolStart - 1, 0
        , canvasWidth - tilePoolStart + 2
        , canvasHeight + 1)
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

    drawTile(size, x, y + heightCorrection / 2)
    let thisTileSelectLoc = {
        xStart: x,
        xEnd: x + size * squareSide,
        yStart: y + heightCorrection / 2,
        yEnd: y + heightCorrection / 2 + size * squareSide,
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

function clearGridInSqUnits(xSqU = 0, ySqU = 0, size = puzzleLength) {
    ctx.clearRect(xSqU * squareSide - 1, ySqU * squareSide - 1,
        size * squareSide + 2, size * squareSide + 2)
}

function drawGridInSqUnits(xSqU = 0, ySqU = 0, size = puzzleLength) {
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
    getJournalEntries().forEach(elem => {
        placeTileGrid(...Object.values(elem))
    })
}

function getTileSelectAtPos(x, y) {
    return tileSelectLocations.find(i =>
        x >= i.xStart && x <= i.xEnd && y >= i.yStart && y <= i.yEnd)
}

/*         console.log(x, y)
        console.log(entry.xPos * squareSide, (entry.xPos + entry.tileType) * squareSide)
        console.log(entry.yPos * squareSide, (entry.yPos + entry.tileType) * squareSide) */
function getTilePlacedAtPos(x, y) {
    return getJournalEntries().find(entry =>
        x >= entry.xPos * squareSide && x <= (entry.xPos + entry.tileType) * squareSide &&
        y >= entry.yPos * squareSide && y <= (entry.yPos + entry.tileType) * squareSide
    )
}

function handlePointerLeave(event) {
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
    clearTilePool()
    const rect = canvas.getBoundingClientRect()
    const x = event.pageX - rect.left - scrollX
    const y = event.pageY - rect.top - scrollY

    drawTilePool()

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
            drawTile(tileType, xRenderPos, yRenderPos, "green")
            selectionTileOnGrid = false
        } else {
            selectionTileOnGrid = true
            selectedTile.xSqU = xSqu
            selectedTile.ySqU = ySqu
            drawPuzzleFromJournal()
            placeTileGrid(tileType, xSqu, ySqu)
        }
    } else {
        const foundTile = getTileSelectAtPos(x, y)
        if (foundTile) {
            drawTile(foundTile.type, foundTile.xStart, foundTile.yStart, "red")
        }
    }
}

function handlePointerDown(event) {
    const rect = canvas.getBoundingClientRect()
    const x = event.pageX - rect.left - scrollX
    const y = event.pageY - rect.top - scrollY
    const foundSelectTile = getTileSelectAtPos(x, y)
    //TODO: fix
    const foundPlacedTile = getTilePlacedAtPos(x, y)
    if (foundSelectTile) {
        let foundTileAvailNumber = api.getnAvailableTiles(my_puzzle_ptr, foundSelectTile.type)
        if (foundTileAvailNumber > 0) {
            selectionActive = true
            selectedTile = foundSelectTile
        }
    }

    if (foundPlacedTile) {
        selectionActive = true
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
        let returnCode = api.removeTile(my_puzzle_ptr, selectedTile.type, selectedTile.xSqU, selectedTile.ySqU)
    }
}

function handlePointerUp(event) {
    if (selectionTileOnGrid) {
        let returnCode = api.placeTile(my_puzzle_ptr, selectedTile.type, selectedTile.xSqU, selectedTile.ySqU)
        if (returnCode != 0) {
            clearGridInSqUnits()
            drawGridInSqUnits()
            drawPuzzleFromJournal()
        }
        selectionTileOnGrid = false
    }
    selectionActive = false
    selectedTile = false
}

function initCanvas() {
    canvas = document.getElementById("canvas")
    ctx = canvas.getContext("2d")

    // Get the DPR and size of the canvas
    const dpr = window.devicePixelRatio;
    const rect = canvas.getBoundingClientRect();

    // Set the "actual" size of the canvas
    canvas.height = rect.height * dpr;
    canvas.width = rect.width * dpr;

    canvasHeight = Number(canvas.getAttribute("Height"))
    canvasWidth = Number(canvas.getAttribute("Width"))

    // Scale the context to ensure correct drawing operations
    ctx.scale(dpr, dpr);

    // Set the "drawn" size of the canvas
    canvas.style.height = `${rect.height}px`;
    canvas.style.width = `${rect.width}px`;

    canvas.addEventListener("pointerleave", handlePointerLeave)
    canvas.addEventListener("pointermove", handlePointerMove)
    canvas.addEventListener("pointerdown", handlePointerDown)
    canvas.addEventListener("pointerup", handlePointerUp)
}

const puzzleTypeInput = document.getElementById("puzzleTypeInput")

puzzleTypeInput.addEventListener("change", () => {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)
    api.freePuzzle(my_puzzle_ptr)
    Module.setValue(my_puzzle_ptr, 0, 'i32')
    initPuzzle(puzzleTypeInput.valueAsNumber).then(() => {
        drawGridInSqUnits()
        drawTilePool()
    })
    tileSelectLocations = []
})

initCanvas()
await initializeModel()

await initPuzzle(puzzleTypeInput.valueAsNumber)
drawGridInSqUnits()
drawTilePool()
