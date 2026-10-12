import { useEffect, useRef } from 'react';
import { holographicFragmentShader } from './holographicShader';

const vertexShader = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/** Small transparent WebGL overlay; no Three.js dependency in the collection bundle. */
export function HolographicFoil({ playing=false, reduced=false, dimmed=false }: {
  playing?: boolean; reduced?: boolean; dimmed?: boolean;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const playback = useRef({ playing, reduced, dimmed });
  playback.current = { playing, reduced, dimmed };
  const repaint = useRef<(() => void) | null>(null);
  useEffect(() => repaint.current?.(), [playing, reduced, dimmed]);

  useEffect(() => {
    // Each effect owns its canvas, including React's development remount cycle.
    const canvas = document.createElement('canvas');
    hostRef.current!.append(canvas);
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' });
    if (!gl) { canvas.remove(); return; }
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('Holographic foil shader:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader); return null;
      }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexShader);
    const fragment = compile(gl.FRAGMENT_SHADER, holographicFragmentShader);
    const program = gl.createProgram()!;
    if (vertex && fragment) {
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    }
    if (!vertex || !fragment || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      gl.deleteProgram(program); gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
      return;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const timeUniform = gl.getUniformLocation(program, 'uTime');
    const pointerUniform = gl.getUniformLocation(program, 'uPointer');
    const strengthUniform = gl.getUniformLocation(program, 'uStrength');
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    canvas.dataset.ready = 'true';
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const parent = canvas.parentElement!.parentElement!;
    let pointer: [number,number] = [0.5, 0.5];
    let frame = 0, elapsed = 0, previous = 0, visible = true, lost = false;
    const draw = (now: number) => {
      frame = 0;
      if (lost) return;
      const { playing: active, reduced: still, dimmed: dim } = playback.current;
      const moving = active && !still && !preference.matches && visible && !document.hidden;
      if (moving && previous) elapsed += Math.min((now - previous) / 1000, 0.05);
      previous = moving ? now : 0;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(timeUniform, still || preference.matches ? 0 : elapsed);
      const light = still || preference.matches ? [0.5,0.5] : pointer;
      gl.uniform2f(pointerUniform, light[0], light[1]);
      gl.uniform1f(strengthUniform, dim ? 0.3 : 0.85);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (moving) frame = requestAnimationFrame(draw);
    };
    const schedule = () => { if (!frame && !lost) frame = requestAnimationFrame(draw); };
    const contextLost = () => {
      lost = true; cancelAnimationFrame(frame); frame = 0;
      // Retain the static foil fallback if the browser reclaims this context.
      delete canvas.dataset.ready;
      canvas.remove();
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    repaint.current = schedule;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
      schedule();
    };
    const move = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width && bounds.height) pointer = [Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width)), 1-Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height))];
      schedule();
    };
    const leave = () => { pointer = [0.5,0.5]; schedule(); };
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
    const visibilityObserver = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); });
    visibilityObserver.observe(canvas);
    parent.addEventListener('pointermove', move); parent.addEventListener('pointerleave', leave);
    preference.addEventListener('change', schedule); document.addEventListener('visibilitychange', schedule);
    resize();
    return () => {
      cancelAnimationFrame(frame); repaint.current = null;
      resizeObserver.disconnect(); visibilityObserver.disconnect();
      parent.removeEventListener('pointermove', move); parent.removeEventListener('pointerleave', leave);
      preference.removeEventListener('change', schedule); document.removeEventListener('visibilitychange', schedule);
      canvas.removeEventListener('webglcontextlost', contextLost);
      gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
      gl.getExtension('WEBGL_lose_context')?.loseContext(); delete canvas.dataset.ready;
      canvas.remove();
    };
  }, []);
  return <span ref={hostRef} className="holographic-foil" aria-hidden="true"/>;
}
