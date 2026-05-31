export interface ChatRequest {
  message: string
}

export interface ChartSeries {
  name: string
  data: { timestamp: string; value: number }[]
}

export interface ChartConfig {
  title: string
  y_label: string
  series: ChartSeries[]
}

export interface ChatResponse {
  reply: string
  chart: ChartConfig | null
}

export interface InlineChartData {
  chart: true
  type: 'line' | 'bar'
  data: { label: string; value: number }[]
  title: string
}

export interface ChatMessage {
  role: 'user' | 'agent'
  text: string
  ts?: number
  chart?: ChartConfig
  inlineChart?: InlineChartData
}
