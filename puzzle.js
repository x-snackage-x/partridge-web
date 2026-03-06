/** @type {HTMLCanvasElement} */
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const canvasHeight = Number(canvas.getAttribute("Height"))
const canvasWidth = Number(canvas.getAttribute("Width"))

let puzzleType
let puzzleLength
let squareSide
let tilePoolStart
let tilePoolCenter
let tileSelectLocations = []

let selectionActive = false
let selectionTileOnGrid = false
let selectedTile = {}


function initPuzzle(puzzleTypeIn) {
    puzzleType = puzzleTypeIn
    puzzleLength = puzzleType * (puzzleType + 1) / 2
    squareSide = Math.round(canvasHeight * 2 / puzzleLength) / 2
    tilePoolStart = canvasHeight + 10.5

    tilePoolCenter = {
        xCoord: tilePoolStart + (canvasWidth - tilePoolStart) / 2,
        yCoord: canvasHeight / 2
    }
}

function translatePixelPosToGridPos(x, y, tileType) {
    if (x > tilePoolStart) {
        return false
    }

    let xSqu = Math.min(Math.max(Math.round(x / squareSide)
        - Math.round(tileType / 2), 0), puzzleLength)
    let ySqu = Math.min(Math.max(Math.round(y / squareSide)
        - Math.round(tileType / 2), 0), puzzleLength)

    return { xSqu, ySqu, }
}

function drawTile(size, x, y, color = "black") {
    ctx.fillStyle = color
    ctx.fillRect(x, y, size * squareSide, size * squareSide)
}

function placeTileGrid(size, xSqU, ySqU) {
    drawTile(size, xSqU * squareSide, ySqU * squareSide)
}

function clearTilePool() {
    ctx.clearRect(tilePoolStart, 0, canvasWidth - tilePoolStart, canvasHeight)
}

function drawTilePoolElement(x, y, size, number = 1) {
    let fontSize = 25 > squareSide ? 25 : squareSide
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

    drawTile(size, x + tilePoolStart, y + heightCorrection / 2)
    let thisTileSelectLoc = {
        xStart: x + tilePoolStart,
        xEnd: x + tilePoolStart + size * squareSide,
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
        x + tilePoolStart + size * squareSide + x_correction,
        y + (size * squareSide + heightCorrection) / 2);

    let elementWidth = size * squareSide + widthCorrection
    let elementHeight = size * squareSide + heightCorrection
    //ctx.strokeRect(x + tilePoolStart, y, elementWidth, elementHeight)

    return elementWidth, elementHeight
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
    drawTilePoolElement(0, 5, 1, 1)
    drawTilePoolElement(70, 5, 2, 2)
    drawTilePoolElement(150, 5, 3, 3)
    drawTilePoolElement(200, 5, 4, 4)
    drawTilePoolElement(260, 5, 5, 5)
    drawTilePoolElement(330, 5, 6, 6)
    drawTilePoolElement(0, 80, 7, 7)
    drawTilePoolElement(100, 80, 8, 8)
    drawTilePoolElement(220, 80, 9, 9)
}

function clearGridInSqUnits(xSqU = 0, ySqU = 0, size = puzzleLength) {
    ctx.clearRect(xSqU * squareSide, ySqU * squareSide,
        size * squareSide + 1, size * squareSide + 1)
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

function handlePointerMove(event) {
    clearTilePool()
    const rect = canvas.getBoundingClientRect()
    const x = event.pageX - rect.left
    const y = event.pageY - rect.top

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

        if (x >= tilePoolStart) {
            drawTile(tileType, xRenderPos, yRenderPos, "green")
        } else if (x < tilePoolStart) {
            selectionTileOnGrid = true
            selectedTile.xSqU = xSqu
            selectedTile.ySqU = ySqu
            placeTileGrid(tileType, xSqu, ySqu)
        }
    } else {
        const foundTile = getTileSelectAtPos(x, y)
        if (foundTile) { drawTile(foundTile.type, foundTile.xStart, foundTile.yStart, "red") }
    }
}

function handlePointerDown(event) {
    selectionActive = true

    const rect = canvas.getBoundingClientRect()
    const x = event.pageX - rect.left
    const y = event.pageY - rect.top
    const foundTile = getTileSelectAtPos(x, y)
    if (foundTile) {
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

canvas.addEventListener("pointermove", handlePointerMove)
canvas.addEventListener("pointerdown", handlePointerDown)
canvas.addEventListener("pointerup", handlePointerUp)

initPuzzle(9)
drawGridInSqUnits()

drawTilePool()

