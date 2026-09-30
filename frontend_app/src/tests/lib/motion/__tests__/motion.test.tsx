/**
 * Tests for Framer Motion foundation components and variants.
 * Phase 1: Verify motion components render children correctly.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  MotionDiv,
  MotionLi,
  MotionSection,
  MotionSpan,
  MotionUl,
} from "@/components/ui/motion";
import {
  DURATION,
  EASING,
  fadeIn,
  fadeInUp,
  scaleIn,
  slideInFromRight,
  staggerContainer,
} from "@/lib/motion/index";

describe("Motion Components", () => {
  describe("MotionDiv", () => {
    it("renders children correctly", () => {
      render(
        <MotionDiv data-testid="motion-div">
          <span>Child content</span>
        </MotionDiv>
      );

      expect(screen.getByTestId("motion-div")).toBeInTheDocument();
      expect(screen.getByText("Child content")).toBeInTheDocument();
    });

    it("accepts className prop", () => {
      render(
        <MotionDiv data-testid="motion-div" className="test-class">
          Content
        </MotionDiv>
      );

      expect(screen.getByTestId("motion-div")).toHaveClass("test-class");
    });

    it("supports initial and animate props", () => {
      render(
        <MotionDiv
          data-testid="motion-div"
          initial="hidden"
          animate="visible"
          variants={fadeIn}
        >
          Animated content
        </MotionDiv>
      );

      expect(screen.getByTestId("motion-div")).toBeInTheDocument();
      expect(screen.getByText("Animated content")).toBeInTheDocument();
    });
  });

  describe("MotionSection", () => {
    it("renders children correctly", () => {
      render(
        <MotionSection data-testid="motion-section">
          <h1>Section heading</h1>
        </MotionSection>
      );

      expect(screen.getByTestId("motion-section")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Section heading" })).toBeInTheDocument();
    });
  });

  describe("MotionUl and MotionLi", () => {
    it("renders list with children", () => {
      render(
        <MotionUl data-testid="motion-list" variants={staggerContainer}>
          <MotionLi variants={fadeInUp}>Item 1</MotionLi>
          <MotionLi variants={fadeInUp}>Item 2</MotionLi>
        </MotionUl>
      );

      expect(screen.getByTestId("motion-list")).toBeInTheDocument();
      expect(screen.getByText("Item 1")).toBeInTheDocument();
      expect(screen.getByText("Item 2")).toBeInTheDocument();
    });
  });

  describe("MotionSpan", () => {
    it("renders inline content", () => {
      render(
        <MotionSpan data-testid="motion-span">Inline text</MotionSpan>
      );

      expect(screen.getByTestId("motion-span")).toBeInTheDocument();
      expect(screen.getByText("Inline text")).toBeInTheDocument();
    });
  });
});

describe("Animation Tokens", () => {
  describe("DURATION", () => {
    it("exports duration tokens", () => {
      expect(DURATION.FAST).toBeDefined();
      expect(DURATION.NORMAL).toBeDefined();
      expect(DURATION.SLOW).toBeDefined();
      expect(typeof DURATION.FAST).toBe("number");
      expect(typeof DURATION.NORMAL).toBe("number");
      expect(typeof DURATION.SLOW).toBe("number");
    });

    it("has correct duration ordering", () => {
      expect(DURATION.FAST).toBeLessThan(DURATION.NORMAL);
      expect(DURATION.NORMAL).toBeLessThan(DURATION.SLOW);
    });
  });

  describe("EASING", () => {
    it("exports easing tokens", () => {
      expect(EASING.easeOut).toBeDefined();
      expect(EASING.easeInOut).toBeDefined();
      expect(EASING.spring).toBeDefined();
    });
  });
});

describe("Animation Variants", () => {
  describe("fadeIn", () => {
    it("has hidden and visible states", () => {
      expect(fadeIn.hidden).toBeDefined();
      expect(fadeIn.visible).toBeDefined();
    });
  });

  describe("fadeInUp", () => {
    it("has hidden and visible states", () => {
      expect(fadeInUp.hidden).toBeDefined();
      expect(fadeInUp.visible).toBeDefined();
    });

    it("hidden state includes y offset", () => {
      expect((fadeInUp.hidden as Record<string, unknown>).y).toBeDefined();
    });
  });

  describe("slideInFromRight", () => {
    it("has hidden and visible states", () => {
      expect(slideInFromRight.hidden).toBeDefined();
      expect(slideInFromRight.visible).toBeDefined();
    });

    it("hidden state includes x offset", () => {
      expect((slideInFromRight.hidden as Record<string, unknown>).x).toBeDefined();
    });
  });

  describe("scaleIn", () => {
    it("has hidden and visible states", () => {
      expect(scaleIn.hidden).toBeDefined();
      expect(scaleIn.visible).toBeDefined();
    });

    it("hidden state includes scale", () => {
      expect((scaleIn.hidden as Record<string, unknown>).scale).toBeDefined();
    });
  });

  describe("staggerContainer", () => {
    it("has hidden and visible states", () => {
      expect(staggerContainer.hidden).toBeDefined();
      expect(staggerContainer.visible).toBeDefined();
    });

    it("visible state includes staggerChildren transition", () => {
      const visible = staggerContainer.visible as Record<string, unknown>;
      const transition = visible.transition as Record<string, unknown>;
      expect(transition.staggerChildren).toBeDefined();
    });
  });
});
