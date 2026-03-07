import {
    Align, Direction,
    Edge, FlexDirection,
    Justify,
    Wrap, loadYoga
} from 'yoga-layout/load'

/** @type {HTMLCanvasElement} */
let canvas = null
let ctx = null
let canvasHeight = 0
let canvasWidth = 0

let puzzleType
let puzzleLength
let squareSide
let tilePoolStart
let tilePoolCenter
let tileUIElements
let tileSelectLocations = []

let selectionActive = false
let selectionTileOnGrid = false
let selectedTile = {}

async function calculateTilePoolLayout(puzzleType) {
    let tileUIElements = new Array(puzzleType).fill().map((_, i) => i + 1)
    tileUIElements = tileUIElements.map(tileType => ({
        tileType,
        ...calculateTilePoolElement(tileType)
    }))

    const Yoga = await loadYoga()

    const config = Yoga.Config.create();
    config.setUseWebDefaults(false)

    const tilePool = Yoga.Node.create(config)
    tilePool.setWidth(canvasHeight)
    tilePool.setHeight(canvasHeight)
    tilePool.setAlignItems(Align.Center)
    tilePool.setJustifyContent(Justify.Center)

    const boundingBox = Yoga.Node.create(config)
    boundingBox.setMaxWidth(canvasHeight)
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

    tilePool.calculateLayout(canvasHeight, canvasHeight, Direction.LTR)

    yogaNodes.forEach(elem => {
        tileUIElements[elem.tileType - 1]['computedLeft']
            = elem.yogaNode.getComputedLayout().left + tilePoolStart
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
    tilePoolStart = canvasHeight + 10.5

    tilePoolCenter = {
        xCoord: tilePoolStart + (canvasWidth - tilePoolStart) / 2,
        yCoord: canvasHeight / 2
    }

    tileUIElements = await calculateTilePoolLayout(puzzleType)
}

function translatePixelPosToGridPos(x, y, tileType) {
    let xTilePixelPosStart = x - Math.floor(tileType * squareSide / 2)
    let xTilePixelPosEnd = x + Math.floor(tileType * squareSide / 2) + 1

    let xSqu = Math.min(Math.max(Math.round(x / squareSide)
        - Math.round(tileType / 2), 0), puzzleLength)
    let ySqu = Math.min(Math.max(Math.round(y / squareSide)
        - Math.round(tileType / 2), 0), puzzleLength - tileType)

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
    ctx.clearRect(tilePoolStart - 1, 0, canvasWidth - tilePoolStart + 2, canvasHeight + 1)
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

    console.log(squareSide, text.width)

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
    ctx.strokeRect(x, y, elementWidth, elementHeight)

    return { elementWidth, elementHeight }
}

function drawTilePool() {
    ctx.strokeStyle = "green"
    ctx.beginPath()
    ctx.moveTo(tilePoolCenter.xCoord, 0)
    ctx.lineTo(tilePoolCenter.xCoord, canvasHeight)
    ctx.closePath()
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(tilePoolStart, tilePoolCenter.yCoord)
    ctx.lineTo(canvasWidth, tilePoolCenter.yCoord)
    ctx.closePath()
    ctx.stroke()

    ctx.strokeStyle = "grey"
    /*     drawTilePoolElement(0, 5, 1, 1)
        drawTilePoolElement(70, 5, 2, 2)
        drawTilePoolElement(150, 5, 3, 3)
        drawTilePoolElement(200, 5, 4, 4)
        drawTilePoolElement(260, 5, 5, 5)
        drawTilePoolElement(330, 5, 6, 6)
        drawTilePoolElement(0, 80, 7, 7)
        drawTilePoolElement(100, 80, 8, 8)
        drawTilePoolElement(220, 80, 9, 9) */

    tileUIElements.forEach(elem => {
        drawTilePoolElement(elem.computedLeft, elem.computedTop, elem.tileType, elem.tileType)
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

function getTileSelectAtPos(x, y) {
    return tileSelectLocations.find(i =>
        x >= i.xStart && x <= i.xEnd && y >= i.yStart && y <= i.yEnd)
}

function handlePointerLeave(event) {
    selectionActive = false
    selectedTile = false

    clearTilePool()
    drawTilePool()

    if (selectionTileOnGrid) {
        clearGridInSqUnits(selectedTile.xSqU, selectedTile.ySqU, selectedTile.type)
        drawGridInSqUnits(selectedTile.xSqU, selectedTile.ySqU, selectedTile.type)
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
            clearGridInSqUnits(selectedTile.xSqU, selectedTile.ySqU, selectedTile.type)
            drawGridInSqUnits(selectedTile.xSqU, selectedTile.ySqU, selectedTile.type)
        }

        let tileType = selectedTile.type
        let xRenderPos = x + selectedTile.xShift
        let yRenderPos = y + selectedTile.yShift
        let { xSqu, ySqu } = translatePixelPosToGridPos(x, y, tileType)

        if (xRenderPos >= tilePoolStart) {
            drawTile(tileType, xRenderPos, yRenderPos, "green")
        } else {
            selectionTileOnGrid = true
            selectedTile.xSqU = xSqu
            selectedTile.ySqU = ySqu
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
    const foundTile = getTileSelectAtPos(x, y)
    if (foundTile) {
        selectionActive = true
        selectedTile = foundTile
    }
}

function handlePointerUp(event) {
    selectionActive = false
    selectedTile = false
    if (selectionTileOnGrid) {
        //TODO: place tile in puzzle
        selectionTileOnGrid = false
    }
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
    initPuzzle(puzzleTypeInput.valueAsNumber).then(() => {
        drawGridInSqUnits()
        drawTilePool()
    })
    tileSelectLocations = []
})

initCanvas()

await initPuzzle(puzzleTypeInput.valueAsNumber)
drawGridInSqUnits()
drawTilePool()
