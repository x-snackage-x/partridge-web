/** @type {HTMLCanvasElement} */
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const canvasHeight = Number(canvas.getAttribute("Height"))
const canvasWidth = Number(canvas.getAttribute("Width"))

let puzzleType
let puzzleLength
let squareSide
let tilePoolStart

function initPuzzle(puzzleTypeIn) {
    puzzleType = puzzleTypeIn
    puzzleLength = puzzleType * (puzzleType + 1) / 2
    squareSide = Math.floor(canvasHeight / puzzleLength)
    tilePoolStart = canvasHeight + 10.5
}

function drawTile(size, x, y) {
    ctx.fillRect(x, y, size * squareSide, size * squareSide)
}

function placeTileGrid(size, xSqU, ySqU) {
    drawTile(size, xSqU * squareSide + 0.5, ySqU * squareSide + 0.5)
}

function drawTilePool() {
    let nRows = 2
    let nColumns = 1
    let tableWidth = canvasWidth - tilePoolStart

    let tableCellWidth = tableWidth / nColumns
    let tableCellHeight = canvasHeight / nRows

    let tableCellHeights = Array(nRows).fill()
        .map((v, i) => (i + 1))
        .map((i) =>
            canvasHeight * i / (puzzleType + 1)
        )

    let row = 0
    let column = 0
    for (let i = 0; i < puzzleType; ++i) {
        //drawTile(i + 1, tilePoolStart + tableCellWidth * column,
        //    tableCellHeight * row)

        ctx.strokeRect(tilePoolStart + tableCellWidth * column,
            tableCellHeight * row, tableCellWidth, tableCellHeight)

        column = (column + 1) % nColumns
        row = column == 0 ? (row + 1) % nRows : row
    }
}

function drawGridInSqUnits(xSqU
    = 0, ySqU = 0, size = puzzleLength) {
    ctx.strokeStyle = "grey"
    for (let i = 0; i <= size; ++i) {
        ctx.beginPath()
        ctx.moveTo(xSqU * squareSide + 0.5, (ySqU + i) * squareSide + 0.5)
        ctx.lineTo((xSqU + size) * squareSide, (ySqU + i) * squareSide)
        ctx.closePath()
        ctx.stroke()
    }

    for (let i = 0; i <= size; ++i) {
        ctx.beginPath()
        ctx.moveTo((xSqU + i) * squareSide + 0.5, ySqU * squareSide + 0.5)
        ctx.lineTo((xSqU + i) * squareSide, ySqU + squareSide * size)
        ctx.closePath()
        ctx.stroke()
    }
}

initPuzzle(2)
drawGridInSqUnits(0, 0)

drawTilePool()
