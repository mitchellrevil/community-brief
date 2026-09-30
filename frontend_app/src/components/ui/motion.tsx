/**
 * Framer Motion UI Components
 *
 * Pre-typed motion wrappers for common HTML elements.
 * These provide ergonomic access to framer-motion with proper TypeScript types.
 *
 * Usage:
 * ```tsx
 * import { MotionDiv, MotionSection } from '@/components/ui/motion';
 *
 * <MotionDiv variants={fadeInUp} initial="hidden" animate="visible">
 *   Content
 * </MotionDiv>
 * ```
 */

import { motion } from "framer-motion";
import type { ComponentPropsWithoutRef, ElementType } from "react";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Helper type for motion component props.
 * Combines base HTML element props with framer-motion props.
 */
type MotionComponentProps<T extends ElementType> = ComponentPropsWithoutRef<
  (typeof motion)[T & keyof typeof motion]
>;

// =============================================================================
// LAYOUT COMPONENTS
// =============================================================================

/**
 * Motion-enabled div element.
 * The most commonly used motion wrapper.
 */
export const MotionDiv = motion.div;
export type MotionDivProps = MotionComponentProps<"div">;

/**
 * Motion-enabled section element.
 * Good for page sections and major content areas.
 */
export const MotionSection = motion.section;
export type MotionSectionProps = MotionComponentProps<"section">;

/**
 * Motion-enabled article element.
 * Good for blog posts, cards, and self-contained content.
 */
export const MotionArticle = motion.article;
export type MotionArticleProps = MotionComponentProps<"article">;

/**
 * Motion-enabled main element.
 * For the main content area of a page.
 */
export const MotionMain = motion.main;
export type MotionMainProps = MotionComponentProps<"main">;

/**
 * Motion-enabled aside element.
 * For sidebars and supplementary content.
 */
export const MotionAside = motion.aside;
export type MotionAsideProps = MotionComponentProps<"aside">;

/**
 * Motion-enabled header element.
 */
export const MotionHeader = motion.header;
export type MotionHeaderProps = MotionComponentProps<"header">;

/**
 * Motion-enabled footer element.
 */
export const MotionFooter = motion.footer;
export type MotionFooterProps = MotionComponentProps<"footer">;

/**
 * Motion-enabled nav element.
 */
export const MotionNav = motion.nav;
export type MotionNavProps = MotionComponentProps<"nav">;

// =============================================================================
// LIST COMPONENTS
// =============================================================================

/**
 * Motion-enabled unordered list.
 * Use with staggerContainer variants for staggered list animations.
 */
export const MotionUl = motion.ul;
export type MotionUlProps = MotionComponentProps<"ul">;

/**
 * Motion-enabled ordered list.
 */
export const MotionOl = motion.ol;
export type MotionOlProps = MotionComponentProps<"ol">;

/**
 * Motion-enabled list item.
 * Use with fadeInUp or similar variants as children of MotionUl/MotionOl.
 */
export const MotionLi = motion.li;
export type MotionLiProps = MotionComponentProps<"li">;

// =============================================================================
// INLINE COMPONENTS
// =============================================================================

/**
 * Motion-enabled span element.
 * For inline text animations.
 */
export const MotionSpan = motion.span;
export type MotionSpanProps = MotionComponentProps<"span">;

/**
 * Motion-enabled paragraph element.
 */
export const MotionP = motion.p;
export type MotionPProps = MotionComponentProps<"p">;

// =============================================================================
// HEADING COMPONENTS
// =============================================================================

/**
 * Motion-enabled heading elements.
 */
export const MotionH1 = motion.h1;
export const MotionH2 = motion.h2;
export const MotionH3 = motion.h3;
export const MotionH4 = motion.h4;
export const MotionH5 = motion.h5;
export const MotionH6 = motion.h6;

// =============================================================================
// FORM COMPONENTS
// =============================================================================

/**
 * Motion-enabled form element.
 */
export const MotionForm = motion.form;
export type MotionFormProps = MotionComponentProps<"form">;

/**
 * Motion-enabled button element.
 * Good for press/hover animations.
 */
export const MotionButton = motion.button;
export type MotionButtonProps = MotionComponentProps<"button">;

// =============================================================================
// MEDIA COMPONENTS
// =============================================================================

/**
 * Motion-enabled image element.
 */
export const MotionImg = motion.img;
export type MotionImgProps = MotionComponentProps<"img">;

/**
 * Motion-enabled figure element.
 */
export const MotionFigure = motion.figure;
export type MotionFigureProps = MotionComponentProps<"figure">;

// =============================================================================
// TABLE COMPONENTS
// =============================================================================

/**
 * Motion-enabled table row.
 */
export const MotionTr = motion.tr;
export type MotionTrProps = MotionComponentProps<"tr">;

// =============================================================================
// DEFAULT EXPORT FOR CONVENIENCE
// =============================================================================

/**
 * Collection of all motion components for convenient destructuring.
 */
export const Motion = {
  div: MotionDiv,
  section: MotionSection,
  article: MotionArticle,
  main: MotionMain,
  aside: MotionAside,
  header: MotionHeader,
  footer: MotionFooter,
  nav: MotionNav,
  ul: MotionUl,
  ol: MotionOl,
  li: MotionLi,
  span: MotionSpan,
  p: MotionP,
  h1: MotionH1,
  h2: MotionH2,
  h3: MotionH3,
  h4: MotionH4,
  h5: MotionH5,
  h6: MotionH6,
  form: MotionForm,
  button: MotionButton,
  img: MotionImg,
  figure: MotionFigure,
  tr: MotionTr,
} as const;
