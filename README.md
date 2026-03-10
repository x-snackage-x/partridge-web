# Partridge Puzzle Web-based Frontend

A web-based front end for my [partridge-solver](https://github.com/x-snackage-x/partridge-solver) in C and compiled to WASM.

## Usage

todo

## Dependencies

The layout of the Tile Select area of the Puzzle-Canvas was implemented with the help of of the [Yoga Layout Engine](https://www.yogalayout.dev/).

## ToDo

1. **Be able to pickup placed tiles** -> Requires Integration with puzzle journal?
1. ~~**Don't draw over placed tiles** -> Requires Integration with puzzle journal?~~ Done
1. implement expected draw interface to C-Code
1. **Integrate with puzzle journal/puzzle logic/solver** -> Emscripten research
1. Don't render on every mouse event -> Refactor to render loop
1. Figure out tile color system
1. Spinner for ongoing processes / Result light
1. Text Content
    - Figure out/research how to do the vertical expanding pane
    - Multiple language support
    - InfoBoxes

## Useful links project 

Sources that were useful while implementing the project.
- "How to Write a Flexbox Layout Engine" by Tomasz Czajęcki: https://tchayen.com/how-to-write-a-flexbox-layout-engine
- Possible Layout Engines:
    - Yoga: https://www.yogalayout.dev/ <--- Chosen
    - CanvasUI: https://github.com/canvasui/CanvasUI?tab=readme-ov-file
    - Fabric.js: https://fabricjs.com/

