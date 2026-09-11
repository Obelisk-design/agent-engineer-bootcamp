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
import { onMounted, onBeforeUnmount, ref, watch, type Ref } from 'vue';

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

  onMounted(() => {
    if (el.value) chart = echarts.init(el.value);
    chart?.setOption(optionRef.value as echarts.EChartsCoreOption);
  });

  watch(
    optionRef,
    (opt) => {
      chart?.setOption(opt as echarts.EChartsCoreOption, true);
    },
    { deep: true },
  );

  onBeforeUnmount(() => {
    chart?.dispose();
    chart = null;
  });

  return el;
}
