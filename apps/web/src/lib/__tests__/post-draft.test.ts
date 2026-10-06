/**
 * @vitest-environment node
 *
 * The publish check against the serialiser it reads (ADR 0034). The fixture draft is the approved
 * draft the every-block fixture would come from, written in the variant Markdown a draft may use. A
 * change to how `postToMarkdown` escapes or lays out a block fails here, in CI, rather than at the
 * next publish.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FOOTER_LINES } from '@/data/posts';
import { everyBlockPost } from '@/test/fixtures/posts';
// A plain script at the repository root, outside the app: imported by path, as no package exports it.
import {
  FOOTER_LINES as CHECKED_FOOTER_LINES,
  differences,
} from '../../../../../scripts/post-draft-check.mjs';
import { postToMarkdown } from '../serialise';

const draft = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test', 'fixtures', 'post-draft.md'),
  'utf8',
);

describe('the publish check, against the serialiser', () => {
  it("finds no difference between the fixture draft and the every-block fixture's twin", () => {
    expect(differences(draft, postToMarkdown(everyBlockPost), 'own')).toEqual([]);
  });

  it('accepts the same post as jev with its footer, and refuses that footer for own', () => {
    const twin = postToMarkdown({ ...everyBlockPost, kind: 'jev' });
    expect(differences(draft, twin, 'jev')).toEqual([]);
    expect(differences(draft, twin, 'own')).toEqual([expect.stringMatching(/^the footer is /)]);
  });

  it("keeps the check's copy of the footer lines equal to the site's", () => {
    expect(CHECKED_FOOTER_LINES).toEqual(FOOTER_LINES);
  });
});
