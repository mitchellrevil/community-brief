/**
 * Motion List Helper Components
 *
 * Pre-configured motion wrappers for list containers and items.
 * These provide ergonomic staggered list animations with sensible defaults.
 *
 * Usage:
 * ```tsx
 * import { MotionList, MotionListItem } from '@/components/ui/motion-list';
 *
 * <MotionList as="ul">
 *   <MotionListItem as="li">Item 1</MotionListItem>
 *   <MotionListItem as="li">Item 2</MotionListItem>
 * </MotionList>
 * ```
 */

import { motion } from "framer-motion";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { listContainerStagger, listItemFadeInUp } from "@/lib/motion";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Supported HTML elements for MotionList container.
 */
type ListContainerElement = "div" | "ul" | "ol" | "tbody" | "section" | "nav";

/**
 * Supported HTML elements for MotionListItem.
 */
type ListItemElement = "div" | "li" | "tr" | "span" | "article";

/**
 * Props for MotionList component.
 */
type MotionListProps<T extends ListContainerElement = "div"> = {
  /** HTML element to render. Default: "div" */
  as?: T;
  /** Children to render inside the list container */
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<(typeof motion)[T]>, "as">;

/**
 * Props for MotionListItem component.
 */
type MotionListItemProps<T extends ListItemElement = "div"> = {
  /** HTML element to render. Default: "div" */
  as?: T;
  /** Children to render inside the list item */
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<(typeof motion)[T]>, "as">;

// =============================================================================
// COMPONENTS
// =============================================================================

/**
 * Motion-enabled list container with staggered children animation.
 *
 * Renders with `listContainerStagger` variants by default.
 * Use `initial="hidden"` and `animate="visible"` (applied by default) to trigger animation.
 *
 * @example
 * ```tsx
 * // As a ul element
 * <MotionList as="ul" className="space-y-2">
 *   <MotionListItem as="li">Item 1</MotionListItem>
 *   <MotionListItem as="li">Item 2</MotionListItem>
 * </MotionList>
 *
 * // As a table body
 * <table>
 *   <MotionList as="tbody">
 *     <MotionListItem as="tr"><td>Row 1</td></MotionListItem>
 *   </MotionList>
 * </table>
 * ```
 */
export function MotionList<T extends ListContainerElement = "div">({
  as,
  children,
  variants = listContainerStagger,
  initial = "hidden",
  animate = "visible",
  ...props
}: MotionListProps<T>) {
  const Component = motion[as ?? "div"] as ElementType;

  return (
    <Component
      variants={variants}
      initial={initial}
      animate={animate}
      {...props}
    >
      {children}
    </Component>
  );
}

/**
 * Motion-enabled list item with fade-in-up animation.
 *
 * Renders with `listItemFadeInUp` variants by default.
 * Inherits animation state from parent MotionList container.
 *
 * @example
 * ```tsx
 * <MotionListItem as="li" className="p-2">
 *   List item content
 * </MotionListItem>
 *
 * <MotionListItem as="tr">
 *   <td>Table cell</td>
 * </MotionListItem>
 * ```
 */
export function MotionListItem<T extends ListItemElement = "div">({
  as,
  children,
  variants = listItemFadeInUp,
  ...props
}: MotionListItemProps<T>) {
  const Component = motion[as ?? "div"] as ElementType;

  return (
    <Component variants={variants} {...props}>
      {children}
    </Component>
  );
}
