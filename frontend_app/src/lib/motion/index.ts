/**
 * Framer Motion Foundation - Shared Animation Tokens and Variants
 *
 * This module provides a consistent animation system for Community Brief.
 * All animations follow accessibility guidelines and respect prefers-reduced-motion.
 *
 * Usage:
 * ```tsx
 * import { fadeInUp, DURATION, EASING } from '@/lib/motion';
 *
 * <motion.div variants={fadeInUp} initial="hidden" animate="visible">
 *   Content
 * </motion.div>
 * ```
 */

import type { Transition, Variants } from "framer-motion";

// =============================================================================
// DURATION TOKENS
// =============================================================================

/**
 * Animation duration tokens in seconds.
 * Use these for consistent timing across the application.
 */
export const DURATION = {
  /** Fast micro-interactions (150ms) - hover states, button presses */
  FAST: 0.15,
  /** Normal transitions (250ms) - fade in, slide in */
  NORMAL: 0.25,
  /** Slow transitions (400ms) - complex layouts, page transitions */
  SLOW: 0.4,
  /** Extra slow (600ms) - orchestrated sequences */
  EXTRA_SLOW: 0.6,
} as const;

export type DurationToken = keyof typeof DURATION;

// =============================================================================
// EASING TOKENS
// =============================================================================

/**
 * Easing functions for natural motion.
 * Based on Material Design motion principles.
 */
export const EASING = {
  /** Standard ease out - for elements entering the screen */
  easeOut: [0.0, 0.0, 0.2, 1.0] as const,
  /** Standard ease in-out - for elements moving within the screen */
  easeInOut: [0.4, 0.0, 0.2, 1.0] as const,
  /** Ease in - for elements exiting the screen */
  easeIn: [0.4, 0.0, 1.0, 1.0] as const,
  /** Natural spring settings for physical motion */
  spring: {
    type: "spring" as const,
    stiffness: 400,
    damping: 30,
  },
  /** Softer spring for larger elements */
  springGentle: {
    type: "spring" as const,
    stiffness: 200,
    damping: 25,
  },
} as const;

// =============================================================================
// BASE TRANSITIONS
// =============================================================================

/**
 * Pre-composed transition objects for common use cases.
 */
export const TRANSITION = {
  /** Fast ease out - micro-interactions */
  fast: {
    duration: DURATION.FAST,
    ease: EASING.easeOut,
  } satisfies Transition,
  /** Normal ease out - standard entry animations */
  normal: {
    duration: DURATION.NORMAL,
    ease: EASING.easeOut,
  } satisfies Transition,
  /** Slow ease in-out - complex transitions */
  slow: {
    duration: DURATION.SLOW,
    ease: EASING.easeInOut,
  } satisfies Transition,
  /** Spring physics - natural motion */
  spring: EASING.spring,
  /** Gentle spring - larger elements */
  springGentle: EASING.springGentle,
} as const;

// =============================================================================
// ANIMATION VARIANTS
// =============================================================================

/**
 * Simple fade in/out animation.
 * Good for: modals, overlays, tooltips
 */
export const fadeIn: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: TRANSITION.normal,
  },
  exit: {
    opacity: 0,
    transition: TRANSITION.fast,
  },
};

/**
 * Fade in with upward motion.
 * Good for: page content, cards, list items
 */
export const fadeInUp: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: TRANSITION.normal,
  },
  exit: {
    opacity: 0,
    y: -5,
    transition: TRANSITION.fast,
  },
};

/**
 * Fade in with downward motion.
 * Good for: dropdowns, menus appearing from above
 */
export const fadeInDown: Variants = {
  hidden: {
    opacity: 0,
    y: -10,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: TRANSITION.normal,
  },
  exit: {
    opacity: 0,
    y: 5,
    transition: TRANSITION.fast,
  },
};

/**
 * Slide in from the right side.
 * Good for: sidebars, detail panels, drawers
 */
export const slideInFromRight: Variants = {
  hidden: {
    opacity: 0,
    x: 20,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: TRANSITION.normal,
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: TRANSITION.fast,
  },
};

/**
 * Slide in from the left side.
 * Good for: navigation, left sidebars
 */
export const slideInFromLeft: Variants = {
  hidden: {
    opacity: 0,
    x: -20,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: TRANSITION.normal,
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: TRANSITION.fast,
  },
};

/**
 * Scale in animation.
 * Good for: buttons, icons, small elements
 */
export const scaleIn: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: TRANSITION.normal,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: TRANSITION.fast,
  },
};

/**
 * Pop in with spring physics.
 * Good for: notifications, badges, attention-grabbing elements
 */
export const popIn: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: EASING.spring,
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: TRANSITION.fast,
  },
};

/**
 * Container variant for staggered children animations.
 * Use with child variants like fadeInUp for lists.
 *
 * @example
 * ```tsx
 * <motion.ul variants={staggerContainer} initial="hidden" animate="visible">
 *   <motion.li variants={fadeInUp}>Item 1</motion.li>
 *   <motion.li variants={fadeInUp}>Item 2</motion.li>
 * </motion.ul>
 * ```
 */
export const staggerContainer: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

/**
 * Fast stagger for small lists.
 */
export const staggerContainerFast: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05,
    },
  },
};

/**
 * Slower stagger for emphasized sequences.
 */
export const staggerContainerSlow: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.15,
    },
  },
};

// =============================================================================
// LIST ANIMATION VARIANTS
// =============================================================================

/**
 * Container variant optimized for list animations.
 * Use with listItemFadeInUp for staggered list item animations.
 *
 * Features moderate delayChildren and staggerChildren timing
 * suitable for data lists, navigation menus, and similar content.
 *
 * @example
 * ```tsx
 * <motion.ul variants={listContainerStagger} initial="hidden" animate="visible">
 *   <motion.li variants={listItemFadeInUp}>Item 1</motion.li>
 *   <motion.li variants={listItemFadeInUp}>Item 2</motion.li>
 * </motion.ul>
 * ```
 */
export const listContainerStagger: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.08,
    },
  },
};

/**
 * Child item variant for list animations.
 * Provides a subtle fade-in-up animation optimized for list items.
 *
 * Animation: opacity 0→1, y 8→0 over ~0.2s
 *
 * Use as children of listContainerStagger for staggered list entry.
 *
 * @example
 * ```tsx
 * <motion.li variants={listItemFadeInUp}>
 *   List item content
 * </motion.li>
 * ```
 */
export const listItemFadeInUp: Variants = {
  hidden: {
    opacity: 0,
    y: 8,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: EASING.easeOut,
    },
  },
};

// =============================================================================
// RE-EXPORTS FROM FRAMER MOTION
// =============================================================================

// Re-export AnimatePresence for convenience
export { AnimatePresence, motion } from "framer-motion";

// Re-export types
export type { Variants, Transition, TargetAndTransition } from "framer-motion";

