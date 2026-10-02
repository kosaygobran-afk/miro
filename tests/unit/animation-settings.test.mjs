import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

const source = await readFile(
  new URL("../../src/lib/animation-settings.ts", import.meta.url),
  "utf8",
);
const settings = {};
runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports: settings,
    structuredClone,
    require: (name) => {
      assert.equal(name, "zod");
      return { z };
    },
  },
);
const {
  DEFAULT_ANIMATION_SETTINGS,
  animationSettingsSchema,
  parseAnimationSettings,
  ANIMATION_DURATIONS,
} = settings;
const draft = () => structuredClone(DEFAULT_ANIMATION_SETTINGS);

const presetSource = await readFile(
  new URL("../../src/lib/appearance-presets.ts", import.meta.url),
  "utf8",
);
const presets = {};
runInNewContext(
  ts.transpileModule(presetSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  {
    exports: presets,
    structuredClone,
    require: (name) => {
      if (name === "zod") return { z };
      assert.equal(name, "./animation-settings");
      return settings;
    },
  },
);

test("default public settings are valid and every feature can be independently disabled", () => {
  assert.equal(
    animationSettingsSchema.safeParse(DEFAULT_ANIMATION_SETTINGS).success,
    true,
  );
  assert.equal(DEFAULT_ANIMATION_SETTINGS.enabled, true);
  for (const [key, enabled] of Object.entries(
    DEFAULT_ANIMATION_SETTINGS.features,
  )) {
    assert.equal(enabled, true);
    const value = draft();
    value.features[key] = false;
    assert.equal(animationSettingsSchema.parse(value).features[key], false);
    assert.equal(animationSettingsSchema.parse(value).enabled, true);
  }
  const value = draft();
  value.enabled = false;
  assert.equal(animationSettingsSchema.parse(value).enabled, false);
  assert.ok(
    Object.values(value.features).every(Boolean),
    "master off preserves feature choices",
  );
});

test("timing options accept their bounds and reject slow, fractional and coerced values", () => {
  for (const { key, min, max } of ANIMATION_DURATIONS) {
    for (const milliseconds of [min, max]) {
      const value = draft();
      value.durations[key] = milliseconds;
      assert.equal(
        animationSettingsSchema.safeParse(value).success,
        true,
        `${key} accepts ${milliseconds}`,
      );
    }
    for (const milliseconds of [
      min - 1,
      max + 1,
      min + 0.5,
      String(min),
      null,
    ]) {
      const value = draft();
      value.durations[key] = milliseconds;
      assert.equal(
        animationSettingsSchema.safeParse(value).success,
        false,
        `${key} rejects ${milliseconds}`,
      );
    }
  }
});

test("public settings reject private fields, missing controls and unknown styles", () => {
  for (const mutation of [
    (value) => {
      value.private_token = "never_public";
    },
    (value) => {
      value.features.private_token = "never_public";
    },
    (value) => {
      value.durations.private_token = 100;
    },
    (value) => {
      delete value.features.menus;
    },
    (value) => {
      delete value.durations.image;
    },
    (value) => {
      value.features.dialogs = "true";
    },
    (value) => {
      value.enabled = 1;
    },
    (value) => {
      value.themeStyle = "unknown";
    },
    (value) => {
      value.pageStyle = "unknown";
    },
    (value) => {
      value.easing = "unknown";
    },
    (value) => {
      value.appearanceVersion = "3";
    },
    (value) => {
      delete value.appearanceVersion;
    },
  ]) {
    const value = draft();
    mutation(value);
    assert.equal(animationSettingsSchema.safeParse(value).success, false);
    assert.deepEqual(
      JSON.parse(JSON.stringify(parseAnimationSettings(value))),
      JSON.parse(JSON.stringify(DEFAULT_ANIMATION_SETTINGS)),
    );
  }
});

test("Version1 source backup is immutable and restoring a draft leaves it intact", () => {
  const baseline = presets.VERSION_ONE_APPEARANCE;
  assert.equal(
    presets.appearancePresetSchema.safeParse(baseline).success,
    true,
  );
  assert.equal(baseline.animationSettings.appearanceVersion, "1");
  assert.equal(DEFAULT_ANIMATION_SETTINGS.appearanceVersion, "2");
  assert.equal(baseline.themeTokens.dark["--background"], "#000");
  assert.equal(baseline.themeTokens.light["--primary"], "#ffca28");
  assert.equal(baseline.themeTokens.dark["--header-sticky-offset"], undefined);
  assert.throws(() => {
    baseline.animationSettings.features.themeReveal = false;
  }, TypeError);
  assert.throws(() => {
    baseline.themeTokens.dark["--background"] = "pink";
  }, TypeError);
  const restoredDraft = structuredClone(baseline.animationSettings);
  restoredDraft.appearanceVersion = "2";
  restoredDraft.features.themeReveal = false;
  assert.equal(animationSettingsSchema.safeParse(restoredDraft).success, true);
  assert.equal(baseline.animationSettings.appearanceVersion, "1");
  assert.equal(baseline.animationSettings.features.themeReveal, true);
});

test("configuration outage fallback returns isolated defaults without mutating shared settings", () => {
  for (const missing of [undefined, null, {}, [], "unavailable"]) {
    const first = parseAnimationSettings(missing);
    first.enabled = false;
    first.features.themeReveal = false;
    const second = parseAnimationSettings(missing);
    assert.equal(second.enabled, true);
    assert.equal(second.features.themeReveal, true);
    assert.equal(DEFAULT_ANIMATION_SETTINGS.features.themeReveal, true);
  }
});
