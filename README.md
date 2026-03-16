# Partridge Puzzle Web-based Frontend

A web-based front end for my [partridge-solver](https://github.com/x-snackage-x/partridge-solver) in C and compiled to WASM.

Visit https://x-snackage-x.github.io/partridge-web/ to try it out. 

## Running locally/Deployment

To build and run locally, first install necessary `npm` packages and run the Vite dev server:

```shell
wd$: npm install
    [...]
wd$: npx vite
```

To deploy run the build command:

```shell
wd$: npm run build
```

local preview:

```shell
wd$: npm run preview
```

and deploy the generated `distr` directory. 

> [!NOTE]  
> When deploying make sure to add the correct Cross-Origin policies to the host header:  
>
>       `Cross-Origin-Opener-Policy`: `same-origin`,  
>       `Cross-Origin-Embedder-Policy`: `require-corp`

## Dependencies

Vite for bundling. 

The layout of the Tile Select area of the Puzzle-Canvas was implemented with the help of of the [Yoga Layout Engine](https://www.yogalayout.dev/).

Serviceworker JavaScript for simulating Cross-origin isolation for the GitHub Pages deployment graciously provided by [Guido Zuidhof](https://github.com/gzuidhof/coi-serviceworker).

## Useful links project 

Sources that were useful while implementing the project.
- "How to Write a Flexbox Layout Engine" by Tomasz Czajęcki: https://tchayen.com/how-to-write-a-flexbox-layout-engine
- Possible Layout Engines:
    - Yoga: https://www.yogalayout.dev/ <--- Chosen
    - CanvasUI: https://github.com/canvasui/CanvasUI?tab=readme-ov-file
    - Fabric.js: https://fabricjs.com/
- SVG Spinner: https://www.fffuel.co/svg-spinner/ 

## ToDo

1. Fix
    - Handle inputs over 16 -> Easter Egg
    - Solution to pick up 1x1 tiles when they are very small
1. Design:
    - Nicer checkbox?
    - Nicer Buttons?
1. Text Content
    - Multiple language support
    - InfoBoxes
    - Add text
1. Mobile optimizations
    - Select with pressure maybe?
    - Vertical aligned canvas
1. Don't render on every mouse event -> Refactor to render loop
