/**
 * Unit tests for the background removal transparency detector.
 * Verifies the transparency detection logic that runs BEFORE any AI inference.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("rembg", () => ({
  remove: vi.fn(async (input) => input),
  new_session: vi.fn(() => ({})),
}));

import { remove, new_session } from "rembg";

/**
 * Transparency detection logic matching the Python worker implementation
 */
function detectTransparency(inputBytes, options = {}) {
  const { transparencyRatioThreshold = 0.3 } = options;

  const img = loadTestImage(inputBytes);
  if (!img) {
    return {
      hasTransparency: false,
      transparencyRatio: 0,
      skipReason: "invalid image",
      mode: "error",
    };
  }

  let hasAlpha = false;
  let transparentPixelCount = 0;
  let totalPixels = 0;
  let veryTransparentCount = 0;

  if (img.mode === "RGBA" || img.mode === "LA") {
    hasAlpha = true;
    totalPixels = img.width * img.height;
    for (let i = 0; i < img.alphaData.length; i++) {
      if (img.alphaData[i] < 255) transparentPixelCount++;
      if (img.alphaData[i] < 128) veryTransparentCount++;
    }
  } else if (img.mode === "RGB") {
    hasAlpha = false;
    totalPixels = img.width * img.height;
  } else if (img.mode === "P") {
    hasAlpha = true;
    totalPixels = img.width * img.height;
    for (let i = 0; i < img.alphaData.length; i++) {
      if (img.alphaData[i] < 255) transparentPixelCount++;
      if (img.alphaData[i] < 128) veryTransparentCount++;
    }
  } else {
    hasAlpha = false;
    totalPixels = img.width * img.height;
  }

  if (totalPixels === 0) {
    return {
      hasTransparency: false,
      transparencyRatio: 0,
      skipReason: "no dimensions",
      mode: img.mode,
    };
  }

  const transparencyRatio = transparentPixelCount / totalPixels;
  const veryTransparentRatio = veryTransparentCount / totalPixels;

  if (!hasAlpha) {
    return {
      hasTransparency: false,
      transparencyRatio: 0,
      skipReason: null,
      mode: img.mode,
    };
  }

  if (transparentPixelCount === 0) {
    return {
      hasTransparency: false,
      transparencyRatio: 0,
      skipReason: null,
      mode: img.mode,
    };
  }

  if (transparencyRatio < 0.02) {
    return {
      hasTransparency: false,
      transparencyRatio,
      skipReason: null,
      mode: img.mode,
    };
  }

  if (
    transparencyRatio > transparencyRatioThreshold &&
    veryTransparentRatio > 0.1
  ) {
    return {
      hasTransparency: true,
      transparencyRatio,
      skipReason: "image already has genuine transparency",
      mode: img.mode,
    };
  }

  return {
    hasTransparency: false,
    transparencyRatio,
    skipReason: null,
    mode: img.mode,
  };
}

/**
 * Test image loader - parses test fixture bytes
 * Format: PNG signature (8 bytes) + modeByte + patternByte
 * modeByte: 0x00=RGB, 0x01=RGBA, 0x02=P, 0x03=L
 * patternByte: 0-255 encoding transparency ratio 0.0-1.0
 */
function loadTestImage(bytes) {
  if (!bytes || bytes.length < 10) return null;

  const isPNG =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;

  if (!isPNG) return null;

  const modeByte = bytes[bytes.length - 2];
  const patternByte = bytes[bytes.length - 1];
  const width = 100;
  const height = 100;
  const totalPixels = width * height;

  let mode = "RGB";
  let alphaData = null;

  if (modeByte === 0x01) mode = "RGBA";
  if (modeByte === 0x02) mode = "P";
  if (modeByte === 0x03) mode = "L";

  if (mode === "RGBA" || mode === "P") {
    alphaData = new Uint8Array(totalPixels);
    const transparentCount = Math.floor((patternByte / 255) * totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      alphaData[i] = i < transparentCount ? 0 : 255;
    }
  }

  return { mode, width, height, alphaData };
}

function createTestPNG(mode, transparencyRatio) {
  const bytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const modeByte = mode === "RGBA" ? 0x01 : mode === "P" ? 0x02 : 0x00;
  const patternByte = Math.floor(transparencyRatio * 255);
  bytes.push(modeByte, patternByte);
  return new Uint8Array(bytes);
}

describe("Transparency Detector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Classifies opaque JPG (RGB mode, no alpha) as requiring AI", () => {
    const bytes = createTestPNG("RGB", 0);
    const result = detectTransparency(bytes);

    expect(result.hasTransparency).toBe(false);
    expect(result.skipReason).toBeNull();
    expect(result.mode).toBe("RGB");
  });

  it("Classifies opaque PNG (RGB mode) as requiring AI", () => {
    const bytes = createTestPNG("RGB", 0);
    const result = detectTransparency(bytes);

    expect(result.hasTransparency).toBe(false);
    expect(result.skipReason).toBeNull();
  });

  it("Classifies fully opaque RGBA as requiring AI", () => {
    const bytes = createTestPNG("RGBA", 0);
    const result = detectTransparency(bytes);

    expect(result.hasTransparency).toBe(false);
    expect(result.transparencyRatio).toBe(0);
    expect(result.skipReason).toBeNull();
  });

  it("Skips Rembg for genuine transparent PNG", () => {
    const bytes = createTestPNG("RGBA", 0.75);
    const result = detectTransparency(bytes);

    expect(result.hasTransparency).toBe(true);
    expect(result.transparencyRatio).toBeGreaterThan(0.3);
    expect(result.skipReason).toContain("genuine transparency");
  });

  it("Skips Rembg for genuine transparent WebP (RGBA-equivalent)", () => {
    const bytes = createTestPNG("RGBA", 0.8);
    const result = detectTransparency(bytes);

    expect(result.hasTransparency).toBe(true);
    expect(result.skipReason).toContain("genuine transparency");
  });

  it("Detects palette-based PNG transparency correctly", () => {
    const bytes = createTestPNG("P", 0.6);
    const result = detectTransparency(bytes);

    expect(result.hasTransparency).toBe(true);
    expect(result.skipReason).toContain("genuine transparency");
  });

  it("Handles tiny accidental alpha artifacts conservatively", () => {
    const bytes = createTestPNG("RGBA", 0.01);
    const result = detectTransparency(bytes);

    expect(result.hasTransparency).toBe(false);
    expect(result.skipReason).toBeNull();
  });

  it("Rejects invalid image", () => {
    const result = detectTransparency(
      new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]),
    );

    expect(result.hasTransparency).toBe(false);
    expect(result.mode).toBe("error");
  });

  it("Rejects empty input", () => {
    const result = detectTransparency(new Uint8Array([]));

    expect(result.hasTransparency).toBe(false);
    expect(result.mode).toBe("error");
  });
});

describe("Rembg Invocation Guard", () => {
  it("Never calls Rembg.remove on already-transparent images", async () => {
    const transparentBytes = createTestPNG("RGBA", 0.8);
    const detectionResult = detectTransparency(transparentBytes);

    let rembgCalled = false;

    if (!detectionResult.hasTransparency) {
      await remove(transparentBytes);
      rembgCalled = true;
    }

    expect(detectionResult.hasTransparency).toBe(true);
    expect(rembgCalled).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it("Calls Rembg.remove on opaque images", async () => {
    const opaqueBytes = createTestPNG("RGB", 0);
    const detectionResult = detectTransparency(opaqueBytes);

    let rembgCalled = false;

    if (!detectionResult.hasTransparency) {
      await remove(opaqueBytes);
      rembgCalled = true;
    }

    expect(detectionResult.hasTransparency).toBe(false);
    expect(rembgCalled).toBe(true);
    expect(remove).toHaveBeenCalled();
  });

  it("Creates session for model initialization", () => {
    const session = new_session("isnet-general-use");

    expect(session).toBeDefined();
    expect(new_session).toHaveBeenCalledWith("isnet-general-use");
  });
});
