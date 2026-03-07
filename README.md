# Partridge Puzzle Web-based Frontend

A web-based front end for my [partridge-solver](https://github.com/x-snackage-x/partridge-solver) in C and compiled to WASM.

## Dependencies

The layout of the Tile Select area of the Puzzle-Canvas was implemented with the help of of the [Yoga Layout Engine](https://www.yogalayout.dev/).

## ToDo

1. **Be able to pickup placed tiles** -> Requires Integration with puzzle journal?
1. **Don't draw over placed tiles** -> Requires Integration with puzzle journal?
1. Figure out color system
1. implement expected draw interface to C-Code
1. **Integrate with puzzle journal/puzzle logic/solver** -> Emscripten research
1. Integrate Yoga Layout Engine

## Useful links project 

Sources that were useful while implementing the project.
- "How to Write a Flexbox Layout Engine" by Tomasz Czajęcki: https://tchayen.com/how-to-write-a-flexbox-layout-engine
- Possible Layout Engines:
    - Yoga: https://www.yogalayout.dev/ <--- Chosen
    - CanvasUI: https://github.com/canvasui/CanvasUI?tab=readme-ov-file
    - Fabric.js: https://fabricjs.com/

Example styling from the Yoga Playground
```xml
<Layout config={{useWebDefaults: false}}>
<Node style={{width: 400, height: 400,
                alignItems: 'center',
                justifyContent: 'center'}}>
  <Node style={{maxWidth: 300,    
                padding: 5,
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center'}}>
    <Node style={{width: 30, height: 30, margin: 5}} />
    <Node style={{width: 40, height: 40, margin: 5}} />
    <Node style={{width: 50, height: 50, margin: 5}} />
    <Node style={{width: 60, height: 60, margin: 5}} />
    <Node style={{width: 70, height: 70, margin: 5}} />
    <Node style={{width: 80, height: 80, margin: 5}} />
    <Node style={{width: 90, height: 90, margin: 5}} />
    <Node style={{width: 100, height: 100, margin: 5}} />
    <Node style={{width: 110, height: 110, margin: 5}} />
  </Node>
  </Node>
</Layout>
```