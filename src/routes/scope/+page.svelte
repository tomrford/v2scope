<script lang="ts">
  import { Plot } from "$lib/components/plot";
  import { Button } from "$lib/components/ui/button";
  import { Item } from "$lib/components/ui/item";
  import type uPlot from "uplot";

  // Generate dummy sine wave data
  function generateDummyData(
    points: number,
    frequency: number,
    phase: number,
  ): uPlot.AlignedData {
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < points; i++) {
      const t = i * 0.01;
      x.push(t);
      y.push(Math.sin(2 * Math.PI * frequency * t + phase));
    }
    return [x, y];
  }

  const plotData: uPlot.AlignedData[] = [
    generateDummyData(100, 1, 0),
    generateDummyData(100, 2, 0.5),
    generateDummyData(100, 0.5, 1),
    generateDummyData(100, 3, 0.25),
    generateDummyData(100, 1.5, 2),
  ];

  const colors = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7"];
</script>

<div class="flex h-full flex-col gap-4">
  <!-- Settings buttons -->
  <div class="flex gap-2">
    <Button variant="outline">Channels</Button>
    <Button variant="outline">Timing</Button>
    <Button variant="outline">Trigger</Button>
    <Button variant="outline">Display</Button>
  </div>

  <!-- 5 channel plots, stacked with shared x-axis -->
  <div class="flex min-h-0 flex-1 flex-col gap-1">
    {#each plotData as data, i (i)}
      <Item variant="outline" class="min-h-0 flex-1 p-0">
        <Plot
          {data}
          series={[{ label: `Ch${i + 1}`, stroke: colors[i] }]}
          syncKey="scope"
          showXAxis={false}
          showLegend={false}
          showCursor={false}
          class="h-full w-full"
        />
      </Item>
    {/each}
  </div>
</div>
