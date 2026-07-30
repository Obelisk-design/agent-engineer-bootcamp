/**
 * apps/web/src/components/icons.ts
 *
 * Inline SVG icon library —— 无外部依赖。
 * 每个 icon 是单个 <path d="..."/>，所有 icon 都是 24x24 viewBox，
 * stroke="currentColor" —— 让父级 text-* color 控制色。
 *
 * 设计原则：
 * - 不要装 lucide / heroicons（避免 Node 新依赖，符合 CLAUDE.md YAGNI）
 * - 用 component 函数式 + h() 渲染，比 compile-time 更类型安全
 */

import { defineComponent, h } from 'vue';

export default defineComponent({
  name: 'IconBase',
  props: {
    size: { type: Number, default: 16 },
    class: { type: String, default: '' },
  },
  setup(props) {
    return () =>
      h(
        'svg',
        {
          width: props.size,
          height: props.size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.75,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          class: props.class,
          'aria-hidden': 'true',
        },
        [],
      );
  },
});

function makeIcon(d: string) {
  return defineComponent({
    props: {
      size: { type: Number, default: 16 },
      class: { type: String, default: '' },
    },
    setup(props) {
      return () =>
        h(
          'svg',
          {
            width: props.size,
            height: props.size,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': 1.75,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            class: props.class,
            'aria-hidden': 'true',
          },
          [h('path', { d })],
        );
    },
  });
}

export const IconPlay = makeIcon('M5 3l14 9-14 9V3z');
export const IconStop = makeIcon('M5 5h14v14H5z');
export const IconSend = makeIcon('M5 12l14 0M13 5l7 7-7 7');
export const IconChat = makeIcon(
  'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
);
export const IconList = makeIcon('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01');
export const IconCpu = makeIcon(
  'M4 4h16v16H4zM9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3',
);
export const IconActivity = makeIcon('M22 12h-4l-3 9L9 3l-3 9H2');
export const IconChevronRight = makeIcon('M9 6l6 6-6 6');
export const IconChevronDown = makeIcon('M6 9l6 6 6-6');
export const IconChevronLeft = makeIcon('M15 6l-6 6 6 6');
export const IconBolt = makeIcon('M13 2L3 14h9l-1 8 10-12h-9l1-8z');
export const IconLayers = makeIcon('M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5');
export const IconCircle = makeIcon('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z');
export const IconCircleDot = makeIcon(
  'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
);
export const IconSearch = makeIcon('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35');
export const IconCopy = makeIcon(
  'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
);
export const IconRefresh = makeIcon(
  'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
);
export const IconCheck = makeIcon('M20 6L9 17l-5-5');
export const IconClose = makeIcon('M18 6L6 18M6 6l12 12');
export const IconWrench = makeIcon(
  'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
);
export const IconArrowUp = makeIcon('M12 19V5M5 12l7-7 7 7');
export const IconArrowDown = makeIcon('M12 5v14M5 12l7 7 7-7');
export const IconLoader = makeIcon(
  'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',
);
export const IconSidebar = makeIcon('M3 5h18v14H3zM9 5v14');
export const IconUser = makeIcon(
  'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
);
export const IconBot = makeIcon('M12 8V4H8M4 8h16v12H4zM9 13h.01M15 13h.01M9 17h6');
export const IconBug = makeIcon(
  'M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6zM2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41',
);
