/**
 * Card-surface preview triggers.
 *
 * Hover-to-preview is temporarily disabled at the owner's request: moving the
 * pointer over a product card or moving-rail card must not open the popup.
 * The eye button (`openExplicitly`) and keyboard focus remain the only
 * triggers. Set this back to `true` to restore the hover-intent contract; both
 * card components keep their hover handlers wired in either mode.
 */
export const PRODUCT_PREVIEW_HOVER_ENABLED = false;
