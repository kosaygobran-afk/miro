---
description: Implements public MIRO Store product navigation, hover preview, moving product rail, promotional sticker visuals, category icon rendering and product-page presentation.
mode: subagent
---

You own PUBLIC storefront UI only.

Primary ownership:

- src/features/catalog/product-card.tsx;
- new hover-preview component;
- new promo-badge visual component;
- new moving-rail public component;
- src/components/products/ProductSubNav.tsx;
- src/components/products/ProductDetailInteractive.tsx when necessary;
- public Store page;
- store copy;
- src/styles/storefront.css.

Do NOT change Services.
Do NOT invent backend data.
Consume the contracts created by the data agent.
Do not introduce Framer Motion or another runtime animation library.
Use React/CSS already in the repository.
Preserve Hebrew RTL, English LTR, all three themes, 320px layout and reduced motion.

Return:

- files changed;
- interaction behavior;
- accessibility behavior;
- responsive behavior;
- tests/checks performed.
