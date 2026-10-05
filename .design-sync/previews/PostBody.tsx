import { PostBody } from 'web';

// No post is published yet, so this body is written for the card: one of each block the renderer
// draws (both heading levels, a paragraph with inline code and both kinds of link, both list
// styles, a code block and a quote). Each story carries its blocks inline, because the stories
// become the usage examples the design agent copies. On the site the body sits in a max-w-3xl
// article column.

export const Article = () => (
  <div className="mx-auto max-w-3xl px-6 py-8">
    <PostBody
      blocks={[
        { kind: 'heading', level: 2, text: 'Why a cache hit is a hash, not a timestamp' },
        {
          kind: 'paragraph',
          content: [
            'A build cache answers one question: has this exact input been built before? The key is a hash of everything the task reads, so ',
            { code: 'nx build' },
            ' can replay a cached result without trusting a clock. The ',
            { text: 'case study', href: '/work/nx-remote-cache' },
            ' covers the server, and the ',
            { text: 'Nx documentation', href: 'https://nx.dev/docs/concepts/how-caching-works' },
            ' covers the hashing.',
          ],
        },
        {
          kind: 'list',
          items: [
            ['The source files of the project and of everything it depends on'],
            ['The command the task runs, and its flags'],
            ['The runtime values named in the task’s ', { code: 'inputs' }],
          ],
        },
        { kind: 'heading', level: 3, text: 'Reading an entry' },
        {
          kind: 'list',
          ordered: true,
          items: [
            ['Hash the inputs.'],
            ['Look the hash up in the remote store.'],
            ['On a hit, restore the outputs and replay the logs.'],
          ],
        },
        {
          kind: 'code',
          language: 'ts',
          code: 'const key = hashInputs(task.inputs);\nconst entry = await store.get(key);\nif (entry) return restore(entry);',
        },
        {
          kind: 'quote',
          content: [
            'A cache that can be wrong is worse than no cache: key it on what the task reads, never on when it ran.',
          ],
        },
      ]}
    />
  </div>
);

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] text-[var(--foreground)]">
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PostBody
        blocks={[
          { kind: 'heading', level: 2, text: 'Why a cache hit is a hash, not a timestamp' },
          {
            kind: 'paragraph',
            content: [
              'The key is a hash of everything the task reads, so ',
              { code: 'nx build' },
              ' can replay a cached result without trusting a clock. The ',
              { text: 'Nx documentation', href: 'https://nx.dev/docs/concepts/how-caching-works' },
              ' covers the hashing.',
            ],
          },
          {
            kind: 'code',
            language: 'ts',
            code: 'const key = hashInputs(task.inputs);\nconst entry = await store.get(key);',
          },
          {
            kind: 'quote',
            content: ['Key a cache on what the task reads, never on when it ran.'],
          },
        ]}
      />
    </div>
  </div>
);
