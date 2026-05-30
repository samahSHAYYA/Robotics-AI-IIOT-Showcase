import '@testing-library/jest-dom'

// Polyfill requestAnimationFrame / cancelAnimationFrame for jsdom
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    return window.setTimeout(() => cb(Date.now()), 0) as unknown as number
  }
}
if (typeof globalThis.cancelAnimationFrame === 'undefined') {
  globalThis.cancelAnimationFrame = (id: number) => {
    window.clearTimeout(id)
  }
}

// Mock HTMLCanvasElement.getContext so it returns a minimal stub
if (typeof HTMLCanvasElement !== 'undefined') {
  const origGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof origGetContext>) {
    const ctx = origGetContext.apply(this, args)
    if (ctx) return ctx
    // Return a minimal mock 2d context for environments without a native one
    return {
      canvas: this,
      clearRect: () => {},
      fillRect: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }),
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      stroke: () => {},
      fill: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      setLineDash: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      font: '',
      textAlign: 'start' as CanvasTextAlign,
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      shadowColor: '',
      shadowBlur: 0,
      lineDashOffset: 0,
      lineCap: 'butt' as CanvasLineCap,
      lineJoin: 'miter' as CanvasLineJoin,
      miterLimit: 10,
      strokeRect: () => {},
      closePath: () => {},
      roundRect: () => {},
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      filter: '',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'low' as ImageSmoothingQuality,
      createImageData: () => new ImageData(1, 1),
      getImageData: () => new ImageData(1, 1),
      putImageData: () => {},
      drawImage: () => {},
      createPattern: () => null,
      globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
      arcTo: () => {},
      bezierCurveTo: () => {},
      quadraticCurveTo: () => {},
      rect: () => {},
      clip: () => {},
      isPointInPath: () => false,
      isPointInStroke: () => false,
      getLineDash: () => [],
      setTransform: () => {},
      getTransform: () => new DOMMatrix(),
      transform: () => {},
      resetTransform: () => {},
      direction: 'ltr' as CanvasDirection,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as CanvasRenderingContext2D
  }
}

// Mock AudioContext (used by useAlertNotifications)
class MockAudioContext {
  currentTime = 0
  destination = { maxChannelCount: 2 }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: () => {} },
      connect: () => {},
      start: () => {},
      stop: () => {},
    }
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
    }
  }
  close() { return Promise.resolve() }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).AudioContext = MockAudioContext

// Mock Notification API
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).Notification = {
  permission: 'default',
  requestPermission: () => {},
}
