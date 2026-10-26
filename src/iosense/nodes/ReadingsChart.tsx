import { useMemo, useRef } from 'react';
import { Chart, LineChart, bucketRange, type ChartHandle, type ChartProps } from '@faclon-labs/fds/chart';
import { toNumber } from '../engine/operators';
import { recentReadings } from '../engine/readings';
import type { DeviceAlertConfig, DeviceParameter } from '../domain/types';

type Range = NonNullable<ChartProps['fixedRange']>;

/**
 * The chosen reading over the last 24 hours (hourly peaks, or lows for a
 * "below" alert), with the limit drawn across it: the line takes the alert
 * colour wherever it is past the limit (FDS LineChart: threshold mode plus a
 * plotLine). Under it, how many hours this limit would have fired.
 */
export function ReadingsChart({ deviceId, parameter, config }: { deviceId: string; parameter: DeviceParameter; config: DeviceAlertConfig }) {
  const chartRef = useRef<ChartHandle>(null);
  const limit = toNumber(config.limit);
  const hasLimit = Number.isFinite(limit);
  const above = config.op === 'above';

  const data = useMemo(() => {
    const readings = recentReadings(deviceId, parameter.key, Date.now());
    if (readings.length === 0) return null;
    const range: Range = [new Date(readings[0].t), new Date(readings[readings.length - 1].t)];
    const buckets = bucketRange(range, 'Hourly');
    const points = buckets.map((b) => {
      const inHour = readings.filter((r) => r.t >= b.start.getTime() && r.t <= b.end.getTime()).map((r) => r.v);
      if (inHour.length === 0) return null;
      return above ? Math.max(...inHour) : Math.min(...inHour);
    });
    return { range, buckets, points };
  }, [deviceId, parameter.key, above]);

  if (!data) return null;
  const unit = parameter.unit;
  const crossed = hasLimit ? data.points.filter((v) => v !== null && (above ? v > limit : v < limit)).length : 0;
  const word = above ? 'above' : 'below';

  return (
    <section className="io-preview" aria-label="Recent readings">
      <Chart
        title={`${parameter.label}, last 24 hours`}
        info={`Simulated readings. Each point is the hour's ${above ? 'highest' : 'lowest'} value.`}
        fixedRange={data.range}
        fixedRangeLabel="Last 24 hours"
        fixedPeriodicity="Hourly"
        showSettings={false}
        chartRef={chartRef}
        height={380}
        exportFilename={`${parameter.label.toLowerCase().replace(/\W+/g, '-')}-last-24-hours`}
      >
        <LineChart
          ref={chartRef}
          categories={data.buckets.map((b) => b.label)}
          tooltipCategories={data.buckets.map((b) => b.tooltipLabel)}
          series={[{ name: parameter.label, data: data.points }]}
          yAxisUnit={unit || undefined}
          valueSuffix={unit ? ` ${unit}` : undefined}
          {...(hasLimit ? {
            plotLines: [{ value: limit, label: `Limit ${limit}${unit ? ` ${unit}` : ''}`, labelAlign: 'left' as const, dashStyle: 'Dash' }],
            colorMode: 'threshold' as const,
            ranges: above
              ? [{ max: limit, token: 'normal' as const, label: 'Within limit' }, { max: Infinity, token: 'critical' as const, label: 'Above limit' }]
              : [{ max: limit, token: 'critical' as const, label: 'Below limit' }, { max: Infinity, token: 'normal' as const, label: 'Within limit' }],
          } : {})}
        />
      </Chart>
      {hasLimit && (
        <p className="io-muted BodySmallRegular">
          {crossed === 0
            ? `It didn’t go ${word} ${limit}${unit ? ` ${unit}` : ''} in the last 24 hours.`
            : `It went ${word} ${limit}${unit ? ` ${unit}` : ''} in ${crossed} of the last 24 hours.`}
        </p>
      )}
    </section>
  );
}
