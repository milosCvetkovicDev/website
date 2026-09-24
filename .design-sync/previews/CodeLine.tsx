import { CodeLine, Terminal } from 'web';

export const NumberedListing = () => (
  <Terminal title="src/agent/analyzer.ts">
    <CodeLine lineNumber={1}>
      <span className="text-[var(--accent-text)]">export class</span> ErrorAnalyzer {'{'}
    </CodeLine>
    <CodeLine lineNumber={2}>
      <span className="whitespace-pre">{'  '}</span>
      <span className="text-[var(--accent-text)]">async</span> analyze(error: Error) {'{'}
    </CodeLine>
    <CodeLine lineNumber={3} highlighted>
      <span className="whitespace-pre">{'    '}</span>const context = await this.getCodeContext();
    </CodeLine>
    <CodeLine lineNumber={4}>
      <span className="whitespace-pre">{'    '}</span>return this.claude.diagnose(error, context);
    </CodeLine>
    <CodeLine lineNumber={5}>
      <span className="whitespace-pre">{'  '}</span>
      {'}'}
    </CodeLine>
    <CodeLine lineNumber={6}>{'}'}</CodeLine>
  </Terminal>
);

export const WithoutNumbers = () => (
  <Terminal title="diff">
    <CodeLine>
      <span className="text-[var(--status-err)]">- const user = order.user.profile;</span>
    </CodeLine>
    <CodeLine highlighted>
      <span className="text-[var(--status-ok)]">+ const user = order.user?.profile;</span>
    </CodeLine>
  </Terminal>
);
