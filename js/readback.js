// --- Pixel readback ----------------------------------------------------------
// gl.readPixels into a plain array makes the browser wait for the GPU to finish the frame (the biggest cost in
// performance traces, worst on the globe). With WebGL2 we instead read into a GPU buffer (PBO), drop a fence, and
// copy the pixels out on a later animation frame once the fence has passed: no stall.
// Off by default: in Chrome the fence takes several frames to pass, so with one read in flight emojis only updated
// ~10 times a second while panning (vs ~40 with the blocking read) and lagged behind. Kept for testing; a ring of
// 2-3 PBOs in flight would restore the rate at the cost of 2-3 frames of lag.
const ASYNC_READBACK = false;
let pixels = null, pixW = 0, pixH = 0; // latest map pixels (RGBA, bottom-up rows) and their size

function createReadback(onPixels) {
  const gl = map.painter.context.gl;
  const webgl2 = ASYNC_READBACK && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  let pbo = null, pboBytes = 0, fence = null, pendW = 0, pendH = 0;

  function take(w, h, fill) {
    if (!pixels || pixels.length !== w * h * 4) pixels = new Uint8Array(w * h * 4);
    fill(pixels); pixW = w; pixH = h;
    onPixels();
  }

  // Poll the fence once per animation frame while a read is in flight
  function poll() {
    if (!fence) return;
    const status = gl.clientWaitSync(fence, 0, 0);
    if (status === gl.TIMEOUT_EXPIRED) { requestAnimationFrame(poll); return; }
    gl.deleteSync(fence); fence = null;
    if (pendW !== gl.drawingBufferWidth || pendH !== gl.drawingBufferHeight) return; // resized meanwhile
    take(pendW, pendH, (dst) => {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, dst);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    });
  }

  // Call right after the map has drawn a frame (map 'render' event)
  return function read() {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (!webgl2) { take(w, h, (dst) => gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, dst)); return; } // blocking read
    if (fence) return; // one read in flight at a time; the next render after it lands starts another
    if (!pbo) pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    if (pboBytes !== w * h * 4) { pboBytes = w * h * 4; gl.bufferData(gl.PIXEL_PACK_BUFFER, pboBytes, gl.STREAM_READ); }
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0); // into the PBO, returns without waiting
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    pendW = w; pendH = h;
    requestAnimationFrame(poll);
  };
}
