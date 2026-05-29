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

export interface ChatMessage {
  role: 'user' | 'agent'
  text: string
  chart?: ChartConfig
}
