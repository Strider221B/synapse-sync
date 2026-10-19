import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Home from "../app/page";

describe("Smoke Test — Application Shell", () => {
  it("renders the Home component without throwing", () => {
    const element = Home();
    assert.ok(element, "Home component should return a valid React element");
    assert.equal(typeof element, "object");
  });

  it("verifies home component structure and properties", () => {
    const element = Home();
    assert.ok(element.props, "Component element should contain props");
    assert.ok(
      element.props.children,
      "Component element should have child sections"
    );
  });
});
