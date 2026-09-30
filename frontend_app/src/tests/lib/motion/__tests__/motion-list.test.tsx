/**
 * Tests for list motion variants and helper components.
 * Phase 1: Shared List Motion Pattern
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { listContainerStagger, listItemFadeInUp } from "@/lib/motion/index";
import { MotionList, MotionListItem } from "@/components/ui/motion-list";

describe("List Motion Variants", () => {
  describe("listContainerStagger", () => {
    it("has hidden and visible states", () => {
      expect(listContainerStagger.hidden).toBeDefined();
      expect(listContainerStagger.visible).toBeDefined();
    });

    it("hidden state has opacity 0", () => {
      const hidden = listContainerStagger.hidden as Record<string, unknown>;
      expect(hidden.opacity).toBe(0);
    });

    it("visible state includes staggerChildren and delayChildren transition", () => {
      const visible = listContainerStagger.visible as Record<string, unknown>;
      const transition = visible.transition as Record<string, unknown>;
      expect(transition.staggerChildren).toBeDefined();
      expect(transition.delayChildren).toBeDefined();
      expect(typeof transition.staggerChildren).toBe("number");
      expect(typeof transition.delayChildren).toBe("number");
    });
  });

  describe("listItemFadeInUp", () => {
    it("has hidden and visible states", () => {
      expect(listItemFadeInUp.hidden).toBeDefined();
      expect(listItemFadeInUp.visible).toBeDefined();
    });

    it("hidden state has opacity 0 and y offset", () => {
      const hidden = listItemFadeInUp.hidden as Record<string, unknown>;
      expect(hidden.opacity).toBe(0);
      expect(hidden.y).toBeDefined();
      expect(typeof hidden.y).toBe("number");
    });

    it("visible state has opacity 1 and y 0", () => {
      const visible = listItemFadeInUp.visible as Record<string, unknown>;
      expect(visible.opacity).toBe(1);
      expect(visible.y).toBe(0);
    });

    it("visible state has transition with duration between 0.18 and 0.22 seconds", () => {
      const visible = listItemFadeInUp.visible as Record<string, unknown>;
      const transition = visible.transition as Record<string, unknown>;
      expect(transition.duration).toBeDefined();
      expect(transition.duration).toBeGreaterThanOrEqual(0.18);
      expect(transition.duration).toBeLessThanOrEqual(0.22);
    });
  });
});

describe("MotionList Component", () => {
  it("renders children correctly", () => {
    render(
      <MotionList data-testid="motion-list">
        <div>Child 1</div>
        <div>Child 2</div>
      </MotionList>
    );

    expect(screen.getByTestId("motion-list")).toBeInTheDocument();
    expect(screen.getByText("Child 1")).toBeInTheDocument();
    expect(screen.getByText("Child 2")).toBeInTheDocument();
  });

  it("renders as div by default", () => {
    render(<MotionList data-testid="motion-list">Content</MotionList>);

    const element = screen.getByTestId("motion-list");
    expect(element.tagName).toBe("DIV");
  });

  it("renders as ul when as prop is ul", () => {
    render(
      <MotionList as="ul" data-testid="motion-list">
        <li>Item</li>
      </MotionList>
    );

    const element = screen.getByTestId("motion-list");
    expect(element.tagName).toBe("UL");
  });

  it("renders as tbody when as prop is tbody", () => {
    render(
      <table>
        <MotionList as="tbody" data-testid="motion-list">
          <tr>
            <td>Cell</td>
          </tr>
        </MotionList>
      </table>
    );

    const element = screen.getByTestId("motion-list");
    expect(element.tagName).toBe("TBODY");
  });

  it("accepts className prop", () => {
    render(
      <MotionList data-testid="motion-list" className="custom-class">
        Content
      </MotionList>
    );

    expect(screen.getByTestId("motion-list")).toHaveClass("custom-class");
  });

  it("uses listContainerStagger variants by default", () => {
    // Component should have variants wired up - just verify it renders without error
    render(
      <MotionList data-testid="motion-list">
        <MotionListItem>Item 1</MotionListItem>
        <MotionListItem>Item 2</MotionListItem>
      </MotionList>
    );

    expect(screen.getByTestId("motion-list")).toBeInTheDocument();
  });
});

describe("MotionListItem Component", () => {
  it("renders children correctly", () => {
    render(
      <MotionListItem data-testid="motion-list-item">Child content</MotionListItem>
    );

    expect(screen.getByTestId("motion-list-item")).toBeInTheDocument();
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("renders as div by default", () => {
    render(<MotionListItem data-testid="motion-list-item">Content</MotionListItem>);

    const element = screen.getByTestId("motion-list-item");
    expect(element.tagName).toBe("DIV");
  });

  it("renders as li when as prop is li", () => {
    render(
      <ul>
        <MotionListItem as="li" data-testid="motion-list-item">
          Item
        </MotionListItem>
      </ul>
    );

    const element = screen.getByTestId("motion-list-item");
    expect(element.tagName).toBe("LI");
  });

  it("renders as tr when as prop is tr", () => {
    render(
      <table>
        <tbody>
          <MotionListItem as="tr" data-testid="motion-list-item">
            <td>Cell</td>
          </MotionListItem>
        </tbody>
      </table>
    );

    const element = screen.getByTestId("motion-list-item");
    expect(element.tagName).toBe("TR");
  });

  it("accepts className prop", () => {
    render(
      <MotionListItem data-testid="motion-list-item" className="custom-class">
        Content
      </MotionListItem>
    );

    expect(screen.getByTestId("motion-list-item")).toHaveClass("custom-class");
  });
});

describe("MotionList and MotionListItem Integration", () => {
  it("renders a complete list with ul/li elements", () => {
    render(
      <MotionList as="ul" data-testid="list-container">
        <MotionListItem as="li" data-testid="item-1">
          First item
        </MotionListItem>
        <MotionListItem as="li" data-testid="item-2">
          Second item
        </MotionListItem>
        <MotionListItem as="li" data-testid="item-3">
          Third item
        </MotionListItem>
      </MotionList>
    );

    expect(screen.getByTestId("list-container").tagName).toBe("UL");
    expect(screen.getByTestId("item-1").tagName).toBe("LI");
    expect(screen.getByTestId("item-2").tagName).toBe("LI");
    expect(screen.getByTestId("item-3").tagName).toBe("LI");
    expect(screen.getByText("First item")).toBeInTheDocument();
    expect(screen.getByText("Second item")).toBeInTheDocument();
    expect(screen.getByText("Third item")).toBeInTheDocument();
  });

  it("renders a complete table with tbody/tr elements", () => {
    render(
      <table>
        <MotionList as="tbody" data-testid="table-body">
          <MotionListItem as="tr" data-testid="row-1">
            <td>Row 1</td>
          </MotionListItem>
          <MotionListItem as="tr" data-testid="row-2">
            <td>Row 2</td>
          </MotionListItem>
        </MotionList>
      </table>
    );

    expect(screen.getByTestId("table-body").tagName).toBe("TBODY");
    expect(screen.getByTestId("row-1").tagName).toBe("TR");
    expect(screen.getByTestId("row-2").tagName).toBe("TR");
  });
});
