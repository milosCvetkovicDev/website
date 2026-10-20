---
title: "Fixture: every block and inline kind"
slug: fixture-every-block
description: A test fixture that uses each block kind and each inline kind once or more, so a renderer that drops one is caught.
date: 2026-08-03
---

A paragraph of plain text, then inline code: `buildPostIndex(posts)`, then a link to
[the work page](/work) and one to [an external page](https://example.com/fixture?kind=link#inline).

## A level-two heading

* A bullet item of plain text.
* A bullet item with `inline code` in it.
* [A bullet item that is a link](/blog)

### A level-three heading

1. The first numbered item.
1. The second numbered item.

~~~ts
const greeting = 'fixture';
console.log(greeting);
~~~

```
A code block with no language.
```

> A quotation, with `code` and plain text in it.

Table: Fixture: a table of three columns
| Fixture run | Blocks | Result                             |
| :---------- | -----: | ---------------------------------- |
| First run   | 9      | Every block rendered               |
| Second run  | 9      | The same, with \| and \* in a cell |
