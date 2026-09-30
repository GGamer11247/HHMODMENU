# Hammy Home Local Debug Build

Run `start-server.bat` to start a local HTTP server on `127.0.0.1:8000` and open Hammy Home automatically.

## Debug controls

- Press `F8` to toggle the debug panel.
- Drag the panel by its title/header.
- Click an object in the scene or choose it from the object list.
- Edit position, rotation, and scale directly.
- Hamsters expose visual scale, physics size, colors, and available pattern/options.
- Bedding exposes available height/padding controls.
- The local debug patch removes the original object/placement/camera-translation limits.
- Camera zoom remains intentionally bounded to a wider, stable debug range so Babylon's wheel zoom math does not become explosive.
