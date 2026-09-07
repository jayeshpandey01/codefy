import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { CodefyLogo } from "../components/Icons.js";

describe("CodefyLogo", () => {
  it("renders SVG with 4 rotational blade paths", () => {
    const { container } = render(<CodefyLogo size={24} className="text-[#007ACC]" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 100 100");

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(5);
  });
});
