import { setup } from "../../../setup.mjs";

const appName = "FormFieldRangeTest";

setup({
  neoConfig: {
    allowVdomUpdatesInTests: true,
    unitTestMode           : true,
    useDomApiRenderer      : true,
    useVdomWorker          : false,
  },
  appConfig: {
    name             : appName,
    isMounted        : () => true,
    vnodeInitialising: false,
  },
});

import { test, expect } from "@playwright/test";
import Neo              from "../../../../../src/Neo.mjs";
import * as core        from "../../../../../src/core/_export.mjs";
import InstanceManager  from "../../../../../src/manager/Instance.mjs";
import Range            from "../../../../../src/form/field/Range.mjs";

test.describe("Neo.form.field.Range", () => {
  let installedDomEventsStub = false;

  test.beforeAll(() => {
    const main = Neo.ns("Neo.main", true);

    if (!main.DomEvents) {
      main.DomEvents = {
        registerDisabledInputChars() {},
        unregisterDisabledInputChars() {},
      };
      installedDomEventsStub = true;
    }
  });

  test.afterAll(() => {
    if (installedDomEventsStub) {
      delete Neo.main.DomEvents;
      installedDomEventsStub = false;
    }
  });

  test("prepends value to labelText when showResultInLabel is true", () => {
    const field = Neo.create(Range, {
      appName,
      labelText        : "Volume",
      showResultInLabel: true,
      value            : 40,
    });

    expect(field.getLabelEl().text).toBe("[40] Volume");

    field.destroy();
  });

  test("updates label text when value changes with showResultInLabel enabled", () => {
    const field = Neo.create(Range, {
      appName,
      labelText        : "Volume",
      showResultInLabel: true,
      value            : 40,
    });

    field.value = 60;

    expect(field.getLabelEl().text).toBe("[60] Volume");

    field.destroy();
  });

  test("keeps labelText unchanged when showResultInLabel is not set", () => {
    const field = Neo.create(Range, {
      appName,
      labelText: "Volume",
      value    : 40,
    });

    expect(field.getLabelEl().text).toBe("Volume");

    field.destroy();
  });

  test("sets input type to range and cls to neo-rangefield-input", () => {
    const field   = Neo.create(Range, { appName });
    const inputEl = field.getInputEl();

    expect(inputEl.type).toBe("range");
    expect(inputEl.cls).toEqual(["neo-rangefield-input"]);

    field.destroy();
  });

  test("defaults clearable and useSpinButtons to false", () => {
    const field = Neo.create(Range, { appName });

    expect(field.clearable).toBe(false);
    expect(field.useSpinButtons).toBe(false);

    field.destroy();
  });
});
