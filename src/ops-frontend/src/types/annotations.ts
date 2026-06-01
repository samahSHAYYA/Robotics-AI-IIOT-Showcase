export interface Annotation {
  id: string
  type: 'note' | 'alert-pin' | 'measurement-line' | 'area-highlight'
  x: number  // factory coordinate 0-10
  y: number  // factory coordinate 0-10
  content: string
  author: string
  color: string
  createdAt: string  // ISO timestamp
  // Measurement line endpoint
  endX?: number
  endY?: number
  // Area highlight dimensions
  width?: number
  height?: number
}

export type AnnotationFilter = 'all' | 'note' | 'alert-pin' | 'measurement-line' | 'area-highlight'
