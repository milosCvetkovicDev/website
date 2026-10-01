// The stretched title link shared by the home page's featured cards and the /work archive cards.
//
// The title link is stretched over the whole card by its ::after pseudo-element, so the card stays
// a single click, hover and focus target while the link's accessible name is exactly its visible
// text, as WCAG 2.5.3 (Label in Name) requires. Everything else on the card is ordinary content for
// assistive technology, and the description is attached to the link with aria-describedby. The
// overlay reaches 1px past the padding box so the border ring is part of the hit area too. The
// focus outline is drawn on the overlay so it frames the card, and it is an outline rather than a
// ring so it survives forced-colors mode, where box-shadow is not painted.
//
// The card that uses it must be the overlay's containing block and stacking context (`relative
// isolate`), and it adds the corner radius of its own border to the overlay (`after:rounded`,
// `after:rounded-lg`) so the outline follows the card's corners.
// Constraint: the overlay is the pointer target for the whole card, so nothing else inside the
// card may be interactive, and text inside it cannot be selected with the mouse.
export const CARD_LINK =
  'after:absolute after:-inset-px after:z-10 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--accent)]';
