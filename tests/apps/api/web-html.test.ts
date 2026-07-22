import { describe, expect, it } from 'vitest';

import { loadWebIndexHtml } from '../../../apps/api/src/index.js';

describe('Agent Console index.html', () => {
  const html = loadWebIndexHtml();

  it('is a complete HTML document', () => {
    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('declares UTF-8 and viewport', () => {
    expect(html).toMatch(/charset=["']?UTF-8/i);
    expect(html).toMatch(/viewport/i);
  });

  it('shows the "Agent Console" title', () => {
    expect(html).toContain('Agent Console');
    expect(html).toMatch(/<title>[^<]*Agent Console/i);
  });

  it('has the dual-panel layout: Conversation + Execution Timeline', () => {
    expect(html).toMatch(/id="conversation"/);
    expect(html).toMatch(/id="timeline"/);
    expect(html).toContain('Conversation');
    expect(html).toContain('Execution Timeline');
  });

  it('uses CSS Grid for the two-column layout', () => {
    expect(html).toMatch(/grid-template-columns:\s*1fr\s+360px/);
  });

  it('has input textarea with id="input"', () => {
    expect(html).toMatch(/<textarea[^>]*\bid="input"/);
  });

  it('has Send and Clear buttons', () => {
    expect(html).toContain('id="send-btn"');
    expect(html).toContain('id="clear-btn"');
  });

  it('POSTs to /agent via fetch', () => {
    expect(html).toMatch(/fetch\(['"]\/agent['"]/);
  });

  it('declares an SSE frame parser using \\n\\n', () => {
    expect(html).toContain('parseSSEStream');
    expect(html).toContain('parseFrame');
    expect(html).toMatch(/\\n\\n/);
  });

  it('routes every AgentEvent kind in dispatch()', () => {
    const kinds = [
      'message_start',
      'iteration',
      'tool_call',
      'tool_result',
      'message_end',
      'done',
      'error',
    ];
    for (const k of kinds) {
      expect(html).toContain(`case '${k}'`);
    }
  });

  it('shows the user input in Conversation and timeline steps in Timeline', () => {
    // 左栏 message role classes
    expect(html).toContain("'user'");
    expect(html).toContain("'ai'");
    expect(html).toContain("'error'");
    // 右栏 timeline status
    expect(html).toContain('timeline-step');
    expect(html).toContain('addTimelineStep');
  });

  it('does not load any external CSS / JS / fonts', () => {
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(html).not.toMatch(/<script[^>]+src=["']https?:/i);
  });
});
