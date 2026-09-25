import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { colors, fonts } from '@/theme';
import { AppText } from './app-text';
import { Card } from './card';

export interface BarDatum {
  label: string;
  value: number;
  color: string;
}

/** Gráfico de barras con la paleta pastel. Funciona en iOS, Android y web (react-native-svg). */
export function BarChartCard({ title, subtitle, data, testID }: { title: string; subtitle?: string; data: BarDatum[]; testID?: string }) {
  const [width, setWidth] = useState(0);
  // Eje Y con 4 tramos de paso entero (evita etiquetas redondeadas como 1, 2, 3, 5).
  const SECTIONS = 4;
  const step = Math.max(1, Math.ceil((Math.max(0, ...data.map((d) => d.value)) + 1) / SECTIONS));
  const barSpace = width > 0 ? Math.max(12, (width - 60) / data.length) : 30;
  const barWidth = Math.min(38, Math.max(12, barSpace * 0.55));

  return (
    <Card title={title} subtitle={subtitle} testID={testID} style={styles.card}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityLabel={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}
      >
        {width > 0 ? (
          <BarChart
            data={data.map((d) => ({
              value: d.value,
              label: d.label,
              frontColor: d.color,
              topLabelComponent: () => <AppText variant="caption">{d.value > 0 ? d.value : ''}</AppText>,
            }))}
            width={width - 50}
            height={180}
            barWidth={barWidth}
            spacing={Math.max(6, barSpace - barWidth)}
            initialSpacing={10}
            barBorderTopLeftRadius={8}
            barBorderTopRightRadius={8}
            maxValue={step * SECTIONS}
            stepValue={step}
            noOfSections={SECTIONS}
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor={colors.border}
            rulesColor={colors.border}
            rulesType="solid"
            yAxisTextStyle={styles.axis}
            xAxisLabelTextStyle={styles.axisLabel}
            disableScroll
            isAnimated
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexGrow: 1, flexBasis: 320 },
  axis: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 11 },
  axisLabel: { color: colors.textSecondary, fontFamily: fonts.semibold, fontSize: 10, width: 60, marginLeft: -12, textAlign: 'center' },
});

