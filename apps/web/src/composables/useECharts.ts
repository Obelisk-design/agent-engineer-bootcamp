/**
 * apps/web/src/composables/useECharts.ts
 * Day 23 Task 3 (P2) —— ECharts 按需引入 + 响应式 option composable
 *
 * 用法：
 *   const chartOption = computed(() => ({ ... }))
 *   const chartEl = useECharts(chartOption)
 *   <div ref="chartEl" style="width:100%;height:300px"></div>
 *
 * 按需引入 echarts/core + BarChart/LineChart 等，比全量 import 'echarts' 节省 bundle。
 *
 * 实现要点（Fix round 1）：
 * - 用 watchEffect 同时监听 el.value 与 optionRef.value
 * - el 进 DOM 后再 echarts.init（支持 v-if / async data 场景，避免冷加载 div 还不存在就跳过 init）
 * - chart 用 if (!chart) 守卫，避免 watchEffect 重复触发时重复 init
 * - 加 window resize 监听，sidebar 折叠导致主区尺寸变化时 chart 自动 resize
 */
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { onBeforeUnmount, ref, watchEffect, type Ref } from 'vue';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  CanvasRenderer,
]);

export function useECharts(optionRef: Ref<unknown>) {
  const el = ref<HTMLDivElement | null>(null);
  let chart: echarts.ECharts | null = null;

  watchEffect(() => {
    // el 进 DOM 后才 init（支持 v-if / async data 场景）
    if (el.value && !chart) {
      chart = echarts.init(el.value);
    }
    if (chart && el.value) {
      chart.setOption(optionRef.value as echarts.EChartsCoreOption, true);
    }
  });

  // 监听 sidebar 折叠导致的主区 resize
  let onResize: (() => void) | null = null;
  if (typeof window !== 'undefined') {
    onResize = (): void => {
      chart?.resize();
    };
    window.addEventListener('resize', onResize);
  }

  onBeforeUnmount(() => {
    chart?.dispose();
    chart = null;
    if (onResize) window.removeEventListener('resize', onResize);
  });

  return el;
}
