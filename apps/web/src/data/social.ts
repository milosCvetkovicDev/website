/**
 * The social profiles, the one place their URLs are written (#49). The footer, the JSON-LD Person's
 * `sameAs`, the Connect page and the calls to action on /about, /skills, /work, the case studies and
 * the home page's closing section all read them from here. Each component still draws its own icon,
 * because they differ in size and stroke; the copy around a link (a card's heading, a button label)
 * stays with the page that shows it.
 *
 * `data/__tests__/social.test.ts` fails when a profile URL is written anywhere else under `src`.
 */

export type SocialProfileId = 'linkedin' | 'github' | 'x';

export interface SocialProfile {
  readonly id: SocialProfileId;
  /** The platform's name, as a link to the profile is labelled when nothing else names it. */
  readonly name: string;
  /** The profile page. Every reader renders it as an external link, so it must be absolute. */
  readonly href: `https://${string}`;
  /** The account name, as it appears at the end of `href`: no `@`, no slashes. */
  readonly handle: string;
}

/** Each profile by its id, for a reader that links to one of them. */
export const social = {
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    href: 'https://www.linkedin.com/in/milos-cvetkovic-dev',
    handle: 'milos-cvetkovic-dev',
  },
  github: {
    id: 'github',
    name: 'GitHub',
    href: 'https://github.com/milosCvetkovicDev',
    handle: 'milosCvetkovicDev',
  },
  x: {
    id: 'x',
    name: 'X',
    href: 'https://x.com/milos_dev',
    handle: 'milos_dev',
  },
} as const satisfies { readonly [Id in SocialProfileId]: SocialProfile & { readonly id: Id } };

/** Every profile, in the order the site lists them: the footer's icons and the Person's `sameAs`. */
export const socialProfiles: readonly SocialProfile[] = [social.linkedin, social.github, social.x];
