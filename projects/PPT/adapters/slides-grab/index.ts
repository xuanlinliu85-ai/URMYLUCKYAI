export type SlidesGrabAdapter = {
  available: boolean;
  purpose: "style-preview-only";
  renderPreview?: (input: unknown) => Promise<unknown>;
};

export const slidesGrab: SlidesGrabAdapter = {
  available: false,
  purpose: "style-preview-only"
};

// This bounded adapter may accelerate HTML/CSS style exploration. It never owns
// storyline, final Style DNA, slide plans, or the final editable-PPTX decision.
