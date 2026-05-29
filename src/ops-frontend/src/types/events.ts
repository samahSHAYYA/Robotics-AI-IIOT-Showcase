export interface IncomingMessage {
  type: 'telemetry' | 'event' | 'prediction' | 'snapshot'
  data: unknown
}
