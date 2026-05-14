/**
 * SPARK — luma-key shader (S22 P4 user-amendment B).
 *
 * Removes mostly-white pixels from a sprite/texture by converting any pixel
 * with ITU-R BT.601 luma above `threshold` to alpha=0. A 5%-wide soft band
 * just below the threshold lerps alpha smoothly so the cut isn't aliased.
 *
 * Tuning:
 *   - Voltkin yellow body (#FFD60A) → luma ≈ 0.77 (preserved)
 *   - Pure white (#FFFFFF) → luma = 1.00 (transparent)
 *   - default threshold 0.88 = clean Voltkin / mp4 white-bg separation
 *
 * Reusable for all future godly cinematics with light/white backgrounds.
 * Threshold is preview-tuned per recipe via the lumaKey.threshold field.
 */

import { Filter, GlProgram } from 'pixi.js';

const VERT = `in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}`;

// S29 P0 — fixed GLSL ES 300 fragment shader (Pixi v8 / WebGL 2). Previous
// version mixed `in vec2` (300 ES syntax) with `gl_FragColor` (legacy GLSL 100
// only, removed in 300 ES). Result: silent shader-compile failure under Pixi's
// auto-300-version prelude → luma-key never applied → video sprite invisible.
// Fix: declare `out vec4 finalColor;` per 300 ES spec and write to it. Matches
// vertex-shader pattern above (also 300 ES syntax, no precision/version since
// Pixi prepends them in GlProgram.from). Pre-mortem Grok-#5 caught this as the
// silent root cause of cinematic-bug #1 (black screen instead of mp4).
const FRAG = `in vec2 vTextureCoord;

uniform sampler2D uTexture;
uniform float uThreshold;

out vec4 finalColor;

void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  if (lum > uThreshold) {
    c.a = 0.0;
  } else if (lum > uThreshold - 0.05) {
    c.a *= (uThreshold - lum) / 0.05;
  }
  finalColor = c;
}`;

export interface CinematicLumaKeyOptions {
  /** Brightness above which pixels become transparent. Default 0.88. */
  threshold?: number;
}

export class CinematicLumaKeyFilter extends Filter {
  constructor(options: CinematicLumaKeyOptions = {}) {
    const threshold = options.threshold ?? 0.88;
    const glProgram = GlProgram.from({ vertex: VERT, fragment: FRAG, name: 'cinematic-luma-key' });
    super({
      glProgram,
      resources: {
        lumaKeyUniforms: {
          uThreshold: { value: threshold, type: 'f32' },
        },
      },
    });
  }

  setThreshold(t: number): void {
    (this.resources.lumaKeyUniforms.uniforms as Record<string, number>).uThreshold = t;
  }
}
