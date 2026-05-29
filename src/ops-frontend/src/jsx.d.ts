import 'react'

declare module 'react' {
  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    class?: string
  }
  interface SVGAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    class?: string
  }
}
