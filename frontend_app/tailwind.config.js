/**
 * Tailwind v4 config (ESM). Centralizes breakpoints and size tokens
 * so we can avoid ad-hoc pixel-based arbitrary values.
 */
export default {
  theme: {
    extend: {
      screens: {
        xs: "375px",
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "content-xl": "1536px",
        "2xl": "1440px",
      },
      maxWidth: {
        card: "28rem", // ~448px
        dialog: "32rem", // ~512px
        sheet: "36rem", // ~576px
        "content-wide": "72rem", // ~1152px
      },
      minWidth: {
        touch: "2.75rem", // >=44px touch target
        field: "10rem", // common select/input minimum
      },
      // The `header` height uses the CSS variable `--header-height` defined in `styles.css`.
      // If you update or remove `--header-height` in `styles.css`, update this token accordingly.
      height: {
        header: "var(--header-height)",
      },
    },
  },
};
