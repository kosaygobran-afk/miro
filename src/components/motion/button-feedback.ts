// The stylesheet decides whether the current appearance and motion settings
// allow this effect. Restart only our animation if activations overlap.
const active = new WeakMap<Element, CSSAnimation>();
type Feedback = "save" | "unsave" | "peek" | "cart" | "count" | "step";

const feedbackAnimationNames: Record<Feedback, string> = {
  save: "motion-heart-pulse",
  unsave: "motion-heart-pulse",
  peek: "sf-feedback-peek",
  cart: "motion-icon-beat",
  count: "sf-feedback-count",
  step: "sf-feedback-step",
};

export function playButtonFeedback(target: Element | null, feedback: Feedback) {
  if (!target?.getAnimations) return;
  if (feedback === "save" || feedback === "unsave") {
    // Hover uses the same keyframes. Drop the old CSS animation before starting
    // the click pulse so it cannot inherit the hover pulse's time or end state.
    active.delete(target);
    target.setAttribute("data-button-effect", "");
    target.getAnimations();
  }
  target.setAttribute("data-button-effect", feedback);
  const animationName = feedbackAnimationNames[feedback];
  const animation = target
    .getAnimations()
    .find(
      (effect): effect is CSSAnimation =>
        "animationName" in effect && effect.animationName === animationName,
    );
  if (!animation) {
    active.delete(target);
    target.removeAttribute("data-button-effect");
    return;
  }
  active.set(target, animation);
  animation.currentTime = 0;
  animation.onfinish = animation.oncancel = () => {
    if (active.get(target) === animation) {
      active.delete(target);
      target.removeAttribute("data-button-effect");
    }
  };
}

export function playGalleryArrowFeedback(event: {
  currentTarget: HTMLButtonElement;
}) {
  playButtonFeedback(event.currentTarget.querySelector("svg"), "step");
}
